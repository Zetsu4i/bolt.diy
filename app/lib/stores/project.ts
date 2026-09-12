import { create } from 'zustand';
import type { MCPConfig } from '~/lib/services/mcpService';
import { useMCPStore } from '~/lib/stores/mcp';
import type { CatalogSkill, ProjectConfig, ProjectMode, SandboxInfo, SelectedSkill } from '~/types/skills';

const isBrowser = typeof window !== 'undefined';

const CONFIGS_KEY = 'bolt_project_configs';
const SKILL_FILES_KEY = 'bolt_skill_files';
const SANDBOX_KEY_PREFIX = 'bolt_sandbox_';
/** Configs created on the landing page (before a chat id exists) live here. */
export const PENDING_CHAT_ID = '__pending__';

const MAX_CACHED_SKILL_FILES = 24;

type ResolvedFileCache = Record<string, Record<string, string>>;

function readJSON<T>(key: string, fallback: T): T {
  if (!isBrowser) {
    return fallback;
  }

  try {
    const raw = localStorage.getItem(key);

    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (!isBrowser) {
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to persist ${key}:`, error);
  }
}

function emptyConfig(chatId: string): ProjectConfig {
  return {
    chatId,
    mode: 'web',
    template: undefined,
    skills: [],
    mcps: { mcpServers: {} },
    updatedAt: Date.now(),
  };
}

interface ResolvedSkillPayload {
  skill: SelectedSkill;
  files: Record<string, string>;
  installCommands: string[];
  fileCount?: number;
  sourceUrl?: string;
}

type SandboxPhase = SandboxInfo['status'];

interface ProjectStore {
  /** Per-chat project configuration. */
  configs: Record<string, ProjectConfig>;
  /** Chat currently open in the workspace (null on the landing page). */
  activeChatId: string | null;
  /** Skill catalog from /api/skills/catalog. */
  catalog: CatalogSkill[];
  catalogLoading: boolean;
  catalogError: string | null;
  /** Resolved skill files cache (skillId → files), used when provisioning. */
  resolvedFiles: ResolvedFileCache;
  /** Sandbox runtime state for the active chat. */
  sandbox: SandboxInfo | null;
  sandboxPhase: SandboxPhase;
  isProvisioning: boolean;
  provisionError: string | null;
  /** Per-skill resolve/install progress, keyed `chatId:skillId`. */
  busySkills: Record<string, boolean>;

  // ---- lifecycle ----
  initialize: () => Promise<void>;
  setActiveChat: (chatId: string | null) => void;
  /** Moves the pending (landing page) config onto a newly created chat. */
  adoptPendingConfig: (chatId: string) => void;

  // ---- config ----
  getConfig: () => ProjectConfig;
  setMode: (mode: ProjectMode) => void;
  setTemplate: (template?: string) => void;
  addSkillFromCatalog: (id: string) => Promise<void>;
  addSkillFromGitHub: (repo: string, path?: string, ref?: string) => Promise<void>;
  removeSkill: (id: string) => void;
  setProjectMcp: (name: string, server: MCPConfig['mcpServers'][string] | null) => void;
  toggleCatalogMcp: (name: string) => void;

  // ---- sandbox ----
  provision: () => Promise<SandboxInfo | null>;
  stopSandbox: () => Promise<void>;
  keepAlive: () => Promise<void>;
  refreshSandboxStatus: () => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  function persistConfigs(configs: Record<string, ProjectConfig>) {
    set({ configs });
    writeJSON(CONFIGS_KEY, configs);
  }

  function persistSandbox(sandbox: SandboxInfo | null, chatId: string | null) {
    set({ sandbox });

    if (isBrowser) {
      if (sandbox) {
        writeJSON(SANDBOX_KEY_PREFIX + chatId, sandbox);
      } else if (chatId) {
        localStorage.removeItem(SANDBOX_KEY_PREFIX + chatId);
      }
    }
  }

  function cacheResolvedFiles(skillId: string, files: Record<string, string>) {
    const cache = { ...get().resolvedFiles, [skillId]: files };
    const ids = Object.keys(cache);

    // simple size-bounded eviction
    while (ids.length > MAX_CACHED_SKILL_FILES) {
      delete cache[ids.shift() as string];
    }

    set({ resolvedFiles: cache });
    writeJSON(SKILL_FILES_KEY, cache);
  }

  /** Pushes merged (global + project) MCP config to the server so the agent gets the tools. */
  async function syncMcpConfig() {
    const { activeChatId, configs } = get();
    const globalSettings = useMCPStore.getState().settings;
    const projectMcps = (activeChatId ? configs[activeChatId]?.mcps?.mcpServers : undefined) || {};
    const merged: MCPConfig = {
      mcpServers: { ...(globalSettings.mcpConfig?.mcpServers || {}), ...projectMcps },
    };

    // Update the local MCP store so the UI reflects the merged tool set.
    useMCPStore.setState({ settings: { ...globalSettings, mcpConfig: merged } });

    try {
      const response = await fetch('/api/mcp-update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });

      if (response.ok) {
        const serverTools = (await response.json()) as Record<string, unknown>;
        useMCPStore.setState({ serverTools: serverTools as any });
      }
    } catch (error) {
      console.warn('Failed to sync merged MCP config:', error);
    }
  }

  return {
    configs: readJSON<Record<string, ProjectConfig>>(CONFIGS_KEY, {}),
    activeChatId: null,
    catalog: [],
    catalogLoading: false,
    catalogError: null,
    resolvedFiles: readJSON<ResolvedFileCache>(SKILL_FILES_KEY, {}),
    sandbox: null,
    sandboxPhase: 'idle',
    isProvisioning: false,
    provisionError: null,
    busySkills: {},

    initialize: async () => {
      if (get().catalogLoading || get().catalog.length > 0) {
        return;
      }

      set({ catalogLoading: true, catalogError: null });

      try {
        const response = await fetch('/api/skills/catalog');

        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }

        const data = (await response.json()) as { skills: CatalogSkill[] };

        set({ catalog: data.skills || [], catalogLoading: false });
      } catch (error) {
        set({
          catalogLoading: false,
          catalogError: error instanceof Error ? error.message : 'Failed to load skill catalog',
        });
      }

      // keep MCP store initialized too (existing behavior relies on it)
      const mcp = useMCPStore.getState();

      if (!mcp.isInitialized) {
        await mcp.initialize();
      }
    },

    setActiveChat: (chatId) => {
      if (get().activeChatId === chatId) {
        return;
      }

      set((state) => {
        const sandboxForChat = chatId
          ? readJSON<SandboxInfo | null>(SANDBOX_KEY_PREFIX + chatId, null)
          : null;

        return {
          activeChatId: chatId,
          sandbox: sandboxForChat,
          sandboxPhase: sandboxForChat?.status === 'ready' ? 'ready' : 'idle',
          provisionError: null,
        };
      });

      // Re-scope the server MCP config to this chat's project servers.
      syncMcpConfig().catch(() => undefined);
    },

    adoptPendingConfig: (chatId) => {
      const { configs } = get();
      const pending = configs[PENDING_CHAT_ID];

      if (!pending || configs[chatId]) {
        return;
      }

      const migrated = { ...pending, chatId, updatedAt: Date.now() };
      const next = { ...configs };
      delete next[PENDING_CHAT_ID];
      next[chatId] = migrated;
      persistConfigs(next);
      set({ activeChatId: chatId });

      if (migrated.mcps && Object.keys(migrated.mcps.mcpServers || {}).length > 0) {
        syncMcpConfig().catch(() => undefined);
      }
    },

    getConfig: () => {
      const { activeChatId, configs } = get();

      return (
        configs[activeChatId || PENDING_CHAT_ID] ||
        configs[PENDING_CHAT_ID] ||
        emptyConfig(activeChatId || PENDING_CHAT_ID)
      );
    },

    setMode: (mode) => {
      const { activeChatId, configs } = get();
      const key = activeChatId || PENDING_CHAT_ID;
      const current = configs[key] || emptyConfig(key);

      persistConfigs({ ...configs, [key]: { ...current, mode, updatedAt: Date.now() } });
    },

    setTemplate: (template) => {
      const { activeChatId, configs } = get();
      const key = activeChatId || PENDING_CHAT_ID;
      const current = configs[key] || emptyConfig(key);

      persistConfigs({ ...configs, [key]: { ...current, template, updatedAt: Date.now() } });
    },

    addSkillFromCatalog: async (id) => {
      const { activeChatId, configs, catalog, resolvedFiles, busySkills } = get();
      const key = activeChatId || PENDING_CHAT_ID;
      const busyKey = `${key}:${id}`;

      if (busySkills[busyKey]) {
        return;
      }

      const current = configs[key] || emptyConfig(key);

      if (current.skills.some((s) => s.id === id)) {
        return;
      }

      set({ busySkills: { ...busySkills, [busyKey]: true } });

      try {
        // use cached resolution when available
        let payload: ResolvedSkillPayload | null = null;
        const cachedFiles = resolvedFiles[id];

        if (cachedFiles) {
          const def = catalog.find((s) => s.id === id);
          const skillMd = cachedFiles['SKILL.md'] || '';

          payload = {
            skill: {
              id,
              name: def?.name || id,
              description: def?.description || '',
              instructions: extractInstructions(skillMd) || def?.description || '',
            },
            files: cachedFiles,
            installCommands: def?.installCommands || [],
          };
        } else {
          const response = await fetch('/api/skills/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });

          if (!response.ok) {
            const err = (await response.json().catch(() => ({}))) as { error?: string };

            throw new Error(err.error || `Failed to resolve skill (${response.status})`);
          }

          payload = (await response.json()) as ResolvedSkillPayload;
        }

        cacheResolvedFiles(id, payload.files);

        const nextSkills: SelectedSkill[] = [
          ...current.skills,
          { ...payload.skill, instructions: payload.skill.instructions || '' },
        ];

        persistConfigs({
          ...configs,
          [key]: { ...current, skills: nextSkills, updatedAt: Date.now() },
        });
      } finally {
        const nextBusy = { ...get().busySkills };

        delete nextBusy[busyKey];
        set({ busySkills: nextBusy });
      }
    },

    addSkillFromGitHub: async (repo, path, ref) => {
      const { activeChatId, configs, busySkills } = get();
      const key = activeChatId || PENDING_CHAT_ID;
      const tempId = `gh-${(repo + '/' + (path || '')).replace(/[^\w.-]+/g, '-').toLowerCase()}`;
      const busyKey = `${key}:${tempId}`;

      if (busySkills[busyKey]) {
        return;
      }

      const current = configs[key] || emptyConfig(key);

      if (current.skills.some((s) => s.id === tempId)) {
        throw new Error('This skill is already installed in the project');
      }

      set({ busySkills: { ...busySkills, [busyKey]: true } });

      try {
        const response = await fetch('/api/skills/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo, path, ref }),
        });

        if (!response.ok) {
          const err = (await response.json().catch(() => ({}))) as { error?: string };

          throw new Error(err.error || `Failed to resolve skill from ${repo} (${response.status})`);
        }

        const payload = (await response.json()) as ResolvedSkillPayload;

        cacheResolvedFiles(payload.skill.id, payload.files);
        persistConfigs({
          ...configs,
          [key]: {
            ...current,
            skills: [...current.skills, { ...payload.skill, instructions: payload.skill.instructions || '' }],
            updatedAt: Date.now(),
          },
        });
      } finally {
        const nextBusy = { ...get().busySkills };

        delete nextBusy[busyKey];
        set({ busySkills: nextBusy });
      }
    },

    removeSkill: (id) => {
      const { activeChatId, configs } = get();
      const key = activeChatId || PENDING_CHAT_ID;
      const current = configs[key] || emptyConfig(key);

      persistConfigs({
        ...configs,
        [key]: { ...current, skills: current.skills.filter((s) => s.id !== id), updatedAt: Date.now() },
      });
    },

    setProjectMcp: (name, server) => {
      const { activeChatId, configs } = get();
      const key = activeChatId || PENDING_CHAT_ID;
      const current = configs[key] || emptyConfig(key);
      const servers = { ...(current.mcps?.mcpServers || {}) };

      if (server) {
        servers[name] = server;
      } else {
        delete servers[name];
      }

      persistConfigs({
        ...configs,
        [key]: { ...current, mcps: { mcpServers: servers }, updatedAt: Date.now() },
      });

      syncMcpConfig().catch(() => undefined);
    },

    toggleCatalogMcp: (name) => {
      const { activeChatId, configs } = get();
      const globalServers = useMCPStore.getState().settings.mcpConfig?.mcpServers || {};
      const key = activeChatId || PENDING_CHAT_ID;
      const current = configs[key] || emptyConfig(key);
      const servers = { ...(current.mcps?.mcpServers || {}) };

      if (servers[name]) {
        delete servers[name];
      } else if (globalServers[name]) {
        servers[name] = globalServers[name];
      } else {
        return;
      }

      persistConfigs({
        ...configs,
        [key]: { ...current, mcps: { mcpServers: servers }, updatedAt: Date.now() },
      });

      syncMcpConfig().catch(() => undefined);
    },

    provision: async () => {
      const { activeChatId, configs, resolvedFiles, isProvisioning, sandboxPhase } = get();

      if (isProvisioning || sandboxPhase === 'provisioning') {
        return null;
      }

      const chatId = activeChatId;

      if (!chatId || chatId === PENDING_CHAT_ID) {
        return null; // cannot provision before the project exists
      }

      const config = configs[chatId] || emptyConfig(chatId);

      if (config.skills.length === 0 && Object.keys(config.mcps?.mcpServers || {}).length === 0) {
        return null; // nothing to install
      }

      set({ isProvisioning: true, sandboxPhase: 'provisioning', provisionError: null });

      try {
        const skillFiles: Record<string, Record<string, string>> = {};
        const installCommands: Record<string, string[]> = {};
        const catalog = get().catalog;

        for (const skill of config.skills) {
          if (resolvedFiles[skill.id]) {
            skillFiles[skill.id] = resolvedFiles[skill.id];
          }

          const def = catalog.find((s) => s.id === skill.id);

          if (def?.installCommands?.length) {
            installCommands[skill.id] = def.installCommands;
          }
        }

        const response = await fetch('/api/sandbox/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId,
            mode: config.mode,
            template: config.template,
            skills: config.skills,
            mcps: config.mcps,
            skillFiles,
            installCommands,
          }),
        });

        const data = (await response.json()) as { ok: boolean; sandbox?: SandboxInfo; error?: string };

        if (!data.ok || !data.sandbox) {
          throw new Error(data.error || 'Sandbox provisioning failed');
        }

        persistSandbox(data.sandbox, chatId);
        set({ sandboxPhase: 'ready', sandbox: data.sandbox });

        return data.sandbox;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sandbox provisioning failed';

        set({ sandboxPhase: 'error', provisionError: message });

        return null;
      } finally {
        set({ isProvisioning: false });
      }
    },

    stopSandbox: async () => {
      const { sandbox, activeChatId } = get();

      set({ sandboxPhase: 'stopped' });

      if (!sandbox?.sandboxId) {
        persistSandbox(null, activeChatId);

        return;
      }

      try {
        await fetch('/api/sandbox/kill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sandboxId: sandbox.sandboxId, chatId: activeChatId }),
        });
      } catch {
        // sandbox will time out on its own if the kill request fails
      }

      persistSandbox(null, activeChatId);
      set({ sandbox: null, sandboxPhase: 'idle' });
    },

    keepAlive: async () => {
      const { sandbox } = get();

      if (!sandbox?.sandboxId || get().sandboxPhase !== 'ready') {
        return;
      }

      try {
        const response = await fetch('/api/sandbox/keepalive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sandboxId: sandbox.sandboxId }),
        });

        const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };

        if (data.ok === false && /no longer running/i.test(data.error || '')) {
          set({ sandboxPhase: 'stopped', sandbox: null });

          if (activeChatSafe(get)) {
            persistSandbox(null, get().activeChatId);
          }
        }
      } catch {
        // transient network errors are fine; the next tick retries
      }
    },

    refreshSandboxStatus: async () => {
      const { activeChatId, sandbox } = get();

      if (!sandbox?.sandboxId) {
        return;
      }

      try {
        const response = await fetch(`/api/sandbox/status${activeChatId ? `?chatId=${encodeURIComponent(activeChatId)}` : ''}`);

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          ok: boolean;
          hasKey: boolean;
          sandboxes: Array<{ sandboxId: string }>;
        };

        const stillRunning = data.sandboxes.some((s) => s.sandboxId === sandbox.sandboxId);

        if (data.hasKey && !stillRunning && data.ok) {
          set({ sandboxPhase: 'stopped' });
          persistSandbox(null, activeChatId);
        }
      } catch {
        // ignore
      }
    },
  };
});

function activeChatSafe(get: () => ProjectStore): string | null {
  return get().activeChatId;
}

function extractInstructions(skillMd: string): string {
  const match = skillMd.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);

  return match ? match[1].trim() : skillMd.trim();
}

/**
 * Selector helper: the effective project config for the given chat
 * (falls back to the pending config so landing-page selections are not lost).
 */
export function useActiveProjectConfig(): ProjectConfig {
  const activeChatId = useProjectStore((s) => s.activeChatId);
  const configs = useProjectStore((s) => s.configs);

  return configs[activeChatId || PENDING_CHAT_ID] || emptyConfig(activeChatId || PENDING_CHAT_ID);
}
