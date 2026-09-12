import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { provisionSandbox } from '~/lib/.server/sandbox/provisioner';
import { E2BError, resolveE2BKey } from '~/lib/.server/sandbox/e2b-client';
import type { ProvisionRequest, ProvisionResponse } from '~/types/skills';

/**
 * POST /api/sandbox/provision
 *
 * Creates a fresh E2B sandbox for a project and installs the project's
 * user-selected skills + MCP configuration into it, then returns preview
 * hosts for the detected app ports. The E2B key is read from the user's
 * BYOK cookie (Settings → Sandbox) or the server env; it is never logged
 * and never echoed back to the client.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let request_escaped: ProvisionRequest;

  try {
    request_escaped = (await request.json()) as ProvisionRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!request_escaped?.chatId) {
    return new Response(JSON.stringify({ error: 'chatId is required' }), { status: 400 });
  }

  const apiKeys = getApiKeysFromCookie(request.headers.get('Cookie'));
  const apiKey = resolveE2BKey(apiKeys, context?.cloudflare?.env ?? process.env);

  if (!apiKey) {
    const body: ProvisionResponse = {
      ok: false,
      errorCode: 'missing-key',
      error:
        'No E2B API key configured. Add your E2B key in Settings → Sandbox (E2B) to enable project sandboxes.',
    };

    return new Response(JSON.stringify(body), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { sandbox } = await provisionSandbox(request_escaped, apiKey);
    const body: ProvisionResponse = { ok: true, sandbox };

    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    if (error instanceof E2BError) {
      const body: ProvisionResponse = { ok: false, errorCode: error.code, error: error.message };

      return new Response(JSON.stringify(body), { status: error.status, headers: { 'Content-Type': 'application/json' } });
    }

    console.error('sandbox provision failed:', error);

    const body: ProvisionResponse = {
      ok: false,
      errorCode: 'unknown',
      error: error instanceof Error ? error.message : 'Sandbox provisioning failed',
    };

    return new Response(JSON.stringify(body), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
