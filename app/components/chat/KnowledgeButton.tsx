import { useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Dialog, DialogButton, DialogClose, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { IconButton } from '~/components/ui/IconButton';
import { useChatId } from '~/components/chat/useChatId';
import {
  KNOWLEDGE_LIMITS,
  addKnowledgeFiles,
  clearKnowledgeDocs,
  removeKnowledgeDoc,
  useKnowledgeDocs,
} from '~/lib/stores/knowledge';

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "Attach documents" button + dialog. Uploaded documents (markdown specs,
 * coding style guides, API references, ...) are stored per project and
 * injected into every chat request as reference material.
 */
export function KnowledgeButton() {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatId = useChatId();
  const docs = useKnowledgeDocs(chatId);

  const totalSize = useMemo(() => docs.reduce((sum, doc) => sum + doc.content.length, 0), [docs]);

  const handleFilesPicked = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    if (!chatId) {
      toast.error('Start a chat first to attach documents');
      return;
    }

    setUploading(true);

    try {
      const files = Array.from(fileList);
      const added = await addKnowledgeFiles(chatId, files);
      const skipped = files.length - added;

      if (added > 0) {
        toast.success(`${added} document${added === 1 ? '' : 's'} attached`);

        if (skipped > 0) {
          toast.warning(`${skipped} file${skipped === 1 ? '' : 's'} skipped (unsupported or unreadable)`);
        }
      } else {
        toast.error('No supported text documents found (md, txt, code, json, ...)');
      }
    } catch (error) {
      toast.error('Failed to read documents');
      console.error('Knowledge upload failed:', error);
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <IconButton
        title="Attach documents (reference material & style guides)"
        className="transition-colors"
        onClick={() => setOpen(true)}
      >
        <div className={classNames('i-ph:books text-xl', docs.length > 0 ? 'text-bolt-elements-item-contentAccent' : '')} />
        <span className={classNames('ml-0.5 text-[10px] font-semibold', docs.length > 0 ? 'text-bolt-elements-item-contentAccent' : 'hidden')}>
          {docs.length}
        </span>
      </IconButton>

      <Dialog className="w-[520px] max-w-[92vw]" onClose={() => setOpen(false)}>
        <div className="p-6">
          <DialogTitle>
            <div className="flex items-center gap-2">
              <div className="i-ph:books text-xl text-bolt-elements-item-contentAccent" />
              Project Knowledge
            </div>
          </DialogTitle>

          <p className="mt-2 text-sm text-bolt-elements-textSecondary">
            Attach reference documents (specifications, coding style guides, API references). Their content is provided
            to the agent with every request so it can follow your conventions.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".md,.markdown,.txt,.json,.csv,.tsv,.yml,.yaml,.xml,.html,.css,.scss,.js,.jsx,.ts,.tsx,.py,.sql,.sh,.toml,.ini,.graphql,.vue,.svelte,text/*,application/json"
            className="hidden"
            onChange={(e) => handleFilesPicked(e.target.files)}
          />

          <div className="mt-4 flex items-center gap-2">
            <DialogButton type="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <div className="flex items-center gap-2">
                <div className={classNames('i-ph:upload-simple', uploading && 'animate-pulse')} />
                {uploading ? 'Reading files...' : 'Upload documents'}
              </div>
            </DialogButton>

            {docs.length > 0 && (
              <DialogButton
                type="secondary"
                onClick={() => {
                  if (chatId) {
                    clearKnowledgeDocs(chatId);
                    toast.info('All documents removed');
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="i-ph:trash" />
                  Clear all
                </div>
              </DialogButton>
            )}
          </div>

          <div className="mt-4 max-h-[320px] overflow-y-auto pr-1">
            {docs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-bolt-elements-borderColor p-6 text-center text-sm text-bolt-elements-textSecondary">
                No documents attached yet.
                <br />
                Supported: markdown, text, code files, JSON, YAML, CSV...
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {docs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-bolt-elements-background-depth-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-bolt-elements-textPrimary">{doc.name}</div>
                      <div className="text-xs text-bolt-elements-textSecondary">
                        {formatSize(doc.content.length)}
                        {doc.size > doc.content.length ? ' (truncated)' : ''}
                      </div>
                    </div>
                    <IconButton
                      title="Remove document"
                      onClick={() => {
                        if (chatId) {
                          removeKnowledgeDoc(chatId, doc.id);
                        }
                      }}
                    >
                      <div className="i-ph:x text-lg text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 text-xs text-bolt-elements-textSecondary">
            Limits: {KNOWLEDGE_LIMITS.maxDocs} documents, {formatSize(KNOWLEDGE_LIMITS.maxDocChars)} each,{' '}
            {formatSize(KNOWLEDGE_LIMITS.maxTotalChars)} total. {docs.length}/{KNOWLEDGE_LIMITS.maxDocs} attached (
            {formatSize(totalSize)}).
          </div>

          <div className="mt-5 flex justify-end">
            <DialogClose asChild>
              <DialogButton type="primary">Done</DialogButton>
            </DialogClose>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
