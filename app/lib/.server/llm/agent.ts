import { generateId } from 'ai';
import { streamText, type Messages, type StreamingOptions } from './stream-text';
import type { FileMap } from './constants';
import type { IProviderSetting } from '~/types/model';
import type { DesignScheme } from '~/types/design-scheme';
import type { SelectedSkill, SandboxInfo } from '~/types/skills';
import { createScopedLogger } from '~/utils/logger';
import {
  PLANNING_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  buildFixUserMessage,
  buildReviewUserMessage,
  isSmallModel,
} from '~/lib/common/prompts/agent';

const logger = createScopedLogger('agent');

/**
 * Configuration for the agent pipeline. All fields optional with safe defaults.
 */
export interface AgentSettings {
  /** Master switch for the agent pipeline (planner → implementer → verifier). */
  agentMode?: boolean;
  /** Run a dedicated planning pass first and write PROJECT_PLAN.md. */
  planFirst?: boolean;
  /** Run a verification pass after implementation and auto-fix found issues. */
  selfCorrect?: boolean;
  /**
   * Optional model override for the planning pass, formatted as
   * "Provider::Model" (e.g. "Google::gemini-2.5-pro"). Empty = use the
   * chat's current model.
   */
  planningModel?: string;
  /** Max number of self-correction fix passes (1..3). */
  maxFixAttempts?: number;
  /** When to append the strict small-model formatting rules. */
  smallModelPrompts?: 'auto' | 'on' | 'off';
}

const DEFAULT_MAX_FIX_ATTEMPTS = 1;

type DataStreamWriterLike = {
  write: (data: any) => void;
  writeData: (value: any) => void;
};

/**
 * Runs the full agent pipeline for a chat turn and merges everything into the
 * data stream:
 *
 *   1. PLANNING   (optional) dedicated planner pass → plan streamed to the
 *                 client as a PROJECT_PLAN.md artifact.
 *   2. IMPLEMENT  the normal coding pass (existing streamText pipeline,
 *                 augmented with the plan + agent workflow rules).
 *   3. VERIFY     (optional) reviewer pass; if it reports fixable problems,
 *                 bounded fix passes are merged into the same message.
 *
 * The implementation phase reuses the existing `streamText` server wrapper,
 * its options (MCP tools, token continuation, usage tracking) and therefore
 * changes nothing about the non-agent path.
 */
