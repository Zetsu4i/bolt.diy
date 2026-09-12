import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { BUILTIN_SKILLS, GITHUB_CATALOG_SKILLS } from '~/lib/.server/skills/catalog';

/**
 * GET /api/skills/catalog
 * Returns the curated skill catalog (builtin + GitHub-sourced entries).
 * Builtin file bodies are stripped to keep the payload light; the browser
 * resolves full content via /api/skills/resolve when a skill is installed.
 */
export async function loader(_: LoaderFunctionArgs) {
  const catalog = [...BUILTIN_SKILLS, ...GITHUB_CATALOG_SKILLS].map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    icon: skill.icon,
    recommendedModes: skill.recommendedModes || [],
    installCommands: skill.installCommands || [],
    sourceUrl:
      skill.source.type === 'github'
        ? `https://github.com/${skill.source.repo}${skill.source.path ? `/tree/${skill.source.ref || 'main'}/${skill.source.path}` : ''}`
        : undefined,
    sourceType: skill.source.type,
    repo: skill.source.type === 'github' ? skill.source.repo : undefined,
    path: skill.source.type === 'github' ? skill.source.path : undefined,
    ref: skill.source.type === 'github' ? skill.source.ref : undefined,
    fileCount: skill.source.type === 'builtin' ? Object.keys(skill.source.files).length : undefined,
  }));

  return new Response(JSON.stringify({ skills: catalog, categories: [...new Set(catalog.map((s) => s.category))] }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}
