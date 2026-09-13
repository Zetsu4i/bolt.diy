import { atom, computed } from 'nanostores';
import { useStore } from '@nanostores/react';
import { isSmallModel } from '~/lib/common/prompts/agent';

/**
 * Client-side agent pipeline settings (planner → implementer → verifier).
 * Persisted to localStorage so they survive reloads.
 */
export interface AgentSettingsState {
  /** Master switch for the agent pipeline. */
  agentMode: boolean;
  /** Run a planning pass first and write PROJECT_PLAN.md. */
  planFirst: boolean;
  /** Verify the implementation and auto-fix reported issues. */
  selfCorrect: boolean;
  /**
   * Optional model override for the planning pass, in "Provider::Model"
   * format. Empty string = use the chat's current model.
   */
  planningModel: string;
  /** Max self-correction fix passes (1..3). */
  maxFixAttempts: number;
  /** When to append the strict small-model formatting rules. */
  smallModelPrompts: 'auto' | 'on' | 'off';
  /** Automatically send preview/terminal errors back to the agent for fixing. */
  autoFixErrors: boolean;
}

const STORAGE_KEY = 'bolt_agent_settings';

export const DEFAULT_AGENT_SETTINGS: AgentSettingsState = {
  agentMode: true,
  planFirst: true,
  selfCorrect: true,
  planningModel: '',
  maxFixAttempts: 1,
  smallModelPrompts: 'auto',
  autoFixErrors: true,
};

function loadInitialSettings(): AgentSettingsState {
  if (typeof window === 'undefined') {
    return DEFAULT_AGENT_SETTINGS;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return DEFAULT_AGENT_SETTINGS;
    }

    const parsed = JSON.parse(raw);

    return { ...DEFAULT_AGENT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_AGENT_SETTINGS;
  }
}

export const agentSettingsStore = atom<AgentSettingsState>(loadInitialSettings());

/** The agent pipeline only truly applies when the master switch is on. */
export const agentPipelineActive = computed(agentSettingsStore, (settings) => settings.agentMode);

export function updateAgentSettings(patch: Partial<AgentSettingsState>) {
  const next = { ...agentSettingsStore.get(), ...patch };

  agentSettingsStore.set(next);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full/unavailable — settings still apply for this session.
  }
}

export function resetAgentSettings() {
  agentSettingsStore.set(DEFAULT_AGENT_SETTINGS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_AGENT_SETTINGS));
  } catch {
    // Ignore.
  }
}

/** React hook for reading the current agent settings. */
export function useAgentSettings(): AgentSettingsState {
  return useStore(agentSettingsStore);
}

export { isSmallModel };
