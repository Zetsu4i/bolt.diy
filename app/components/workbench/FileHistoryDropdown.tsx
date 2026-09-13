import { memo, useState } from 'react';
import { toast } from 'react-toastify';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import type { EditorDocument } from '~/components/editor/codemirror/CodeMirrorEditor';
import type { FileHistory } from '~/types/actions';
import { workbenchStore } from '~/lib/stores/workbench';
import { usePreviewStore } from '~/lib/stores/previews';
import { classNames } from '~/utils/classNames';

function formatTimestamp(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return new Date(timestamp).toLocaleString();
}

interface FileHistoryDropdownProps {
  fileHistory?: Record<string, FileHistory>;
  editorDocument?: EditorDocument;
}

/**
 * Version history dropdown for the currently open file (VSCode-like local
 * history). Lets the user preview and restore earlier versions of a file —
 * "revert code to earlier versions" without touching other files.
 */
export const FileHistoryDropdown = memo(({ fileHistory, editorDocument }: FileHistoryDropdownProps) => {
  const [open, setOpen] = useState(false);

  if (!fileHistory || !editorDocument) {
    return null;
  }

  const history = fileHistory[editorDocument.filePath];
  const versions = [...(history?.versions || [])].reverse();

  if (versions.length === 0) {
    return null;
  }

  const restoreVersion = (timestamp: number, content: string) => {
    const confirmed = window.confirm(
      'Restore this version of the file? Your current content will be replaced (a new history entry is kept).',
    );

    if (!confirmed) {
      return;
    }

    workbenchStore.setCurrentDocumentContent(content);

    workbenchStore
      .saveCurrentDocument()
      .then(() => {
        const previewStore = usePreviewStore();
        previewStore.refreshAllPreviews();
        toast.success('File restored to earlier version');
        setOpen(false);
      })
      .catch(() => {
        toast.error('Failed to restore version');
      });
  };

  return (
    <div className="relative">
      <PanelHeaderButton
        onClick={() => setOpen((prev) => !prev)}
        className={classNames(open && 'bg-bolt-elements-background-depth-3')}
      >
        <div className="i-ph:clock-clockwise-duotone" />
        History
        <span className="ml-1 rounded bg-bolt-elements-background-depth-3 px-1 text-[10px]">{versions.length}</span>
      </PanelHeaderButton>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-xl">
            <div className="border-b border-bolt-elements-borderColor px-3 py-2 text-xs font-medium text-bolt-elements-textSecondary">
              Version history
            </div>
            <ul className="max-h-64 overflow-y-auto">
              {versions.map((version, index) => {
                const isCurrent =
                  version.content.replace(/\r\n/g, '\n').trim() === editorDocument.value.replace(/\r\n/g, '\n').trim();

                return (
                  <li key={version.timestamp}>
                    <button
                      onClick={() => restoreVersion(version.timestamp, version.content)}
                      disabled={isCurrent}
                      className={classNames(
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm',
                        isCurrent
                          ? 'cursor-default text-bolt-elements-textTertiary'
                          : 'text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
                      )}
                    >
                      <span>
                        {formatTimestamp(version.timestamp)}
                        {index === versions.length - 1 ? ' (original)' : ''}
                      </span>
                      {isCurrent ? (
                        <span className="text-[10px] uppercase text-bolt-elements-textTertiary">current</span>
                      ) : (
                        <span className="i-ph:arrow-counter-clockwise text-bolt-elements-textSecondary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
});
