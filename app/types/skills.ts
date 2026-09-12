import type { MCPConfig } from '~/lib/services/mcpService';

/**
 * Project build mode. Influences the default sandbox template, recommended
 * skills and how the agent approaches the project.
 */
export type ProjectMode = 'web' | 'mobile' | 'general';

/**
 * Where a skill's files come from.
 * - builtin: shipped with the app, resolved instantly without network access
 * - github: fetched from a public GitHub repository at install time
 */
export type SkillSource =
  | { type: 'builtin'; files: Record<string, string> }
  | { type: 'github'; repo: string; path?: string; ref?: string };

/**
 * A catalog entry for a skill. Catalogs describe what can be installed;
 * resolving an entry produces the actual files/instructions.
 */
export interface SkillDefinition {
  /** Unique slug id, e.g. "web-research" */
  id: string;
  name: string;
  description: string;
  /** Long-form markdown instructions injected into the agent prompt (from SKILL.md body). */
  instructions?: string;
  category: string;
  icon?: string;
  source: SkillSource;
  /** Optional commands executed inside the sandbox after files are written. */
  installCommands?: string[];
  /** Modes this skill is recommended for. */
  recommendedModes?: ProjectMode[];
  /** Files contained in this skill (populated after resolution). Path relative to skill root. */
  files?: Record<string, string>;
  /** Where the skill was resolved from, e.g. GitHub URL (informational). */
  sourceUrl?: string;
}

/**
 * A skill selected for a specific project. Carries the resolved instructions
 * so the chat request can inject them into the agent system prompt without a
 * server round-trip.
 */
export interface SelectedSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  /** Total size of instructions in chars (used for context budgeting). */
  instructionsLength?: number;
}

/**
 * Per-project (per-chat) configuration that persists across sandbox
 * shutdowns and is automatically re-applied whenever a new sandbox is
 * provisioned for the project.
 */
export interface ProjectConfig {
  chatId: string;
  mode: ProjectMode;
  /** Optional starter template name from STARTER_TEMPLATES (web mode). */
  template?: string;
  skills: SelectedSkill[];
  mcps: MCPConfig;
  updatedAt?: number;
}

/**
 * Runtime state of the project's E2B sandbox.
 */
export type SandboxStatus = 'idle' | 'provisioning' | 'ready' | 'error' | 'stopped';

export interface SandboxInfo {
  sandboxId: string;
  status: SandboxStatus;
  template?: string;
  /** Preview hosts keyed by detected/expected port, e.g. { "3000": "3000-abc.e2b.app" } */
  previewHosts?: Record<string, string>;
  /** Skills that were installed into this sandbox. */
  installedSkills?: string[];
  /** Path inside the sandbox where skills live. */
  skillsPath?: string;
  error?: string;
  createdAt?: string;
}

/** Body of POST /api/sandbox/provision */
export interface ProvisionRequest {
  chatId: string;
  mode: ProjectMode;
  template?: string;
  skills: SelectedSkill[];
  mcps?: MCPConfig;
  /** Skill files resolved client-side (from /api/skills/resolve), keyed by skill id. */
  skillFiles?: Record<string, Record<string, string>>;
  installCommands?: Record<string, string[]>;
}

/** Response of POST /api/sandbox/provision */
export interface ProvisionResponse {
  ok: boolean;
  sandbox?: SandboxInfo;
  error?: string;
  /** e.g. "missing-key" | "invalid-key" | "create-failed" | "not-found" */
  errorCode?: 'missing-key' | 'invalid-key' | 'create-failed' | 'not-found' | 'install-failed' | 'unknown';
}

/** Catalog entry as exposed to the browser (builtin file bodies stripped). */
export type CatalogSkill = Omit<SkillDefinition, 'source' | 'files' | 'instructions'> & {
  sourceType: 'builtin' | 'github';
  sourceUrl?: string;
  repo?: string;
  path?: string;
  ref?: string;
  fileCount?: number;
};
