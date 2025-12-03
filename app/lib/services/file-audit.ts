import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FileAudit');

export interface AuditEntry {
  id: string;
  chatId: string;
  filePath: string;
  action: 'create' | 'update' | 'delete' | 'lock' | 'unlock' | 'conflict' | 'merge';
  timestamp: number;
  source: 'user' | 'llm' | 'system';
  metadata?: {
    previousContent?: string;
    newContent?: string;
    contentHash?: string;
    conflictResolution?: 'manual' | 'auto' | 'keep_current' | 'keep_incoming';
    mergeStrategy?: 'three_way' | 'ours' | 'theirs';
    reason?: string;
  };
}

export interface AuditSummary {
  totalEntries: number;
  fileChanges: number;
  conflicts: number;
  locks: number;
  lastActivity: number;
}

// Storage key for audit trail
const AUDIT_TRAIL_KEY = 'bolt.fileAudit';

// In-memory cache
let auditCache: Map<string, AuditEntry[]> | null = null;

// Maximum entries per chat to keep (prevent unbounded growth)
const MAX_ENTRIES_PER_CHAT = 1000;

/**
 * Get audit entries from cache or localStorage
 */
function getAuditMap(): Map<string, AuditEntry[]> {
  if (auditCache) {
    return auditCache;
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const auditJson = localStorage.getItem(AUDIT_TRAIL_KEY);

      if (auditJson) {
        const data = JSON.parse(auditJson);
        const map = new Map<string, AuditEntry[]>();

        for (const [chatId, entries] of Object.entries(data)) {
          map.set(chatId, entries as AuditEntry[]);
        }

        auditCache = map;
        return map;
      }
    }

    auditCache = new Map();
    return auditCache;
  } catch (error) {
    logger.error('Failed to load audit trail from localStorage', error);
    auditCache = new Map();
    return auditCache;
  }
}

/**
 * Save audit map to localStorage
 */
function saveAuditMap(map: Map<string, AuditEntry[]>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const data: Record<string, AuditEntry[]> = {};

      for (const [chatId, entries] of map.entries()) {
        // Only keep the most recent entries to prevent storage bloat
        data[chatId] = entries.slice(-MAX_ENTRIES_PER_CHAT);
      }

      localStorage.setItem(AUDIT_TRAIL_KEY, JSON.stringify(data));
      auditCache = map;
    }
  } catch (error) {
    logger.error('Failed to save audit trail to localStorage', error);
  }
}

/**
 * Generate a unique ID for an audit entry
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add an audit entry
 */
export function addAuditEntry(
  chatId: string,
  filePath: string,
  action: AuditEntry['action'],
  source: AuditEntry['source'],
  metadata?: AuditEntry['metadata'],
): void {
  const auditMap = getAuditMap();
  const entries = auditMap.get(chatId) || [];

  const newEntry: AuditEntry = {
    id: generateId(),
    chatId,
    filePath,
    action,
    timestamp: Date.now(),
    source,
    metadata,
  };

  entries.push(newEntry);
  auditMap.set(chatId, entries);
  saveAuditMap(auditMap);

  logger.info(`Audit: ${action} ${filePath} by ${source} in chat ${chatId}`);
}

/**
 * Get all audit entries for a chat
 */
export function getAuditEntries(chatId: string, options?: {
  filePath?: string;
  action?: AuditEntry['action'];
  source?: AuditEntry['source'];
  limit?: number;
  offset?: number;
}): AuditEntry[] {
  const auditMap = getAuditMap();
  let entries = auditMap.get(chatId) || [];

  // Apply filters
  if (options?.filePath) {
    entries = entries.filter((e) => e.filePath === options.filePath);
  }

  if (options?.action) {
    entries = entries.filter((e) => e.action === options.action);
  }

  if (options?.source) {
    entries = entries.filter((e) => e.source === options.source);
  }

  // Sort by timestamp descending (most recent first)
  entries.sort((a, b) => b.timestamp - a.timestamp);

  // Apply pagination
  if (options?.offset !== undefined || options?.limit !== undefined) {
    const offset = options.offset || 0;
    const limit = options.limit || entries.length;
    entries = entries.slice(offset, offset + limit);
  }

  return entries;
}

