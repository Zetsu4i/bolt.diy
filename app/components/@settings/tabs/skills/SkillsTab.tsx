import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { useProjectStore, PENDING_CHAT_ID } from '~/lib/stores/project';
import { E2BSettingsCard } from './E2BSettingsCard';
import type { CatalogSkill } from '~/types/skills';

/**
 * Settings tab for managing the skill library and viewing what each project
 * has installed. Project-scoped installs are managed per chat from the chat
 * composer (puzzle-piece button); this tab shows the full catalog with
 * install buttons that target the currently open project (or the pending
 * new-project selection when on the landing page).
 */
export default function SkillsTab() {
  const catalog = useProjectStore((s) => s.catalog);
  const catalogLoading = useProjectStore((s) => s.catalogLoading);
  const catalogError = useProjectStore((s) => s.catalogError);
  const initialize = useProjectStore((s) => s.initialize);
  const configs = useProjectStore((s) => s.configs);
  const activeChatId = useProjectStore((s) => s.activeChatId);
  const busySkills = useProjectStore((s) => s.busySkills);
  const addSkillFromCatalog = useProjectStore((s) => s.addSkillFromCatalog);
  const addSkillFromGitHub = useProjectStore((s) => s.addSkillFromGitHub);
  const removeSkill = useProjectStore((s) => s.removeSkill);

  const [search, setSearch] = useState('');
  const [showGithubForm, setShowGithubForm] = useState(false);
  const [githubRepo, setGithubRepo] = useState('');
  const [githubPath, setGithubPath] = useState('');
  const [githubRef, setGithubRef] = useState('');

  useEffect(() => {
    initialize();
  }, [initialize]);

  const configKey = activeChatId || PENDING_CHAT_ID;
  const config = configs[configKey];
  const installedIds = useMemo(() => new Set(config?.skills.map((s) => s.id) || []), [config]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return catalog.filter((skill) =>
      query ? skill.name.toLowerCase().includes(query) || skill.description.toLowerCase().includes(query) : true,
    );
  }, [catalog, search]);

  const handleInstall = async (skill: CatalogSkill) => {
    try {
      await addSkillFromCatalog(skill.id);
      toast.success(`${skill.name} installed`);
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
      toast.error(error instanceof Error ? error.message : 'Failed to install skill');
    }
  };

  const totalInstalls = Object.values(configs)
    .map((c) => c.skills.length)
    .reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <E2BSettingsCard />

      {/* Overview */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <div className="text-2xl font-semibold text-bolt-elements-textPrimary">{catalog.length}</div>
          <div className="text-xs text-bolt-elements-textSecondary">Skills in catalog</div>
        </div>
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <div className="text-2xl font-semibold text-bolt-elements-textPrimary">{config?.skills.length || 0}</div>
          <div className="text-xs text-bolt-elements-textSecondary">
            Installed in {activeChatId ? 'current project' : 'new project'}
          </div>
        </div>
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <div className="text-2xl font-semibold text-bolt-elements-textPrimary">{totalInstalls}</div>
          <div className="text-xs text-bolt-elements-textSecondary">Total project installs</div>
        </div>
      </div>

      <div className="rounded-lg border border-accent-500/30 bg-accent-500/5 p-4 text-xs leading-relaxed text-bolt-elements-textSecondary">
        <span className="font-medium text-bolt-elements-textPrimary">How skills work:</span> skills you select for a
        project are installed into its sandbox under{' '}
        <code className="rounded bg-bolt-elements-background-depth-3 px-1">/opt/skills/&lt;skill-id&gt;/</code> every
        time a sandbox starts. The agent receives each skill's instructions automatically and can run the bundled
        scripts inside the sandbox. Install into the current project from the chat composer's puzzle-piece button.
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <div className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-sm text-bolt-elements-textTertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the skill catalog…"
            className="w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 py-2 pl-8 pr-3 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-accent-500/50 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowGithubForm((v) => !v)}
          className={classNames(
            'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-all',
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
            <code className="rounded bg-bolt-elements-background-depth-3 px-1">SKILL.md</code>.
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
            <button
              onClick={handleGithubAdd}
              className="rounded-md bg-accent-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-600"
            >
              Install
            </button>
          </div>
        </div>
      )}

      {catalogError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">{catalogError}</div>
      )}

      {/* Catalog list */}
      {catalogLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-bolt-elements-background-depth-3" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((skill) => {
            const installed = installedIds.has(skill.id);
            const busyKey = `${configKey}:${skill.id}`;

            return (
              <div
                key={skill.id}
                className={classNames(
                  'flex items-center gap-4 rounded-lg border p-4 transition-all',
                  installed
                    ? 'border-accent-500/50 bg-accent-500/5'
                    : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
                )}
              >
                <div
                  className={classNames(
                    skill.icon || 'i-ph:puzzle-piece',
                    'text-2xl shrink-0',
                    installed ? 'text-accent-500' : 'text-bolt-elements-textSecondary',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-bolt-elements-textPrimary">{skill.name}</span>
                    <span className="rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-[10px] uppercase tracking-wide text-bolt-elements-textSecondary">
                      {skill.category}
                    </span>
                    {skill.sourceType === 'github' && (
                      <span className="rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-[10px] text-bolt-elements-textSecondary">
                        GitHub
                      </span>
                    )}
                    {installed && (
                      <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] text-green-400">
                        Installed
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-bolt-elements-textSecondary">{skill.description}</p>
                  {skill.sourceUrl && (
                    <a
                      href={skill.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-[11px] text-accent-500 hover:underline"
                    >
                      View source
                    </a>
                  )}
                </div>
                {installed ? (
                  <button
                    onClick={() => removeSkill(skill.id)}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textSecondary transition hover:border-red-500/40 hover:text-red-400"
                  >
                    <div className="i-ph:trash text-sm" />
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={() => handleInstall(skill)}
                    disabled={!!busySkills[busyKey]}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-600 disabled:opacity-50"
                  >
                    {busySkills[busyKey] ? (
                      <div className="i-svg-spinners:90-ring-with-bg" />
                    ) : (
                      <div className="i-ph:download-simple text-sm" />
                    )}
                    Install
                  </button>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-bolt-elements-textSecondary">
              No skills match "{search}".
            </div>
          )}
        </div>
      )}
    </div>
  );
}
