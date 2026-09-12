import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { SANDBOX_TIMEOUT_MS, connectSandbox, resolveE2BKey } from '~/lib/.server/sandbox/e2b-client';

/**
 * POST /api/sandbox/keepalive
 * Body: { sandboxId }
 * Extends the sandbox timeout while the user is actively working in a
 * project. Cheap no-op operation on the E2B API.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const body = (await request.json().catch(() => ({}))) as { sandboxId?: string };

  if (!body.sandboxId) {
    return new Response(JSON.stringify({ error: 'sandboxId is required' }), { status: 400 });
  }

  const apiKeys = getApiKeysFromCookie(request.headers.get('Cookie'));
  const apiKey = resolveE2BKey(apiKeys, context?.cloudflare?.env ?? process.env);

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No E2B API key configured', errorCode: 'missing-key' }), {
      status: 400,
    });
  }

  try {
    const sandbox = await connectSandbox(body.sandboxId, apiKey);

    await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);

    return new Response(JSON.stringify({ ok: true, timeoutMs: SANDBOX_TIMEOUT_MS }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/not found|paused|404/i.test(message)) {
      return new Response(JSON.stringify({ ok: false, error: 'Sandbox is no longer running' }), { status: 200 });
    }

    console.error('sandbox keepalive failed:', message);

    return new Response(JSON.stringify({ ok: false, error: 'Keepalive failed' }), { status: 500 });
  }
}
