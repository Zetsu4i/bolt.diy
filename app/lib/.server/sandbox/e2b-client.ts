import { Sandbox } from 'e2b';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('e2b-client');

export const SANDBOX_SKILLS_PATH = '/home/user/skills';
export const SANDBOX_PROJECT_CONFIG_PATH = '/home/user/project-config';

/** How long a sandbox stays alive without activity. Refreshed by keepalive calls. */
export const SANDBOX_TIMEOUT_MS = 15 * 60 * 1000;

/** Sandbox template per project mode. Override with env for custom templates. */
export function templateForMode(mode: string | undefined, requestedTemplate?: string): string {
  if (requestedTemplate === 'e2b:base') {
    return 'base';
  }

  switch (mode) {
    case 'web':
      return process.env.E2B_TEMPLATE_WEB || 'base';
    case 'mobile':
      return process.env.E2B_TEMPLATE_MOBILE || process.env.E2B_TEMPLATE_WEB || 'base';
    case 'general':
    default:
      return process.env.E2B_TEMPLATE_GENERAL || 'base';
  }
}

export class E2BError extends Error {
  code: 'missing-key' | 'invalid-key' | 'create-failed' | 'not-found' | 'unknown';
  status: number;

  constructor(message: string, code: E2BError['code'], status = 500) {
    super(message);
    this.name = 'E2BError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Resolves the user's E2B API key. BYOK first (cookie `apiKeys` JSON has an
 * `e2b` entry saved from Settings), then server env fallback. The key is
 * never logged and never returned to the client.
 */
export function resolveE2BKey(apiKeys: Record<string, string> | undefined, serverEnv: unknown): string | undefined {
  const fromCookie = apiKeys?.e2b || apiKeys?.E2B || apiKeys?.E2B_API_KEY;

  if (fromCookie && typeof fromCookie === 'string') {
    return fromCookie.trim();
  }

  const env = (serverEnv ?? {}) as Record<string, string | undefined>;
  const fromEnv = env.E2B_API_KEY || env.E2B_KEY;

  if (fromEnv && typeof fromEnv === 'string') {
    return fromEnv.trim();
  }

  return undefined;
}

function mapSandboxError(error: unknown): E2BError {
  const message = error instanceof Error ? error.message : String(error);

  if (/api ?key|unauthorized|authentication|401/i.test(message)) {
    return new E2BError('Invalid E2B API key. Check Settings → Sandbox (E2B) and update your key.', 'invalid-key', 401);
  }

  if (/timeout|timed out/i.test(message)) {
    return new E2BError('Sandbox creation timed out. Try again in a moment.', 'create-failed', 504);
  }

  return new E2BError(`Sandbox error: ${message}`, 'create-failed', 500);
}

export interface CreateOptions {
  apiKey: string;
  template: string;
  metadata: Record<string, string>;
  timeoutMs?: number;
  envs?: Record<string, string>;
}

export async function createSandbox({ apiKey, template, metadata, timeoutMs, envs }: CreateOptions): Promise<Sandbox> {
  try {
    const sandbox = await Sandbox.create(template, {
      apiKey,
      metadata,
      timeoutMs: timeoutMs ?? SANDBOX_TIMEOUT_MS,
      envs,
    });

    logger.info(`sandbox ${sandbox.sandboxId} created (template=${template})`);

    return sandbox;
  } catch (error) {
    logger.error('sandbox creation failed:', error instanceof Error ? error.message : error);
    throw mapSandboxError(error);
  }
}

export async function connectSandbox(sandboxId: string, apiKey: string): Promise<Sandbox> {
  try {
    return await Sandbox.connect(sandboxId, { apiKey });
  } catch (error) {
    logger.error(`connect to sandbox ${sandboxId} failed:`, error instanceof Error ? error.message : error);
    throw mapSandboxError(error);
  }
}

export async function killSandbox(sandboxId: string, apiKey: string): Promise<boolean> {
  try {
    return await Sandbox.kill(sandboxId, { apiKey });
  } catch (error) {
    // A kill on an already-dead sandbox is a success for our purposes.
    const message = error instanceof Error ? error.message : String(error);

    if (/not found|404/i.test(message)) {
      return true;
    }

    logger.error(`kill sandbox ${sandboxId} failed:`, message);
    throw mapSandboxError(error);
  }
}

export interface ListedSandbox {
  sandboxId: string;
  templateId?: string;
  metadata?: Record<string, string>;
  createdAt?: string;
  running: boolean;
}

/** Lists the user's sandboxes, most recent first (bounded). */
export async function listSandboxes(apiKey: string, limit = 20): Promise<ListedSandbox[]> {
  try {
    const paginator = Sandbox.list({ apiKey, limit });
    const items = await paginator.nextItems();

    return items.slice(0, limit).map((item: any) => ({
      sandboxId: item.sandboxId,
      templateId: item.templateId,
      metadata: item.metadata,
      createdAt: item.startedAt ? new Date(item.startedAt).toISOString() : item.createdAt,
      running: true,
    }));
  } catch (error) {
    logger.error('list sandboxes failed:', error instanceof Error ? error.message : error);
    throw mapSandboxError(error);
  }
}

export interface CommandResultLite {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs a command in the sandbox with bounded output and timeout.
 * The SDK throws CommandExitError on non-zero exit; we normalize that into
 * the result so callers can inspect exit code + stderr.
 */
export async function runCommand(
  sandbox: Sandbox,
  cmd: string,
  options: { cwd?: string; timeoutMs?: number; envs?: Record<string, string> } = {},
): Promise<CommandResultLite> {
  try {
    const result = await sandbox.commands.run(cmd, {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs ?? 120_000,
      envs: options.envs,
    });

    return {
      exitCode: result.exitCode,
      stdout: (result.stdout || '').slice(-8000),
      stderr: (result.stderr || '').slice(-8000),
    };
  } catch (error) {
    // CommandExitError carries the full result (stdout/stderr/exitCode)
    const result = (error as { result?: { exitCode?: number; stdout?: string; stderr?: string } }).result;

    if (result) {
      return {
        exitCode: result.exitCode ?? 1,
        stdout: (result.stdout || '').slice(-8000),
        stderr: (result.stderr || '').slice(-8000),
      };
    }

    throw error;
  }
}

/**
 * Wait until the sandbox reliably executes commands. Freshly created
 * sandboxes occasionally fail their very first command with a transient
 * non-zero exit, so we warm up with retries before installing anything.
 */
export async function waitForSandboxReady(sandbox: Sandbox, attempts = 10, delayMs = 800): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await runCommand(sandbox, 'echo ready', { timeoutMs: 15_000 });

      if (result.exitCode === 0 && result.stdout.includes('ready')) {
        return true;
      }
    } catch {
      // not ready yet — retry
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  logger.warn(`sandbox ${sandbox.sandboxId} readiness check did not confirm; proceeding anyway`);

  return false;
}
