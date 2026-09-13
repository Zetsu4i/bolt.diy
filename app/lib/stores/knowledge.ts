import { map } from 'nanostores';
import { useStore } from '@nanostores/react';

/**
 * Per-project knowledge base: reference documents uploaded by the user
 * (markdown specs, coding style guides, API references, ...) that get
 * injected into every chat request as a <knowledge_docs> prompt section.
 */

export interface KnowledgeDoc {
  id: string;
  name: string;
  content: string;
  size: number;
  addedAt: number;
}

const STORAGE_KEY = 'bolt.knowledge';

/** Hard limits to keep prompts reasonably sized. */
export const KNOWLEDGE_LIMITS = {
  maxDocs: 12,
  maxDocChars: 40_000,
  maxTotalChars: 120_000,
};

type KnowledgeMap = Record<string, KnowledgeDoc[]>;

function isBrowser() {
  return typeof window !== 'undefined';
}

function loadFromStorage(): KnowledgeMap {
  if (!isBrowser()) {
    return {};
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    return raw ? (JSON.parse(raw) as KnowledgeMap) : {};
  } catch {
    return {};
  }
}

function persist(knowledge: KnowledgeMap) {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(knowledge));
  } catch {
    // Storage full — drop the oldest chat's docs and retry once.
    try {
      const keys = Object.keys(knowledge);

      if (keys.length > 0) {
        delete knowledge[keys[0]];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(knowledge));
      }
    } catch {
      // Ignore.
    }
  }
}

export const knowledgeStore = map<KnowledgeMap>(loadFromStorage());

function getDocsFor(chatId: string): KnowledgeDoc[] {
  return knowledgeStore.get()[chatId] || [];
}

export function addKnowledgeDoc(chatId: string, doc: KnowledgeDoc) {
  const all = { ...knowledgeStore.get() };
  const docs = [...(all[chatId] || [])];

  // Enforce per-doc and total size limits.
  const trimmedContent = doc.content.slice(0, KNOWLEDGE_LIMITS.maxDocChars);
  const finalDoc: KnowledgeDoc = { ...doc, content: trimmedContent, size: trimmedContent.length };

  let total = docs.reduce((sum, d) => sum + d.content.length, 0) + finalDoc.content.length;

  while (docs.length > 0 && (docs.length + 1 > KNOWLEDGE_LIMITS.maxDocs || total > KNOWLEDGE_LIMITS.maxTotalChars)) {
    const removed = docs.shift();
    total -= removed?.content.length || 0;
  }

  docs.push(finalDoc);
  all[chatId] = docs;
  knowledgeStore.set(all);
  persist(all);
}

export function removeKnowledgeDoc(chatId: string, docId: string) {
  const all = { ...knowledgeStore.get() };
  all[chatId] = (all[chatId] || []).filter((doc) => doc.id !== docId);
  knowledgeStore.set(all);
  persist(all);
}

export function clearKnowledgeDocs(chatId: string) {
  const all = { ...knowledgeStore.get() };
  delete all[chatId];
  knowledgeStore.set(all);
  persist(all);
}

/** Reads docs without React (used when sending chat requests). */
export function getKnowledgeDocs(chatId: string | null | undefined): KnowledgeDoc[] {
  if (!chatId) {
    return [];
  }

  return getDocsFor(chatId);
}

/** Server payload shape (content already truncated client-side). */
export function toServerPayload(docs: KnowledgeDoc[]): { name: string; content: string }[] {
  return docs.map((doc) => ({ name: doc.name, content: doc.content }));
}

const TEXT_EXTENSIONS = [
  'md', 'markdown', 'txt', 'text', 'json', 'csv', 'tsv', 'yml', 'yaml', 'xml', 'html', 'htm',
  'css', 'scss', 'sass', 'less', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs',
  'java', 'kt', 'php', 'sql', 'sh', 'bash', 'zsh', 'toml', 'ini', 'cfg', 'conf', 'env', 'graphql',
  'gql', 'vue', 'svelte', 'astro', 'prisma',
];

function isTextFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (TEXT_EXTENSIONS.includes(ext)) {
    return true;
  }

  return file.type.startsWith('text/') || file.type === 'application/json';
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Reads a set of files and stores them as knowledge docs for the given chat.
 * Non-text files are skipped. Returns the number of docs actually added.
 */
export async function addKnowledgeFiles(chatId: string, files: File[]): Promise<number> {
  let added = 0;

  for (const file of files) {
    if (!isTextFile(file)) {
      continue;
    }

    try {
      const content = await readFileAsText(file);

      addKnowledgeDoc(chatId, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: file.name,
        content,
        size: content.length,
        addedAt: Date.now(),
      });
      added += 1;
    } catch {
      // Skip unreadable files.
    }
  }

  return added;
}

/** React hook for a chat's knowledge docs. */
export function useKnowledgeDocs(chatId: string | null | undefined): KnowledgeDoc[] {
  const knowledge = useStore(knowledgeStore);

  return (chatId ? knowledge[chatId] : undefined) || [];
}