/**
 * Get audit summary for a chat
 */
export function getAuditSummary(chatId: string): AuditSummary {
  const auditMap = getAuditMap();
  const entries = auditMap.get(chatId) || [];

  const fileChanges = entries.filter((e) =>
    e.action === 'create' || e.action === 'update' || e.action === 'delete'
  ).length;

  const conflicts = entries.filter((e) => e.action === 'conflict').length;
  const locks = entries.filter((e) => e.action === 'lock' || e.action === 'unlock').length;

  const lastActivity = entries.length > 0
    ? Math.max(...entries.map((e) => e.timestamp))
    : 0;

  return {
    totalEntries: entries.length,
    fileChanges,
    conflicts,
    locks,
    lastActivity,
  };
}

/**
 * Get file history (all entries for a specific file)
 */
export function getFileHistory(chatId: string, filePath: string): AuditEntry[] {
  return getAuditEntries(chatId, { filePath });
}

/**
 * Get recent activity across all files
 */
export function getRecentActivity(chatId: string, limit: number = 50): AuditEntry[] {
  return getAuditEntries(chatId, { limit });
}

/**
 * Clear audit entries for a chat
 */
export function clearAuditEntries(chatId: string): void {
  const auditMap = getAuditMap();
  auditMap.delete(chatId);
  saveAuditMap(auditMap);

  logger.info(`Cleared audit trail for chat ${chatId}`);
}

/**
 * Clear all audit entries
 */
export function clearAllAuditEntries(): void {
  const auditMap = new Map<string, AuditEntry[]>();
  saveAuditMap(auditMap);

  logger.info('Cleared all audit trails');
}

/**
 * Export audit trail as JSON
 */
export function exportAuditTrail(chatId: string): string {
  const entries = getAuditEntries(chatId);
  return JSON.stringify(entries, null, 2);
}

/**
 * Export audit trail as CSV
 */
export function exportAuditTrailCSV(chatId: string): string {
  const entries = getAuditEntries(chatId);

  if (entries.length === 0) {
    return '';
  }

  const headers = ['ID', 'Timestamp', 'File Path', 'Action', 'Source', 'Metadata'];
  const rows = entries.map((entry) => [
    entry.id,
    new Date(entry.timestamp).toISOString(),
    entry.filePath,
    entry.action,
    entry.source,
    entry.metadata ? JSON.stringify(entry.metadata) : '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Get conflict statistics
 */
export function getConflictStats(chatId: string): {
  total: number;
  resolved: number;
  pending: number;
  byFile: Record<string, number>;
} {
  const entries = getAuditEntries(chatId, { action: 'conflict' });

  const byFile: Record<string, number> = {};

  for (const entry of entries) {
    byFile[entry.filePath] = (byFile[entry.filePath] || 0) + 1;
  }

  const resolved = entries.filter((e) => e.metadata?.conflictResolution).length;

  return {
    total: entries.length,
    resolved,
    pending: entries.length - resolved,
    byFile,
  };
}

/**
 * Prune old audit entries to maintain performance
 * Keeps only the most recent MAX_ENTRIES_PER_CHAT entries per chat
 */
export function pruneAuditEntries(): void {
  const auditMap = getAuditMap();
  let pruned = 0;

  for (const [chatId, entries] of auditMap.entries()) {
    if (entries.length > MAX_ENTRIES_PER_CHAT) {
      const kept = entries.slice(-MAX_ENTRIES_PER_CHAT);
      auditMap.set(chatId, kept);
      pruned += entries.length - kept.length;
    }
  }

  if (pruned > 0) {
    saveAuditMap(auditMap);
    logger.info(`Pruned ${pruned} old audit entries`);
  }
}

// Auto-prune on module load if needed
if (typeof window !== 'undefined') {
  // Run pruning once on startup
  setTimeout(() => {
    pruneAuditEntries();
  }, 5000);
}
