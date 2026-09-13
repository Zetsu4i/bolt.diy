import { memo, useState } from 'react';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { classNames } from '~/utils/classNames';
import {
  DEFAULT_AGENT_SETTINGS,
  resetAgentSettings,
  updateAgentSettings,
  useAgentSettings,
} from '~/lib/stores/agent-settings';

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-bolt-elements-background-depth-2 p-4">
      <div className="mb-3">
        <h4 className="font-medium text-bolt-elements-textPrimary">{title}</h4>

        {description && <p className="mt-1 text-xs text-bolt-elements-textSecondary">{description}</p>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  enabled,
  onChange,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-bolt-elements-textPrimary">{label}</div>
        <div className="text-xs text-bolt-elements-textSecondary">{hint}</div>
      </div>
      <Switch checked={enabled} onCheckedChange={onChange} />
    </div>
  );
}

export const AgentTab = memo(() => {
  const settings = useAgentSettings();
  const { debug, enableDebugMode } = useSettings();
  const [planningModelInput, setPlanningModelInput] = useState(settings.planningModel);

  const update = (patch: Parameters<typeof updateAgentSettings>[0]) => updateAgentSettings(patch);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-bolt-elements-background-depth-2 p-4">
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Agent &amp; AI</h3>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          Control how the AI works: agentic pipelines (plan → implement → verify), self-correction, prompting for
          smaller models, and debug mode. Defaults are safe and everything is optional.
        </p>
      </div>

      <SectionCard
        title="Agent Pipeline"
        description="Instead of a single LLM call, requests run as an agent: an optional planning pass first (writes PROJECT_PLAN.md), then the implementation, then an optional verification pass that detects and fixes errors."
      >
        <ToggleRow
          label="Agent mode"
          hint="Run the multi-step agent pipeline for coding requests (falls back to the classic single-call mode when off)."
          enabled={settings.agentMode}
          onChange={(enabled) => update({ agentMode: enabled })}
        />
        <ToggleRow
          label="Plan first (PROJECT_PLAN.md)"
          hint="Start with a dedicated planning pass and write the plan to PROJECT_PLAN.md in your project."
          enabled={settings.planFirst}
          onChange={(enabled) => update({ planFirst: enabled })}
        />
        <ToggleRow
          label="Self-correct (verify & fix)"
          hint="After each implementation, a reviewer pass checks the work and the agent automatically fixes reported issues."
          enabled={settings.selfCorrect}
          onChange={(enabled) => update({ selfCorrect: enabled })}
        />
        <ToggleRow
          label="Auto-fix runtime errors"
          hint="When the preview or terminal reports an error, automatically send it back to the agent (bounded attempts)."
          enabled={settings.autoFixErrors}
          onChange={(enabled) => update({ autoFixErrors: enabled })}
        />

        <div className="mt-1 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-bolt-elements-textPrimary" htmlFor="planning-model">
              Planning model (optional)
            </label>
            <p className="mb-1 text-xs text-bolt-elements-textSecondary">
              Use a (reasoning) model for the planning pass. Format: <code>Provider::Model</code>, e.g.{' '}
              <code>Google::gemini-2.5-pro</code>. Empty = same model as the chat.
            </p>
            <input
              id="planning-model"
              value={planningModelInput}
              onChange={(e) => setPlanningModelInput(e.target.value)}
              onBlur={() => update({ planningModel: planningModelInput.trim() })}
              placeholder="Google::gemini-2.5-pro"
              className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-item-contentAccent"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-bolt-elements-textPrimary" htmlFor="max-fix-attempts">
              Max self-correction attempts
            </label>
            <p className="mb-1 text-xs text-bolt-elements-textSecondary">
              Upper bound for automatic fix passes per request (1–3).
            </p>
            <select
              id="max-fix-attempts"
              value={settings.maxFixAttempts}
              onChange={(e) => update({ maxFixAttempts: Number(e.target.value) })}
              className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-item-contentAccent"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Prompting for smaller models"
        description="Smaller / cheaper models (gpt-4.1, mini/flash/haiku variants, local models) get stricter, more explicit formatting rules which measurably reduce broken artifacts."
      >
        <div>
          <label className="text-sm font-medium text-bolt-elements-textPrimary" htmlFor="small-model-prompts">
            Small-model prompt rules
          </label>
          <p className="mb-1 text-xs text-bolt-elements-textSecondary">
            "Auto" enables them when a small model is detected; "On"/"Off" force the behaviour.
          </p>
          <select
            id="small-model-prompts"
            value={settings.smallModelPrompts}
            onChange={(e) => update({ smallModelPrompts: e.target.value as 'auto' | 'on' | 'off' })}
            className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-item-contentAccent"
          >
            <option value="auto">Auto (detect small models)</option>
            <option value="on">Always on</option>
            <option value="off">Always off</option>
          </select>
        </div>
      </SectionCard>

      <SectionCard
        title="Debug & Diagnostics"
        description="Enable verbose debug logging (event logs capture additional provider and streaming detail)."
      >
        <ToggleRow
          label="Debug mode"
          hint="Enables debug-level logging and the debug panel in the header."
          enabled={debug}
          onChange={(enabled) => enableDebugMode(enabled)}
        />
      </SectionCard>

      <div className="flex items-center justify-between">
        <p className="text-xs text-bolt-elements-textSecondary">
          Settings are stored locally in your browser and applied to new requests immediately.
        </p>

        <button
          onClick={() => {
            resetAgentSettings();
            setPlanningModelInput(DEFAULT_AGENT_SETTINGS.planningModel);
          }}
          className={classNames(
            'rounded-md px-3 py-1.5 text-sm font-medium',
            'bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover',
            'text-bolt-elements-button-secondary-text',
          )}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
});
