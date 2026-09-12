import { useEffect, useMemo, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { classNames } from '~/utils/classNames';
import { Dialog, DialogButton, DialogClose, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { useProjectStore, PENDING_CHAT_ID } from '~/lib/stores/project';
import { useChatId } from '~/components/chat/useChatId';

const PHASE_STYLES: Record<string, { dot: string; label: string }> = {
  idle: { dot: 'bg-bolt-elements-textTertiary', label: 'Sandbox off' },
  provisioning: { dot: 'bg-yellow-400 animate-pulse', label: 'Starting sandbox…' },
  ready: { dot: 'bg-green-400', label: 'Sandbox running' },
  error: { dot: 'bg-red-400', label: 'Sandbox error' },
  stopped: { dot: 'bg-bolt-elements-textTertiary', label: 'Sandbox stopped' },
};

/**
 * Compact sandbox status chip for the chat composer / workspace.
 * Shows provisioning state, preview port links and stop/start actions.
 */
export function SandboxIndicator() {
  const chatId = useChatId();
  const sandbox = useProjectStore((s) => s.sandbox);
  const sandboxPhase = useProjectStore((s) => s.sandboxPhase);
  const provisionError = useProjectStore((s) => s.provisionError);
  const configs = useProjectStore((s) => s.configs);
  const provision = useProjectStore((s) => s.provision);
  const stopSandbox = useProjectStore((s) => s.stopSandbox);
  const setActiveChat = useProjectStore((s) => s.setActiveChat);
  const refreshSandboxStatus = useProjectStore((s) => s.refreshSandboxStatus);

  const [detailsOpen, setDetailsOpen] = useState(false);

  const config = configs[chatId || PENDING_CHAT_ID];

  // Keep the store aware of the active chat so its config/sandbox state loads.
  useEffect(() => {
    setActiveChat(chatId ?? null);
  }, [chatId, setActiveChat]);

  // Refresh liveness occasionally so a timed-out sandbox flips the chip.
  useEffect(() => {
    if (sandboxPhase !== 'ready') {
      return;
    }

    const interval = setInterval(() => refreshSandboxStatus(), 60_000);

    return () => clearInterval(interval);
  }, [sandboxPhase, refreshSandboxStatus]);

  const previewEntries = useMemo(() => Object.entries(sandbox?.previewHosts || {}), [sandbox]);

  const phase = PHASE_STYLES[sandboxPhase] || PHASE_STYLES.idle;
  const hasConfig = (config?.skills?.length || 0) > 0 || Object.keys(config?.mcps?.mcpServers || {}).length > 0;

  const handleStart = async () => {
    await provision();
  };

  return (
    <ClientOnly>
      {() => (
        <div className="relative flex items-center">
          <button
            onClick={() => setDetailsOpen(true)}
            title="Sandbox status"
            className={classNames(
              'flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-all',
              'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
              'hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary',
            )}
          >
            <span className={classNames('h-1.5 w-1.5 rounded-full', phase.dot)} />
            <span className="hidden sm:inline">{phase.label}</span>
            <div className="i-ph:cube text-xs" />
          </button>

          <DialogRoot open={detailsOpen} onOpenChange={setDetailsOpen}>
            {detailsOpen && (
              <Dialog className="w-[min(92vw,520px)]">
                <div className="space-y-4">
                  <DialogTitle>
                    <div className="i-ph:cube text-xl" />
                    Project sandbox
                  </DialogTitle>

                  {!config && <p className="text-sm text-bolt-elements-textSecondary">Loading project…</p>}

                  {config && (
                    <>
                      <div className="space-y-1 text-xs text-bolt-elements-textSecondary">
                        <div className="flex justify-between">
                          <span>Mode</span>
                          <span className="text-bolt-elements-textPrimary uppercase">{config.mode}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Skills installed</span>
                          <span className="text-bolt-elements-textPrimary">{config.skills.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>MCP servers</span>
                          <span className="text-bolt-elements-textPrimary">
                            {Object.keys(config.mcps?.mcpServers || {}).length}
                          </span>
                        </div>
                        {sandbox?.sandboxId && (
                          <div className="flex justify-between">
                            <span>Sandbox ID</span>
                            <span className="font-mono text-bolt-elements-textPrimary">
                              {sandbox.sandboxId.slice(0, 14)}…
                            </span>
                          </div>
                        )}
                      </div>

                      {sandboxPhase === 'ready' && previewEntries.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-bolt-elements-textSecondary">
                            Preview ports
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {previewEntries.map(([port, host]) => (
                              <a
                                key={port}
                                href={`https://${host}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1 text-[11px] text-bolt-elements-textPrimary transition hover:border-accent-500/50 hover:text-accent-500"
                              >
                                <div className="i-ph:arrow-square-out text-xs" />
                                Port {port}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {sandboxPhase === 'ready' && previewEntries.length === 0 && (
                        <p className="text-xs text-bolt-elements-textSecondary">
                          No preview ports detected yet. Start an app server inside the sandbox (e.g. on port 3000)
                          and the preview link will appear here.
                        </p>
                      )}

                      {sandboxPhase === 'error' && provisionError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                          {provisionError}
                        </div>
                      )}

                      {sandboxPhase === 'idle' && !hasConfig && (
                        <p className="text-xs text-bolt-elements-textSecondary">
                          This project has no skills or MCP servers selected yet. Use the puzzle-piece button in the
                          composer to customize it — a sandbox will be created with your selections when the project
                          starts.
                        </p>
                      )}

                      <div className="flex justify-end gap-2">
                        {(sandboxPhase === 'ready' || sandboxPhase === 'provisioning') && (
                          <DialogButton
                            type="secondary"
                            disabled={sandboxPhase === 'provisioning'}
                            onClick={async () => {
                              await stopSandbox();
                            }}
                          >
                            Stop sandbox
                          </DialogButton>
                        )}
                        {(sandboxPhase === 'idle' || sandboxPhase === 'error' || sandboxPhase === 'stopped') &&
                          hasConfig && (
                            <DialogButton type="primary" onClick={handleStart}>
                              Start sandbox
                            </DialogButton>
                          )}
                        <DialogClose asChild>
                          <DialogButton type="secondary">Close</DialogButton>
                        </DialogClose>
                      </div>
                    </>
                  )}
                </div>
              </Dialog>
            )}
          </DialogRoot>
        </div>
      )}
    </ClientOnly>
  );
}