export async function runAgentPipeline(props: {
  messages: Messages;
  env?: Env;
  options: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
  chatMode?: 'discuss' | 'build';
  designScheme?: DesignScheme;
  projectSkills?: SelectedSkill[];
  sandboxInfo?: Pick<SandboxInfo, 'sandboxId' | 'previewHosts' | 'installedSkills'> | null;
  knowledgeDocs?: { name: string; content: string }[];
  agentSettings: AgentSettings;
  dataStream: DataStreamWriterLike;
  /** Aborts auxiliary phases when the client disconnects. */
  signal?: AbortSignal;
  /** Progress counter reference shared with api.chat annotations. */
  progressCounter: { value: number };
}) {
  const {
    messages,
    env,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
    messageSliceId,
    chatMode,
    designScheme,
    projectSkills,
    sandboxInfo,
    knowledgeDocs,
    agentSettings,
    dataStream,
    signal,
    progressCounter,
  } = props;

  const workingMessages: Messages = [...messages];
  const modelInfo = resolveModelFromMessages(workingMessages);
  const maxFixAttempts = Math.min(Math.max(agentSettings.maxFixAttempts ?? DEFAULT_MAX_FIX_ATTEMPTS, 1), 3);
  const smallModelMode =
    agentSettings.smallModelPrompts === 'on' ||
    (agentSettings.smallModelPrompts !== 'off' && isSmallModel(modelInfo.model));

  logger.info(
    `Agent pipeline started (model=${modelInfo.provider}/${modelInfo.model}, planFirst=${!!agentSettings.planFirst}, selfCorrect=${!!agentSettings.selfCorrect}, smallModelMode=${smallModelMode})`,
  );

  const aborted = () => signal?.aborted === true;

  const writeProgress = (status: 'in-progress' | 'complete', message: string, label: string) => {
    try {
      dataStream.writeData({
        type: 'progress',
        label,
        status,
        order: progressCounter.value++,
        message,
      });
    } catch {
      // Client may have disconnected; never crash the pipeline on annotation.
    }
  };

  /*
   * ------------------------------------------------------------------
   * PHASE 1 — PLANNING
   * ------------------------------------------------------------------
   */
  let plan: string | undefined;

  if (agentSettings.planFirst) {
    writeProgress('in-progress', 'Creating Project Plan', 'planning');

    try {
      const planningMessages = withModelMeta(workingMessages, agentSettings.planningModel);

      const planResult = await streamText({
        messages: planningMessages,
        env,
        options: {},
        apiKeys,
        files,
        providerSettings,
        promptId,
        contextOptimization: false,
        chatMode: 'build',
        designScheme,
        projectSkills,
        sandboxInfo,
        systemPromptOverride: PLANNING_SYSTEM_PROMPT,
      });

      plan = '';

      for await (const delta of planResult.textStream) {
        plan += delta;

        if (aborted()) {
          break;
        }
      }

      plan = plan.trim();

      if (!plan || aborted()) {
        logger.warn('Planning pass produced no plan — continuing without one.');
        plan = undefined;
      }
    } catch (error) {
      // Planning is best-effort: never break the chat because of it.
      logger.error('Planning pass failed — continuing without a plan:', error);
      plan = undefined;
    }

    if (plan) {
      // Stream the plan to the client as a normal PROJECT_PLAN.md artifact so
      // it shows up in the workbench file tree and can be edited by the user.
      const planArtifact = buildPlanArtifact(plan);
      streamTextToDataStream(dataStream, planArtifact);
    }

    writeProgress('complete', 'Project Plan Ready', 'planning');
  }

  /*
   * ------------------------------------------------------------------
   * PHASE 2 — IMPLEMENT (+ subsequent self-correction passes)
   * ------------------------------------------------------------------
   */
  const implMessages: Messages = [...workingMessages];

  // Accumulates the text produced by the current implementation pass (across
  // max-token continuations and tool-call steps) so the verifier can review
  // the model's latest output.
  const implTextHolder = { text: '' };

  let attempt = 0;

  while (true) {
    attempt += 1;

    writeProgress(
      'in-progress',
      attempt === 1 ? 'Implementing Plan' : `Self-Correction Pass ${attempt - 1}`,
      attempt === 1 ? 'response' : 'self-correct',
    );

    const implDone = createDeferred<void>();

    const implOptions: StreamingOptions = {
      ...options,
      onFinish: async (event: any) => {
        if (typeof event?.text === 'string') {
          implTextHolder.text += event.text;
        }

        try {
          const original = (options as any)?.onFinish?.(event);

          if (original instanceof Promise) {
            await original;
          }
        } catch (error) {
          logger.error('Original onFinish failed:', error);
        }

        if (event?.finishReason !== 'length') {
          implDone.resolve();
        }
      },
    };

    const implResult = await streamText({
      messages: implMessages,
      env,
      options: implOptions,
      apiKeys,
      files,
      providerSettings,
      promptId,
      contextOptimization,
      contextFiles,
      summary,
      messageSliceId,
      chatMode,
      designScheme,
      projectSkills,
      sandboxInfo,
      knowledgeDocs,
      implementationPlan: plan,
      agentWorkflow: true,
      smallModelMode,
    });

    implResult.mergeIntoDataStream(dataStream as any);

    // Wait for the implementation stream (incl. max-token continuations) to
    // finish, or bail out if the client went away.
    await Promise.race([
      implDone.promise,
      new Promise<void>((resolve) => {
        if (signal) {
          signal.addEventListener('abort', () => resolve(), { once: true });
        } else {
          setTimeout(resolve, 5 * 60 * 1000);
        }
      }),
    ]);

    if (aborted() || !agentSettings.selfCorrect || attempt > maxFixAttempts) {
      break;
    }

    /*
     * ----------------------------------------------------------------
     * PHASE 3 — VERIFY (self-correction)
     * ----------------------------------------------------------------
     */
    const lastAssistantText = implTextHolder.text;

    writeProgress('in-progress', 'Verifying Implementation', 'review');

    let reviewText = '';

    try {
      const reviewMessages: Messages = [
        ...implMessages,
        { id: generateId(), role: 'assistant', content: lastAssistantText },
        {
          id: generateId(),
          role: 'user',
          content: buildReviewUserMessage({
            request: extractRequestText(workingMessages),
            plan,
            response: lastAssistantText,
          }),
        },
      ];

      const reviewResult = await streamText({
        messages: reviewMessages,
        env,
        options: {},
        apiKeys,
        files,
        providerSettings,
        promptId,
        contextOptimization: false,
        chatMode: 'build',
        designScheme,
        projectSkills,
        sandboxInfo,
        systemPromptOverride: REVIEW_SYSTEM_PROMPT,
      });

      for await (const delta of reviewResult.textStream) {
        reviewText += delta;

        if (aborted()) {
          break;
        }
      }
    } catch (error) {
      logger.error('Review pass failed — skipping self-correction:', error);
    }

    const findings = parseReviewFindings(reviewText);

    if (!findings) {
      writeProgress('complete', 'Verification Passed', 'review');
      break;
    }

    writeProgress('complete', `Issues Found (${findings.split('\n').length})`, 'review');

    if (aborted() || attempt >= maxFixAttempts + 1) {
      break;
    }

    // Seed the fix pass: the model must see its own previous output plus the
    // findings, then produce corrected files.
    implMessages.push({ id: generateId(), role: 'assistant', content: lastAssistantText });
    implTextHolder.text = ''; // reset accumulator for the fix pass
    implMessages.push({
      id: generateId(),
      role: 'user',
      content: `[Model: ${modelInfo.model}]\n\n[Provider: ${modelInfo.provider}]\n\n${buildFixUserMessage(findings)}`,
    });
  }

  logger.info(`Agent pipeline finished after ${attempt} implementation pass(es).`);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

function resolveModelFromMessages(messages: Messages): { provider: string; model: string } {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const content = lastUser?.content || '';
  const modelMatch = content.match(/\[Model: ([^\]]+)\]/)?.[1];
  const providerMatch = content.match(/\[Provider: ([^\]]+)\]/)?.[1];

  return { model: modelMatch || '', provider: providerMatch || '' };
}

