import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('KnowledgeBase');

export interface Document {
  id: string;
  chatId: string;
  name: string;
  type: 'reference' | 'style_guide' | 'api_docs' | 'tutorial' | 'other';
  content: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  metadata: {
    author?: string;
    version?: string;
    tags?: string[];
    language?: string;
    framework?: string;
  };
  embedding?: number[]; // For semantic search
  chunks?: DocumentChunk[]; // For long documents
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  startOffset: number;
  endOffset: number;
  embedding?: number[];
}

export interface SearchResult {
  document: Document;
  relevanceScore: number;
  matchedChunks?: DocumentChunk[];
}

export interface KnowledgeBaseStats {
  totalDocuments: number;
  totalSize: number;
  byType: Record<string, number>;
  byTag: Record<string, number>;
}

/**
 * Knowledge base for storing and retrieving reference documents
 */
export class KnowledgeBase {
  private documents: Map<string, Map<string, Document>> = new Map();
  private readonly STORAGE_KEY = 'bolt.knowledgeBase';
  private readonly MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly CHUNK_SIZE = 2000; // Characters per chunk

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Upload a document to the knowledge base
   */
  async uploadDocument(
    chatId: string,
    file: File,
    type: Document['type'],
    metadata?: Partial<Document['metadata']>,
  ): Promise<Document> {
    logger.info(`Uploading document: ${file.name} for chat ${chatId}`);

    // Validate file size
    if (file.size > this.MAX_DOCUMENT_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of ${this.MAX_DOCUMENT_SIZE / 1024 / 1024}MB`);
    }

    // Read file content
    const content = await this.readFileContent(file);

    // Create document
    const document: Document = {
      id: this.generateId(),
      chatId,
      name: file.name,
      type,
      content,
      mimeType: file.type,
      size: file.size,
      uploadedAt: Date.now(),
      metadata: {
        ...metadata,
        tags: metadata?.tags || [],
      },
    };

    // Chunk long documents
    if (content.length > this.CHUNK_SIZE) {
      document.chunks = this.chunkDocument(document);
    }

    // Store document
    this.storeDocument(document);

    logger.info(`Uploaded document ${document.id}: ${document.name}`);

    return document;
  }

  /**
   * Upload document from text content
   */
  async uploadDocumentFromText(
    chatId: string,
    name: string,
    content: string,
    type: Document['type'],
    metadata?: Partial<Document['metadata']>,
  ): Promise<Document> {
    logger.info(`Uploading text document: ${name} for chat ${chatId}`);

    const document: Document = {
      id: this.generateId(),
      chatId,
      name,
      type,
      content,
      mimeType: 'text/plain',
      size: new Blob([content]).size,
      uploadedAt: Date.now(),
      metadata: {
        ...metadata,
        tags: metadata?.tags || [],
      },
    };

    // Chunk long documents
    if (content.length > this.CHUNK_SIZE) {
      document.chunks = this.chunkDocument(document);
    }

    // Store document
    this.storeDocument(document);

    logger.info(`Uploaded text document ${document.id}: ${document.name}`);

    return document;
  }

  /**
   * Read file content
   */
  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      // Read as text for now, could add support for binary files
      reader.readAsText(file);
    });
  }

  /**
   * Chunk a document into smaller pieces
   */
  private chunkDocument(document: Document): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const content = document.content;

    for (let i = 0; i < content.length; i += this.CHUNK_SIZE) {
      const chunkContent = content.slice(i, i + this.CHUNK_SIZE);

      chunks.push({
        id: this.generateId(),
        documentId: document.id,
        content: chunkContent,
        startOffset: i,
        endOffset: Math.min(i + this.CHUNK_SIZE, content.length),
      });
    }

    logger.info(`Chunked document ${document.id} into ${chunks.length} chunks`);

    return chunks;
  }

  /**
   * Store document
   */
  private storeDocument(document: Document): void {
    let chatDocs = this.documents.get(document.chatId);

    if (!chatDocs) {
      chatDocs = new Map();
      this.documents.set(document.chatId, chatDocs);
    }

    chatDocs.set(document.id, document);
    this.saveToStorage();
  }

  /**
   * Get document by ID
   */
  getDocument(chatId: string, documentId: string): Document | undefined {
    const chatDocs = this.documents.get(chatId);
    return chatDocs?.get(documentId);
  }

  /**
   * Get all documents for a chat
   */
  getDocuments(chatId: string, filters?: {
    type?: Document['type'];
    tags?: string[];
  }): Document[] {
    const chatDocs = this.documents.get(chatId);

    if (!chatDocs) {
      return [];
    }

    let docs = Array.from(chatDocs.values());

    // Apply filters
    if (filters?.type) {
      docs = docs.filter((doc) => doc.type === filters.type);
    }

    if (filters?.tags && filters.tags.length > 0) {
      docs = docs.filter((doc) =>
        filters.tags!.some((tag) => doc.metadata.tags?.includes(tag))
      );
    }

    return docs;
  }

  /**
   * Search documents by keyword
   */
  searchDocuments(chatId: string, query: string): SearchResult[] {
    const docs = this.getDocuments(chatId);
    const results: SearchResult[] = [];

    const queryLower = query.toLowerCase();

    for (const doc of docs) {
      // Simple keyword search - could be enhanced with embeddings
      const nameMatch = doc.name.toLowerCase().includes(queryLower);
      const contentMatch = doc.content.toLowerCase().includes(queryLower);

      if (nameMatch || contentMatch) {
        let score = 0;

        if (nameMatch) {
          score += 0.5;
        }

        if (contentMatch) {
          // Count occurrences
          const occurrences = (doc.content.toLowerCase().match(new RegExp(queryLower, 'g')) || []).length;
          score += Math.min(occurrences * 0.1, 0.5);
        }

        results.push({
          document: doc,
          relevanceScore: score,
        });
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return results;
  }

  /**
   * Get relevant documents for a context
   */
  getRelevantDocuments(
    chatId: string,
    context: string,
    limit: number = 5,
  ): Document[] {
    const results = this.searchDocuments(chatId, context);
    return results.slice(0, limit).map((r) => r.document);
  }

  /**
   * Delete document
   */
  deleteDocument(chatId: string, documentId: string): void {
    const chatDocs = this.documents.get(chatId);

    if (chatDocs) {
      chatDocs.delete(documentId);
      this.saveToStorage();
      logger.info(`Deleted document ${documentId}`);
    }
  }

  /**
   * Delete all documents for a chat
   */
  deleteAllDocuments(chatId: string): void {
    this.documents.delete(chatId);
    this.saveToStorage();
    logger.info(`Deleted all documents for chat ${chatId}`);
  }

  /**
   * Get knowledge base statistics
   */
  getStats(chatId: string): KnowledgeBaseStats {
    const docs = this.getDocuments(chatId);

    const byType: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    let totalSize = 0;

    for (const doc of docs) {
      byType[doc.type] = (byType[doc.type] || 0) + 1;
      totalSize += doc.size;

      for (const tag of doc.metadata.tags || []) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }

    return {
      totalDocuments: docs.length,
      totalSize,
      byType,
      byTag,
    };
  }

  /**
   * Export document as markdown
   */
  exportAsMarkdown(chatId: string, documentId: string): string {
    const doc = this.getDocument(chatId, documentId);

    if (!doc) {
      throw new Error(`Document ${documentId} not found`);
    }

    let markdown = `# ${doc.name}\n\n`;
    markdown += `**Type:** ${doc.type}\n`;
    markdown += `**Uploaded:** ${new Date(doc.uploadedAt).toLocaleString()}\n`;

    if (doc.metadata.author) {
      markdown += `**Author:** ${doc.metadata.author}\n`;
    }

    if (doc.metadata.version) {
      markdown += `**Version:** ${doc.metadata.version}\n`;
    }

    if (doc.metadata.tags && doc.metadata.tags.length > 0) {
      markdown += `**Tags:** ${doc.metadata.tags.join(', ')}\n`;
    }

    markdown += `\n---\n\n`;
    markdown += doc.content;

    return markdown;
  }

  /**
   * Build context from documents
   */
  buildContext(chatId: string, maxTokens: number = 4000): string {
    const docs = this.getDocuments(chatId);

    if (docs.length === 0) {
      return '';
    }

    let context = '# Available Reference Documents\n\n';
    let currentTokens = this.estimateTokens(context);

    for (const doc of docs) {
      const docSection = `## ${doc.name}\n\n${doc.content}\n\n`;
      const docTokens = this.estimateTokens(docSection);

      if (currentTokens + docTokens > maxTokens) {
        // Truncate if too long
        const remainingTokens = maxTokens - currentTokens;
        const truncatedContent = doc.content.slice(0, remainingTokens * 4); // Rough estimate
        context += `## ${doc.name}\n\n${truncatedContent}...\n\n`;
        break;
      }

      context += docSection;
      currentTokens += docTokens;
    }

    return context;
  }

  /**
   * Estimate tokens (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Load documents from localStorage
   */
  private loadFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const data = localStorage.getItem(this.STORAGE_KEY);

        if (data) {
          const parsed = JSON.parse(data);

          for (const [chatId, docs] of Object.entries(parsed)) {
            const chatMap = new Map<string, Document>();

            for (const [docId, doc] of Object.entries(docs as Record<string, Document>)) {
              chatMap.set(docId, doc);
            }

            this.documents.set(chatId, chatMap);
          }

          logger.info('Loaded knowledge base from storage');
        }
      }
    } catch (error) {
      logger.error('Failed to load knowledge base from storage', error);
    }
  }

  /**
   * Save documents to localStorage
   */
  private saveToStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const data: Record<string, Record<string, Document>> = {};

        for (const [chatId, chatMap] of this.documents.entries()) {
          data[chatId] = {};

          for (const [docId, doc] of chatMap.entries()) {
            data[chatId][docId] = doc;
          }
        }

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      }
    } catch (error) {
      logger.error('Failed to save knowledge base to storage', error);
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create a global knowledge base instance
 */
let globalKnowledgeBase: KnowledgeBase | null = null;

export function getKnowledgeBase(): KnowledgeBase {
  if (!globalKnowledgeBase) {
    globalKnowledgeBase = new KnowledgeBase();
  }

  return globalKnowledgeBase;
}
