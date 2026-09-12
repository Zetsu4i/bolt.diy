import type { SkillDefinition, SelectedSkill } from '~/types/skills';
import { createScopedLogger } from '~/utils/logger';
import { BUILTIN_SKILLS, GITHUB_CATALOG_SKILLS } from './catalog';

const logger = createScopedLogger('skills.resolver');

const GITHUB_API = 'https://api.github.com';
const MAX_SKILL_FILE_BYTES = 512 * 1024; // 512KB per file safety cap
const MAX_SKILL_FILES = 120;

export class SkillResolveError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SkillResolveError';
    this.status = status;
  }
}

export interface ResolvedSkill extends SkillDefinition {
  instructions: string;
  files: Record<string, string>;
}

export function findCatalogSkill(id: string): SkillDefinition | undefined {
  return [...BUILTIN_SKILLS, ...GITHUB_CATALOG_SKILLS].find((s) => s.id === id);
}

/**
 * Parses markdown with frontmatter (--- name/description ---) into metadata
 * plus the instruction body.
 */
export function parseSkillMarkdown(content: string, fallbackName: string): { name: string; description: string; instructions: string } {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!fmMatch) {
    return { name: fallbackName, description: '', instructions: content.trim() };
  }

  const [, frontmatter, body] = fmMatch;
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : fallbackName,
    description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : '',
    instructions: body.trim(),
  };
}

interface GithubTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  size?: number;
  url: string;
}

function ghHeaders(githubToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'bolt-diy-skill-installer',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  return headers;
}

/**
 * Resolves a skill from a public GitHub repository folder using the git trees
 * API (one request for the tree + one per file batch via raw.githubusercontent).
 */
export async function resolveGitHubSkill(
  repo: string,
  path = '',
  ref?: string,
  githubToken?: string,
): Promise<Record<string, string>> {
  const repoMatch = repo.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);

  if (!repoMatch) {
    throw new SkillResolveError(`Invalid GitHub repository: "${repo}". Use "owner/repo" or a github.com URL.`);
  }

  const [, owner, name] = repoMatch;
  const slug = `${owner}/${name}`;

  // 1. Resolve the default branch / validate ref
  const repoRes = await fetch(`${GITHUB_API}/repos/${slug}`, { headers: ghHeaders(githubToken) });

  if (repoRes.status === 404) {
    throw new SkillResolveError(`GitHub repository not found: ${slug}`, 404);
  }

  if (repoRes.status === 403) {
    throw new SkillResolveError('GitHub API rate limit exceeded. Try again later or configure a GitHub token in Settings → GitHub.', 429);
  }

  if (!repoRes.ok) {
    throw new SkillResolveError(`GitHub API error ${repoRes.status} while accessing ${slug}`, 502);
  }

  const repoInfo = (await repoRes.json()) as { default_branch?: string };
  const branch = ref || repoInfo.default_branch || 'main';

  // 2. Fetch the git tree recursively
  const treeRes = await fetch(`${GITHUB_API}/repos/${slug}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
    headers: ghHeaders(githubToken),
  });

  if (!treeRes.ok) {
    throw new SkillResolveError(`Could not read tree for ${slug}@${branch} (HTTP ${treeRes.status})`, 502);
  }

  const tree = (await treeRes.json()) as { tree: GithubTreeEntry[]; truncated?: boolean };

  const base = path ? path.replace(/\/+$/, '') + '/' : '';
  const files = tree.tree.filter(
    (entry) =>
      entry.type === 'blob' &&
      (!base || entry.path.startsWith(base)) &&
      !entry.path.split('/').some((segment) => segment === 'node_modules' || segment === '.git'),
  );

  if (files.length === 0) {
    throw new SkillResolveError(`No files found in ${slug}@${branch} under "${path || '/'}". Check the path.`, 404);
  }

  if (tree.truncated) {
    logger.warn(`GitHub tree for ${slug} is truncated; skill may be incomplete`);
  }

  const selected = files.slice(0, MAX_SKILL_FILES);

  // 3. Download file contents (raw CDN, no API rate cost)
  const entries: Record<string, string> = {};
  const batchStart = base ? base.length : 0;

  const download = async (entry: GithubTreeEntry) => {
    if ((entry.size ?? 0) > MAX_SKILL_FILE_BYTES) {
      logger.warn(`Skipping oversized file ${entry.path}`);
      return;
    }

    const raw = await fetch(
      `https://raw.githubusercontent.com/${slug}/${encodeURIComponent(branch)}/${entry.path.split('/').map(encodeURIComponent).join('/')}`,
      { headers: ghHeaders(githubToken) },
    );

    if (!raw.ok) {
      logger.warn(`Failed to download ${entry.path}: HTTP ${raw.status}`);
      return;
    }

    entries[entry.path.slice(batchStart)] = await raw.text();
  };

  // limited concurrency to stay polite
  const queue = [...selected];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (;;) {
      const entry = queue.shift();

      if (!entry) {
        break;
      }

      await download(entry);
    }
  });

  await Promise.all(workers);

  if (Object.keys(entries).length === 0) {
    throw new SkillResolveError(`Could not download any files from ${slug}@${branch}/${path}`, 502);
  }

  return entries;
}

/**
 * Resolves any skill definition into full files + agent instructions.
 */
export async function resolveSkill(skill: SkillDefinition, githubToken?: string): Promise<ResolvedSkill> {
  if (skill.source.type === 'builtin') {
    const files = skill.source.files;
    const skillMd = files['SKILL.md'] || '';
    const parsed = parseSkillMarkdown(skillMd, skill.name);

    return {
      ...skill,
      name: parsed.name || skill.name,
      description: parsed.description || skill.description,
      instructions: parsed.instructions,
      files,
    };
  }

  const files = await resolveGitHubSkill(skill.source.repo, skill.source.path, skill.source.ref, githubToken);
  const skillMd = Object.entries(files).find(([p]) => p.endsWith('SKILL.md'))?.[1] || '';
  const parsed = parseSkillMarkdown(skillMd, skill.name);

  return {
    ...skill,
    name: parsed.name || skill.name,
    description: parsed.description || skill.description,
    instructions: parsed.instructions || `Skill installed from ${skill.sourceUrl || skill.source.repo}. Read the skill files in /opt/skills/${skill.id}/ to use it.`,
    files,
  };
}

/**
 * Converts a resolved skill into the compact form sent to the LLM prompt.
 * Instructions are capped so many skills cannot blow up the context.
 */
const MAX_INSTRUCTIONS_CHARS = 8000;

export function toSelectedSkill(resolved: ResolvedSkill): SelectedSkill {
  const instructions = resolved.instructions.slice(0, MAX_INSTRUCTIONS_CHARS);

  return {
    id: resolved.id,
    name: resolved.name,
    description: resolved.description,
    instructions,
    instructionsLength: resolved.instructions.length,
  };
}
