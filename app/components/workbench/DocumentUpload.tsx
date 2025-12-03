import { type FC, useState, useCallback } from 'react';
import { getKnowledgeBase, type Document } from '~/lib/services/knowledge-base';

interface DocumentUploadProps {
  chatId: string;
  onUploadComplete?: (document: Document) => void;
}

export const DocumentUpload: FC<DocumentUploadProps> = ({ chatId, onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<Document['type']>('reference');

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      setUploading(true);
      setError(null);

      try {
        const kb = getKnowledgeBase();
        const document = await kb.uploadDocument(chatId, file, selectedType);

        onUploadComplete?.(document);

        // Reset file input
        event.target.value = '';
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload document');
      } finally {
        setUploading(false);
      }
    },
    [chatId, selectedType, onUploadComplete],
  );

  return (
    <div className="document-upload border border-bolt-elements-borderColor rounded-lg p-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-2">Upload Reference Document</h3>
        <p className="text-sm text-bolt-elements-textSecondary">
          Upload documentation, style guides, or reference materials to enhance AI responses
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">Document Type</label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as Document['type'])}
          className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
          disabled={uploading}
        >
          <option value="reference">Reference Material</option>
          <option value="style_guide">Style Guide</option>
          <option value="api_docs">API Documentation</option>
          <option value="tutorial">Tutorial</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">Select File</label>
        <input
          type="file"
          onChange={handleFileUpload}
          disabled={uploading}
          accept=".txt,.md,.json,.xml,.html,.css,.js,.ts,.tsx,.jsx,.py,.java,.cpp,.c,.h,.cs,.rb,.php,.go,.rs,.swift,.kt"
          className="block w-full text-sm text-bolt-elements-textPrimary
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-bolt-elements-button-primary-background
            file:text-bolt-elements-button-primary-text
            hover:file:bg-bolt-elements-button-primary-backgroundHover
            file:cursor-pointer
            cursor-pointer"
        />
      </div>

      {uploading && (
        <div className="flex items-center justify-center py-4">
          <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-2xl" />
          <span className="ml-2 text-bolt-elements-textSecondary">Uploading...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-md p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="mt-4 text-xs text-bolt-elements-textSecondary">
        <p>Supported formats: Text, Markdown, JSON, and common code files</p>
        <p>Maximum file size: 10MB</p>
      </div>
    </div>
  );
};

interface DocumentListProps {
  chatId: string;
  onDocumentSelect?: (document: Document) => void;
}

export const DocumentList: FC<DocumentListProps> = ({ chatId, onDocumentSelect }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Load documents on mount
  useState(() => {
    const kb = getKnowledgeBase();
    const docs = kb.getDocuments(chatId);
    setDocuments(docs);
  });

  const handleDelete = useCallback(
    (documentId: string) => {
      const kb = getKnowledgeBase();
      kb.deleteDocument(chatId, documentId);

      // Refresh list
      const docs = kb.getDocuments(chatId);
      setDocuments(docs);
    },
    [chatId],
  );

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="document-list">
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documents..."
          className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
        />
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="text-center py-8 text-bolt-elements-textSecondary">
          <p>No documents found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="border border-bolt-elements-borderColor rounded-lg p-3 hover:bg-bolt-elements-background-depth-1 cursor-pointer"
              onClick={() => onDocumentSelect?.(doc)}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-bolt-elements-textPrimary">{doc.name}</h4>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(doc.id);
                  }}
                  className="text-red-400 hover:text-red-300"
                  title="Delete document"
                >
                  <div className="i-ph:trash text-lg" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary">
                <span className="px-2 py-0.5 bg-bolt-elements-background-depth-3 rounded">
                  {doc.type}
                </span>
                <span>{(doc.size / 1024).toFixed(2)} KB</span>
                <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
              </div>
              {doc.metadata.tags && doc.metadata.tags.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {doc.metadata.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-bolt-elements-button-secondary-background text-xs rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
