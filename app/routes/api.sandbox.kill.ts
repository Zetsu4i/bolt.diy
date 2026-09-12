import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { E2BError, killSandbox, resolveE2BKey } from '~/lib/.server/sandbox/e2b-client';

/**
 * POST /api/sandbox/kill
 * Body: { sandboxId, chatId? }
 * Shuts the project's sandbox down. Project data lives in the browser, so
 * killing the sandbox never deletes project files.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const body = (await request.json().catch(() => ({}))) as { sandboxId?: string; chatId?: string };

  if (!body.sandboxId && !body.chatId) {
    return new Response(JSON.stringify({ error: 'sandboxId or chatId is required' }), { status: 400 });
  }

  const apiKeys = getApiKeysFromCookie(request.headers.get('Cookie'));
  const apiKey = resolveE2BKey(apiKeys, context?.cloudflare?.env ?? process.env);

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No E2B API key configured', errorCode: 'missing-key' }), {
      status: 400,
    });
  }

  try {
    if (body.sandboxId) {
      const killed = await killSandbox(body.sandboxId, apiKey);

      return new Response(JSON.stringify({ ok: killed, killed: body.sandboxId }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // chatId mode: kill every sandbox tagged with this chatId.
    const { listSandboxes } = await import('~/lib/.server/sandbox/e2b-client');
    const sandboxes = await listSandboxes(apiKey, 50);
    const targets = sandboxes.filter((s) => s.metadata?.chatId === body.chatId);
    const results: string[] = [];

    for (const target of targets) {
      if (await killSandbox(target.sandboxId, apiKey).catch(() => false)) {
        results.push(target.sandboxId);
      }
    }

    return new Response(JSON.stringify({ ok: true, killed: results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof E2BError) {
      return new Response(JSON.stringify({ error: error.message, errorCode: error.code }), { status: error.status });
    }

    console.error('sandbox kill failed:', error);

    return new Response(JSON.stringify({ error: 'Failed to stop sandbox' }), { status: 500 });
  }
}
