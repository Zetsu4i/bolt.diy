import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { findCatalogSkill, resolveGitHubSkill, resolveSkill, SkillResolveError, toSelectedSkill, parseSkillMarkdown, type ResolvedSkill } from '~/lib/.server/skills/resolver';

/**
 * POST /api/skills/resolve
 *
 * Body variants:
 *  - { id: "web-research" }                → resolve a catalog skill
 *  - { repo: "owner/repo", path?, ref? }   → resolve any public GitHub folder
 *
 * Returns the full skill: instructions (for prompt injection) + files (for
 * sandbox installation) + installCommands. File bodies can be large, so the
 * response also carries a compact `skill` (SelectedSkill) for direct use in
 * the chat request.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      repo?: string;
      path?: string;
      ref?: string;
      name?: string;
      description?: string;
    };

    const apiKeys = getApiKeysFromCookie(request.headers.get('Cookie'));
    const githubToken = apiKeys.GitHub || apiKeys.github || undefined;

    let resolved: ResolvedSkill;

    if (body.id) {
      const def = findCatalogSkill(body.id);

      if (!def) {
        return new Response(JSON.stringify({ error: `Unknown skill id: ${body.id}` }), { status: 404 });
      }

      resolved = await resolveSkill(def, githubToken);
    } else if (body.repo) {
      const files = await resolveGitHubSkill(body.repo, body.path, body.ref, githubToken);
      const skillMd = Object.entries(files).find(([p]) => p.endsWith('SKILL.md'))?.[1] || '';
      const fallbackName = body.name || body.path?.split('/').pop() || body.repo.split('/').pop() || 'Custom Skill';
      const parsed = parseSkillMarkdown(skillMd, fallbackName);

      resolved = {
        id: `gh-${(body.repo + '/' + (body.path || '')).replace(/[^\w.-]+/g, '-').toLowerCase()}`,
        name: parsed.name || fallbackName,
        description: body.description || parsed.description || `Custom skill from ${body.repo}`,
        category: 'Custom',
        source: { type: 'github' as const, repo: body.repo, path: body.path, ref: body.ref },
        sourceUrl: `https://github.com/${body.repo}${body.path ? `/tree/${body.ref || 'main'}/${body.path}` : ''}`,
        instructions: parsed.instructions,
        files,
      } satisfies ResolvedSkill;
    } else {
      return new Response(JSON.stringify({ error: 'Provide either "id" or "repo"' }), { status: 400 });
    }

    const fileCount = Object.keys(resolved.files || {}).length;

    return new Response(
      JSON.stringify({
        skill: toSelectedSkill(resolved),
        files: resolved.files,
        installCommands: resolved.installCommands || [],
        fileCount,
        sourceUrl: resolved.sourceUrl,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    if (error instanceof SkillResolveError) {
      return new Response(JSON.stringify({ error: error.message }), { status: error.status });
    }

    console.error('skills.resolve failed:', error);

    return new Response(JSON.stringify({ error: 'Failed to resolve skill' }), { status: 500 });
  }
}
