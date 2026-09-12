import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { getApiKeysFromCookies } from '~/components/chat/APIKeyManager';

type TestState = 'idle' | 'testing' | 'ok' | 'invalid' | 'missing';

/**
 * Sandbox (E2B) credentials card. BYOK: the key is stored in the same
 * `apiKeys` cookie used for provider keys and is read server-side when
 * provisioning sandboxes. The raw value is never rendered after save.
 */
export function E2BSettingsCard() {
  const [isEditing, setIsEditing] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    const keys = getApiKeysFromCookies();

    setHasKey(Boolean(keys.e2b));
  }, []);

  const handleSave = () => {
    const trimmed = tempKey.trim();

    if (!trimmed) {
      toast.error('Please enter an E2B API key');

      return;
    }

    const currentKeys = getApiKeysFromCookies();

    Cookies.set('apiKeys', JSON.stringify({ ...currentKeys, e2b: trimmed }));
    setHasKey(true);
    setTempKey('');
    setIsEditing(false);
    setTestState('idle');
    toast.success('E2B API key saved');
  };

  const handleRemove = () => {
    const currentKeys = getApiKeysFromCookies();

    delete currentKeys.e2b;
    Cookies.set('apiKeys', JSON.stringify(currentKeys));
    setHasKey(false);
    setTestState('idle');
    toast.success('E2B API key removed');
  };

  const handleTest = async () => {
    setTestState('testing');
    setTestMessage('');

    try {
      const response = await fetch('/api/sandbox/status');
      const data = (await response.json()) as { ok: boolean; hasKey: boolean; error?: string; sandboxes: unknown[] };

      if (!data.hasKey) {
        setTestState('missing');
        setTestMessage('No key saved yet.');

        return;
      }

      if (data.ok) {
        setTestState('ok');
        setTestMessage(`Connection OK · ${data.sandboxes.length} sandbox(es) on this account.`);
      } else {
        setTestState('invalid');
        setTestMessage(data.error || 'Connection failed — check your key.');
      }
    } catch {
      setTestState('invalid');
      setTestMessage('Could not reach the sandbox service.');
    }
  };

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="i-ph:cube-fill w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Sandbox (E2B)</span>
        </div>
        {hasKey && (
          <button
            onClick={handleRemove}
            className="text-xs text-bolt-elements-textSecondary transition hover:text-red-400"
          >
            Remove key
          </button>
        )}
      </div>

      <p className="mb-3 text-xs leading-relaxed text-bolt-elements-textSecondary">
        Project sandboxes run on{' '}
        <a href="https://e2b.dev" target="_blank" rel="noreferrer" className="text-accent-500 hover:underline">
          E2B
        </a>
        . Your key is stored client-side, sent only to the backend when creating sandboxes, and is never exposed to
        the agent or generated code.
      </p>

      {isEditing ? (
        <div className="flex gap-2">
          <input
            type="password"
            value={tempKey}
            onChange={(e) => setTempKey(e.target.value)}
            placeholder="e2b_..."
            autoComplete="off"
            className="flex-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 font-mono text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-accent-500/50 focus:outline-none"
          />
          <button
            onClick={handleSave}
            className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-600"
          >
            Save
          </button>
          <button
            onClick={() => {
              setIsEditing(false);
              setTempKey('');
            }}
            className="rounded-md border border-bolt-elements-borderColor px-4 py-2 text-sm text-bolt-elements-textSecondary transition hover:text-bolt-elements-textPrimary"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            {hasKey ? (
              <>
                <div className="i-ph:check-circle-fill text-green-500" />
                <span className="text-xs text-green-500">Key configured (masked)</span>
              </>
            ) : (
              <>
                <div className="i-ph:x-circle-fill text-red-500" />
                <span className="text-xs text-red-500">Not configured</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary transition hover:border-accent-500/50"
            >
              {hasKey ? 'Replace key' : 'Add key'}
            </button>
            {hasKey && (
              <button
                onClick={handleTest}
                disabled={testState === 'testing'}
                className="flex items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary transition hover:border-accent-500/50 disabled:opacity-50"
              >
                {testState === 'testing' ? (
                  <div className="i-svg-spinners:90-ring-with-bg text-accent-500" />
                ) : (
                  <div className="i-ph:plugs text-sm" />
                )}
                Test connection
              </button>
            )}
          </div>
        </div>
      )}

      {testMessage && (
        <div
          className={classNames(
            'mt-3 rounded-md p-2 text-xs',
            testState === 'ok'
              ? 'bg-green-500/10 text-green-400'
              : testState === 'missing'
                ? 'bg-yellow-500/10 text-yellow-400'
                : 'bg-red-500/10 text-red-400',
          )}
        >
          {testMessage}
        </div>
      )}
    </div>
  );
}
