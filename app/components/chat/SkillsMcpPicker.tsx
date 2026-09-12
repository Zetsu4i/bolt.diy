import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Dialog, DialogButton, DialogClose, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { IconButton } from '~/components/ui/IconButton';
import { Switch } from '~/components/ui/Switch';
import { useProjectStore, PENDING_CHAT_ID } from '~/lib/stores/project';
import { useMCPStore } from '~/lib/stores/mcp';
import type { CatalogSkill, ProjectMode } from '~/types/skills';

const MODES: Array<{ id: ProjectMode; label: string; hint: string; icon: string }> = [
  { id: 'web', label: 'Web', hint: 'Websites & web apps (Vite, React, Next.js)', icon: 'i-ph:browser' },
  { id: 'mobile', label: 'Mobile', hint: 'Mobile apps (Expo / React Native)', icon: 'i-ph:device-mobile' },
  { id: 'general', label: 'General', hint: 'Unrestricted general-purpose environment', icon: 'i-ph:terminal-window' },
];

interface SkillsMcpPickerProps {
  /** Where the dialog was opened from (only affects the title). */
  source?: 'composer' | 'landing' | 'settings';
  trigger?: (props: { onClick: () => void }) => React.ReactNode;
}

export function SkillsMcpPicker({ source = 'composer', trigger }: SkillsMcpPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'skills' | 'mcps'>('skills');

  const catalog = useProjectStore((s) => s.catalog);
  const catalogLoading = useProjectStore((s) => s.catalogLoading);
  const catalogError = useProjectStore((s) => s.catalogError);
  const initialize = useProjectStore((s) => s.initialize);
  const configs = useProjectStore((s) => s.configs);
  const activeChatId = useProjectStore((s) => s.activeChatId);
  const busySkills = useProjectStore((s) => s.busySkills);
  const sandboxPhase = useProjectStore((s) => s.sandboxPhase);
  const addSkillFromCatalog = useProjectStore((s) => s.addSkillFromCatalog);
  const addSkillFromGitHub = useProjectStore((s) => s.addSkillFromGitHub);
  const removeSkill = useProjectStore((s) => s.removeSkill);
  const setMode = useProjectStore((s) => s.setMode);
  const setProjectMcp = useProjectStore((s) => s.setProjectMcp);
  const toggleCatalogMcp = useProjectStore((s) => s.toggleCatalogMcp);

  const mcpInitialized = useMCPStore((s) => s.isInitialized);
  const mcpInitialize = useMCPStore((s) => s.initialize);
  const globalMcpServers = useMCPStore((s) => s.settings.mcpConfig?.mcpServers || {});

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [showGithubForm, setShowGithubForm] = useState(false);
  const [githubRepo, setGithubRepo] = useState('');
  const [githubPath, setGithubPath] = useState('');
  const [githubRef, setGithubRef] = useState('');
  const [customMcpName, setCustomMcpName] = useState('');
  const [customMcpType, setCustomMcpType] = useState<'sse' | 'streamable-http' | 'stdio'>('streamable-http');
  const [customMcpUrl, setCustomMcpUrl] = useState('');
  const [customMcpCommand, setCustomMcpCommand] = useState('');

  const configKey = activeChatId || PENDING_CHAT_ID;
  const config = configs[configKey];

  useEffect(() => {
    if (open) {
      initialize();

      if (!mcpInitialized) {
        mcpInitialize();
      }
    }
  }, [open, initialize, mcpInitialized, mcpInitialize]);

  const categories = useMemo(() => ['all', ...new Set(catalog.map((s) => s.category))], [catalog]);

  const mode = config?.mode || 'web';

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();

    return catalog
      .filter((skill) => (category === 'all' ? true : skill.category === category))
      .filter((skill) =>
        query ? skill.name.toLowerCase().includes(query) || skill.description.toLowerCase().includes(query) : true,
      )
      .sort((a, b) => {
        const aRec = a.recommendedModes?.includes(mode) ? 1 : 0;
        const bRec = b.recommendedModes?.includes(mode) ? 1 : 0;

        return bRec - aRec;
      });
  }, [catalog, search, category, mode]);

  const installedSkills = config?.skills || [];
  const projectMcps = config?.mcps?.mcpServers || {};
  const globalServerNames = Object.keys(globalMcpServers);

  const handleInstall = async (skill: CatalogSkill) => {
    try {
      await addSkillFromCatalog(skill.id);
      toast.success(`${skill.name} installed for this project`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to install skill');
    }
  };

  const handleGithubAdd = async () => {
    if (!githubRepo.trim()) {
      return;
    }

    try {
      await addSkillFromGitHub(githubRepo.trim(), githubPath.trim() || undefined, githubRef.trim() || undefined);
      toast.success('Skill installed from GitHub');
      setGithubRepo('');
      setGithubPath('');
      setGithubRef('');
      setShowGithubForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to install skill from GitHub');
    }
  };

  const handleAddCustomMcp = () => {
    const name = customMcpName.trim();

    if (!name) {
      return;
    }

    if (customMcpType === 'stdio') {
      if (!customMcpCommand.trim()) {
        toast.error('Command is required for stdio servers');
        return;
      }

      const parts = customMcpCommand.trim().split(/\s+/);
      setProjectMcp(name, { type: 'stdio', command: parts[0], args: parts.slice(1) });
    } else {
      if (!customMcpUrl.trim()) {
        toast.error('URL is required');

        return;
      }

      setProjectMcp(name, {
        type: customMcpType,
        url: customMcpUrl.trim(),
      } as any);
    }

    setCustomMcpName('');
    setCustomMcpUrl('');
    setCustomMcpCommand('');
    toast.success(`MCP server "${name}" connected to project`);
  };

  const title =
    source === 'landing'
      ? 'Customize your new project'
      : source === 'settings'
        ? 'Project skills & MCP servers'
        : 'Project skills & MCPs';

  const picker = (
    <DialogRoot open={open} onOpenChange={(x) => setOpen(x)}>
      {trigger ? (
        trigger({ onClick: () => setOpen(true) })
      ) : (
        <IconButton title={title} onClick={() => setOpen(true)} className="transition-all">
          <div className="i-ph:puzzle-piece text-xl" />
        </IconButton>
      )}

      {open && (
        <Dialog className="max-w-[860px] w-[min(92vw,860px)]">
          <div className="flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between gap-4 border-b border-bolt-elements-borderColor px-6 py-4">
              <DialogTitle>
                <div className="i-ph:puzzle-piece text-xl" />
                {title}
              </DialogTitle>
              <div className="flex items-center gap-1 rounded-lg bg-bolt-elements-background-depth-3 p-1">
                <button
                  className={classNames(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                    tab === 'skills'
                      ? 'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary shadow-sm'
                      : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                  )}
                  onClick={() => setTab('skills')}
                >
                  <div className="i-ph:puzzle-piece text-sm" />
                  Skills
                  {installedSkills.length > 0 && (
                    <span className="rounded-full bg-accent-500/20 px-1.5 text-[10px] text-accent-500">
                      {installedSkills.length}
                    </span>
                  )}
                </button>
                <button
                  className={classNames(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                    tab === 'mcps'
                      ? 'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary shadow-sm'
                      : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                  )}
                  onClick={() => setTab('mcps')}
                >
                  <div className="i-bolt:mcp text-sm" />
                  MCP Servers
                  {Object.keys(projectMcps).length > 0 && (
                    <span className="rounded-full bg-accent-500/20 px-1.5 text-[10px] text-accent-500">
                      {Object.keys(projectMcps).length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 modern-scrollbar">
              {tab === 'skills' ? (
                <div className="space-y-4">
                  {/* Mode selector */}
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-bolt-elements-textSecondary">
                      Project mode
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {MODES.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setMode(m.id)}
                          title={m.hint}
                          className={classNames(
                            'flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all',
                            mode === m.id
                              ? 'border-accent-500/60 bg-accent-500/10 text-bolt-elements-textPrimary'
                              : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:border-bolt-elements-borderColorActive',
                          )}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <div className={classNames(m.icon, 'text-base')} />
                            {m.label}
                          </span>
                          <span className="text-[11px] leading-tight opacity-70">{m.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Selected skills */}
                  {installedSkills.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-bolt-elements-textSecondary">
                        Installed for this project ({installedSkills.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {installedSkills.map((skill) => {
                          const busyKey = `${configKey}:${skill.id}`;

                          return (
                            <span
                              key={skill.id}
                              className="flex items-center gap-2 rounded-full border border-accent-500/40 bg-accent-500/10 px-3 py-1 text-xs text-bolt-elements-textPrimary"
                            >
                              <div className="i-ph:check-circle text-accent-500" />
                              {skill.name}
                              <button
                                className="opacity-60 transition hover:opacity-100"
                                title="Remove skill"
                                onClick={() => removeSkill(skill.id)}
                              >
                                <div className="i-ph:x text-sm" />
                              </button>
                              {busySkills[busyKey] && (
                                <div className="i-svg-spinners:90-ring-with-bg text-accent-500" />
                              )}
                            </span>
                          );
                        })}
                      </div>
                      {sandboxPhase !== 'idle' && (
                        <p className="mt-2 text-[11px] text-bolt-elements-textSecondary">
                          {sandboxPhase === 'ready'
                            ? 'Changes apply to the next sandbox start for this project.'
                            : 'Skills are installed automatically when the sandbox starts.'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Search + filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[180px]">
                      <div className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-sm text-bolt-elements-textTertiary" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search skills…"
                        className="w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 py-2 pl-8 pr-3 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-accent-500/50 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setCategory(cat)}
                          className={classNames(
                            'rounded-full px-2.5 py-1 text-[11px] transition-all',
                            category === cat
                              ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                              : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                          )}
                        >
                          {cat === 'all' ? 'All' : cat}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowGithubForm((v) => !v)}
                      className={classNames(
                        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all',
                        showGithubForm
                          ? 'border-accent-500/60 text-accent-500'
                          : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                      )}
                    >
                      <div className="i-ph:github-logo text-sm" />
                      Add from GitHub
                    </button>
                  </div>

                  {showGithubForm && (
                    <div className="space-y-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
                      <p className="text-[11px] text-bolt-elements-textSecondary">
                        Install any public GitHub folder as a skill. It should contain a{' '}
                        <code className="rounded bg-bolt-elements-background-depth-3 px-1">SKILL.md</code> describing
                        how the agent should use it.
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1.5fr_1fr_auto]">
                        <input
                          value={githubRepo}
                          onChange={(e) => setGithubRepo(e.target.value)}
                          placeholder="owner/repo"
                          className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none"
                        />
                        <input
                          value={githubPath}
                          onChange={(e) => setGithubPath(e.target.value)}
                          placeholder="path/to/skill (optional)"
                          className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none"
                        />
                        <input
                          value={githubRef}
                          onChange={(e) => setGithubRef(e.target.value)}
                          placeholder="branch (optional)"
                          className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none"
                        />
                        <DialogButton type="primary" onClick={handleGithubAdd}>
                          Install
                        </DialogButton>
                      </div>
                    </div>
                  )}

                  {catalogError && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                      {catalogError}
                    </div>
                  )}

                  {/* Catalog grid */}
                  {catalogLoading ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {[...Array(4)].map((_, i) => (
                        <div
                          key={i}
                          className="h-[86px] animate-pulse rounded-lg bg-bolt-elements-background-depth-3"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {filteredCatalog.map((skill) => {
                        const installed = installedSkills.some((s) => s.id === skill.id);
                        const recommended = skill.recommendedModes?.includes(mode);
                        const busyKey = `${configKey}:${skill.id}`;

                        return (
                          <div
                            key={skill.id}
                            className={classNames(
                              'group flex flex-col justify-between gap-2 rounded-lg border p-3 transition-all',
                              installed
                                ? 'border-accent-500/50 bg-accent-500/5'
                                : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:border-bolt-elements-borderColorActive',
                            )}
                          >
                            <div className="flex items-start gap-2.5">
                              <div
                                className={classNames(
                                  skill.icon || 'i-ph:puzzle-piece',
                                  'mt-0.5 text-lg shrink-0',
                                  installed ? 'text-accent-500' : 'text-bolt-elements-textSecondary',
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-medium text-bolt-elements-textPrimary">
                                    {skill.name}
                                  </span>
                                  {recommended && !installed && (
                                    <span className="shrink-0 rounded-full bg-accent-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-accent-500">
                                      {mode}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-bolt-elements-textSecondary">
                                  {skill.description}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase tracking-wide text-bolt-elements-textTertiary">
                                {skill.category}
                                {skill.sourceType === 'github' ? ' · GitHub' : ' · Built-in'}
                              </span>
                              {installed ? (
                                <button
                                  onClick={() => removeSkill(skill.id)}
                                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-bolt-elements-textSecondary transition hover:bg-red-500/10 hover:text-red-400"
                                >
                                  <div className="i-ph:trash text-xs" />
                                  Remove
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleInstall(skill)}
                                  disabled={!!busySkills[busyKey]}
                                  className="flex items-center gap-1 rounded-md bg-bolt-elements-background-depth-3 px-2 py-1 text-[11px] text-bolt-elements-textPrimary transition hover:bg-accent-500/20 disabled:opacity-50"
                                >
                                  {busySkills[busyKey] ? (
                                    <div className="i-svg-spinners:90-ring-with-bg text-accent-500" />
                                  ) : (
                                    <div className="i-ph:download-simple text-xs" />
                                  )}
                                  Install
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {filteredCatalog.length === 0 && (
                        <div className="col-span-full py-8 text-center text-sm text-bolt-elements-textSecondary">
                          No skills match "{search}". You can still add any GitHub folder as a custom skill.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* ---------------- MCP TAB ---------------- */
                <div className="space-y-4">
                  <p className="text-xs text-bolt-elements-textSecondary">
                    MCP servers connected here become <strong>tools for the agent</strong> while working on this
                    project. Manage your global server list in Settings → MCP Servers.
                  </p>

                  {/* Project-selected MCPs */}
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-bolt-elements-textSecondary">
                      Connected to this project ({Object.keys(projectMcps).length})
                    </div>
                    {Object.keys(projectMcps).length === 0 ? (
                      <div className="rounded-lg border border-dashed border-bolt-elements-borderColor px-4 py-6 text-center text-xs text-bolt-elements-textTertiary">
                        No MCP servers connected to this project yet. Toggle a server below or add a custom one.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {Object.entries(projectMcps).map(([name, server]) => (
                          <div
                            key={name}
                            className="flex items-center justify-between gap-3 rounded-lg border border-accent-500/40 bg-accent-500/5 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-sm text-bolt-elements-textPrimary">
                                <div className="i-ph:plugs-connected text-accent-500" />
                                <span className="font-medium">{name}</span>
                                <span className="rounded bg-bolt-elements-background-depth-3 px-1.5 py-0.5 text-[10px] uppercase text-bolt-elements-textSecondary">
                                  {server.type || 'stdio'}
                                </span>
                              </div>
                              <div className="truncate pl-6 text-[11px] text-bolt-elements-textTertiary">
                                {'url' in server ? server.url : [server.command, ...(server.args || [])].join(' ')}
                              </div>
                            </div>
                            <button
                              onClick={() => setProjectMcp(name, null)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-bolt-elements-textSecondary transition hover:bg-red-500/10 hover:text-red-400"
                            >
                              <div className="i-ph:link-break text-xs" />
                              Disconnect
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Global servers */}
                  {globalServerNames.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-bolt-elements-textSecondary">
                        Your servers
                      </div>
                      <div className="space-y-1.5">
                        {globalServerNames.map((name) => {
                          const connected = !!projectMcps[name];

                          return (
                            <div
                              key={name}
                              className="flex items-center justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm text-bolt-elements-textPrimary">{name}</div>
                                <div className="truncate text-[11px] text-bolt-elements-textTertiary">
                                  {'url' in globalMcpServers[name]
                                    ? globalMcpServers[name].url
                                    : globalMcpServers[name].command}
                                </div>
                              </div>
                              <Switch
                                checked={connected}
                                onCheckedChange={() => toggleCatalogMcp(name)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add custom project MCP */}
                  <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-bolt-elements-textPrimary">
                      <div className="i-ph:plus-circle text-sm" />
                      Add custom MCP server (this project only)
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_2fr_auto]">
                      <input
                        value={customMcpName}
                        onChange={(e) => setCustomMcpName(e.target.value)}
                        placeholder="Server name"
                        className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none"
                      />
                      <select
                        value={customMcpType}
                        onChange={(e) => setCustomMcpType(e.target.value as typeof customMcpType)}
                        className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 text-sm text-bolt-elements-textPrimary focus:outline-none"
                      >
                        <option value="streamable-http">HTTP</option>
                        <option value="sse">SSE</option>
                        <option value="stdio">stdio</option>
                      </select>
                      {customMcpType === 'stdio' ? (
                        <input
                          value={customMcpCommand}
                          onChange={(e) => setCustomMcpCommand(e.target.value)}
                          placeholder="npx -y @some/mcp-server"
                          className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none"
                        />
                      ) : (
                        <input
                          value={customMcpUrl}
                          onChange={(e) => setCustomMcpUrl(e.target.value)}
                          placeholder="https://mcp.example.com/mcp"
                          className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none"
                        />
                      )}
                      <DialogButton type="primary" onClick={handleAddCustomMcp}>
                        Connect
                      </DialogButton>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-bolt-elements-borderColor px-6 py-3">
              <span className="text-[11px] text-bolt-elements-textSecondary">
                {installedSkills.length} skill{installedSkills.length === 1 ? '' : 's'} ·{' '}
                {Object.keys(projectMcps).length} MCP server{Object.keys(projectMcps).length === 1 ? '' : 's'}
                {sandboxPhase === 'ready' ? ' · sandbox running' : ''}
              </span>
              <DialogClose asChild>
                <DialogButton type="primary">Done</DialogButton>
              </DialogClose>
            </div>
          </div>
        </Dialog>
      )}
    </DialogRoot>
  );

  return picker;
}