/**
 * Replaces (or injects) the `[Model: ...]` / `[Provider: ...]` metadata prefix
 * on the last user message, so auxiliary passes can target a different model
 * (e.g. a reasoning model for planning).
 */
function withModelMeta(messages: Messages, planningModel?: string): Messages {
  if (!planningModel) {
    return messages;
  }

  const separatorIndex = planningModel.indexOf('::');
  const provider = separatorIndex >= 0 ? planningModel.slice(0, separatorIndex).trim() : '';
  const model = separatorIndex >= 0 ? planningModel.slice(separatorIndex + 2).trim() : planningModel.trim();

  if (!model) {
    return messages;
  }

  const meta = `[Model: ${model}]\n\n[Provider: ${provider || 'Any'}]\n\n`;
  const result: Messages = [...messages];
  const lastUserIndex = result.map((m) => m.role).lastIndexOf('user');

  if (lastUserIndex === -1) {
    return result;
  }

  const original = result[lastUserIndex];
  const stripped = original.content
    .replace(/^\[Model: [^\]]*\]\n\n?/, '')
    .replace(/^\[Provider: [^\]]*\]\n\n?/, '');

  result[lastUserIndex] = { ...original, content: `${meta}${stripped}` };

  return result;
}

function extractRequestText(messages: Messages): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');

  if (!lastUser) {
    return '';
  }

  return lastUser.content
    .replace(/^\[Model: [^\]]*\]\n\n?/, '')
    .replace(/^\[Provider: [^\]]*\]\n\n?/, '')
    .slice(0, 4000);
}

/**
 * Extracts the fix list from the reviewer output. Returns undefined when the
 * reviewer found no actionable issues.
 */
function parseReviewFindings(reviewText: string): string | undefined {
  const text = (reviewText || '').trim();

  if (!text) {
    return undefined;
  }

  if (/NO_ISSUES/i.test(text) && !/FIX_REQUIRED/i.test(text)) {
    return undefined;
  }

  const match = text.match(/FIX_REQUIRED([\s\S]*)/i);

  if (!match) {
    return undefined;
  }

  const findings = match[1].trim();

  return findings.length > 0 ? findings : undefined;
}

function buildPlanArtifact(plan: string): string {
  const safePlan = plan.replace(/<\/boltAction>/g, '').replace(/<\/boltArtifact>/g, '');

  return `<boltArtifact id="project-plan" title="Project Plan">
<boltAction type="file" filePath="PROJECT_PLAN.md">
${safePlan}
</boltAction>
</boltArtifact>

`;
}

/** Writes plain text into the data stream using the raw text-part protocol. */
function streamTextToDataStream(dataStream: DataStreamWriterLike, text: string) {
  const CHUNK_SIZE = 512;

  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    const chunk = text.slice(i, i + CHUNK_SIZE);

    try {
      dataStream.write(`0:${JSON.stringify(chunk)}\n`);
    } catch {
      // Client disconnected mid-plan; ignore.
      break;
    }
  }
}
