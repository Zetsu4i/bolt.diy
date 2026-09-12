import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { E2BError, listSandboxes, resolveE2BKey } from '~/lib/.server/sandbox/e2b-client';

/**
 * GET /api/sandbox/status?chatId=<id>
 * Lists the running sandboxes associated with a chat so a returning user can
 * reconnect (or see that the previous sandbox is gone and needs a refresh).
 * No secrets are included in the response.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId');

  const apiKeys = getApiKeysFromCookie(request.headers.get('Cookie'));
  const apiKey = resolveE2BKey(apiKeys, context?.cloudflare?.env ?? process.env);

  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, hasKey: false, sandboxes: [], errorCode: 'missing-key' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const sandboxes = await listSandboxes(apiKey, 30);
    const filtered = chatId ? sandboxes.filter((s) => s.metadata?.chatId === chatId) : sandboxes;

    return new Response(
      JSON.stringify({
        ok: true,
        hasKey: true,
        sandboxes: filtered.map((s) => ({
          sandboxId: s.sandboxId,
          chatId: s.metadata?.chatId,
          mode: s.metadata?.mode,
          createdAt: s.createdAt,
        })),
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    if (error instanceof E2BError) {
      return new Response(JSON.stringify({ ok: false, hasKey: true, sandboxes: [], error: error.message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.error('sandbox status failed:', error);

    return new Response(JSON.stringify({ ok: false, hasKey: true, sandboxes: [], error: 'Status check failed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
