import { createScopedLogger } from '~/utils/logger';
import * as Diff from 'diff';

const logger = createScopedLogger('ConflictDetection');

export interface FileVersion {
  content: string;
  timestamp: number;
  source: 'user' | 'llm' | 'initial';
  hash?: string;
}

export interface ConflictInfo {
  hasConflict: boolean;
  conflictType?: 'concurrent_edit' | 'merge_required' | 'diverged';
  baseVersion?: FileVersion;
  currentVersion?: FileVersion;
  incomingVersion?: FileVersion;
  conflicts?: ConflictRegion[];
}

export interface ConflictRegion {
  startLine: number;
  endLine: number;
  currentContent: string;
  incomingContent: string;
  baseContent?: string;
}

export interface MergeResult {
  success: boolean;
  content?: string;
  conflicts?: ConflictRegion[];
  error?: string;
}

// Storage key for file versions
const FILE_VERSIONS_KEY = 'bolt.fileVersions';

// In-memory cache for file versions
let fileVersionsCache: Map<string, Map<string, FileVersion[]>> | null = null;

/**
 * Get the file versions map from cache or localStorage
 */
function getFileVersionsMap(): Map<string, Map<string, FileVersion[]>> {
  if (fileVersionsCache) {
    return fileVersionsCache;
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const versionsJson = localStorage.getItem(FILE_VERSIONS_KEY);

      if (versionsJson) {
        const data = JSON.parse(versionsJson);
        const map = new Map<string, Map<string, FileVersion[]>>();

        // Reconstruct the nested map structure
        for (const [chatId, files] of Object.entries(data)) {
          const fileMap = new Map<string, FileVersion[]>();

          for (const [filePath, versions] of Object.entries(files as Record<string, FileVersion[]>)) {
            fileMap.set(filePath, versions);
          }

          map.set(chatId, fileMap);
        }

        fileVersionsCache = map;
        return map;
      }
    }

    fileVersionsCache = new Map();
    return fileVersionsCache;
  } catch (error) {
    logger.error('Failed to load file versions from localStorage', error);
    fileVersionsCache = new Map();
    return fileVersionsCache;
  }
}

/**
 * Save file versions map to localStorage
 */
function saveFileVersionsMap(map: Map<string, Map<string, FileVersion[]>>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      // Convert nested maps to plain objects for JSON serialization
      const data: Record<string, Record<string, FileVersion[]>> = {};

      for (const [chatId, fileMap] of map.entries()) {
        data[chatId] = {};

        for (const [filePath, versions] of fileMap.entries()) {
          data[chatId][filePath] = versions;
        }
      }

      localStorage.setItem(FILE_VERSIONS_KEY, JSON.stringify(data));
      fileVersionsCache = map;
    }
  } catch (error) {
    logger.error('Failed to save file versions to localStorage', error);
  }
}

/**
 * Generate a simple hash for content comparison
 */
function hashContent(content: string): string {
  let hash = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return hash.toString(36);
}

/**
 * Record a new file version
 */
export function recordFileVersion(
  chatId: string,
  filePath: string,
  content: string,
  source: 'user' | 'llm' | 'initial',
): void {
  const versionsMap = getFileVersionsMap();
  const chatMap = versionsMap.get(chatId) || new Map<string, FileVersion[]>();
  const versions = chatMap.get(filePath) || [];

  const newVersion: FileVersion = {
    content,
    timestamp: Date.now(),
    source,
    hash: hashContent(content),
  };

  // Keep only the last 10 versions to avoid memory bloat
  const updatedVersions = [...versions, newVersion].slice(-10);

  chatMap.set(filePath, updatedVersions);
  versionsMap.set(chatId, chatMap);

  saveFileVersionsMap(versionsMap);

  logger.info(`Recorded ${source} version for ${filePath} in chat ${chatId}`);
}

/**
 * Get all versions for a file
 */
export function getFileVersions(chatId: string, filePath: string): FileVersion[] {
  const versionsMap = getFileVersionsMap();
  const chatMap = versionsMap.get(chatId);

  if (!chatMap) {
    return [];
  }

  return chatMap.get(filePath) || [];
}

/**
 * Get the latest version for a file
 */
export function getLatestVersion(chatId: string, filePath: string): FileVersion | null {
  const versions = getFileVersions(chatId, filePath);

  if (versions.length === 0) {
    return null;
  }

  return versions[versions.length - 1];
}

/**
 * Detect conflicts between current and incoming changes
 */
export function detectConflicts(
  chatId: string,
  filePath: string,
  currentContent: string,
  incomingContent: string,
): ConflictInfo {
  const versions = getFileVersions(chatId, filePath);

  if (versions.length === 0) {
    // No previous versions, no conflict
    return { hasConflict: false };
  }

  const latestVersion = versions[versions.length - 1];
  const baseVersion = versions.find((v) => v.source === 'initial') || versions[0];

  // Check if current content matches the latest recorded version
  const currentHash = hashContent(currentContent);
  const latestHash = latestVersion.hash;

  if (currentHash === hashContent(incomingContent)) {
    // Incoming is identical to current, no conflict
    return { hasConflict: false };
  }

  if (currentHash !== latestHash) {
    // Current content has diverged from latest version
    logger.warn(`Concurrent edit detected for ${filePath}`);

    return {
      hasConflict: true,
      conflictType: 'concurrent_edit',
      baseVersion: latestVersion,
      currentVersion: {
        content: currentContent,
        timestamp: Date.now(),
        source: 'user',
        hash: currentHash,
      },
      incomingVersion: {
        content: incomingContent,
        timestamp: Date.now(),
        source: 'llm',
        hash: hashContent(incomingContent),
      },
      conflicts: findConflictRegions(latestVersion.content, currentContent, incomingContent),
    };
  }

  // Check if merge is needed
  if (baseVersion && baseVersion.content !== currentContent && baseVersion.content !== incomingContent) {
    logger.info(`Merge required for ${filePath}`);

    return {
      hasConflict: true,
      conflictType: 'merge_required',
      baseVersion,
      currentVersion: {
        content: currentContent,
        timestamp: Date.now(),
        source: 'user',
        hash: currentHash,
      },
      incomingVersion: {
        content: incomingContent,
        timestamp: Date.now(),
        source: 'llm',
        hash: hashContent(incomingContent),
      },
    };
  }

  return { hasConflict: false };
}

/**
 * Find conflict regions between base, current, and incoming versions
 */
function findConflictRegions(base: string, current: string, incoming: string): ConflictRegion[] {
  const conflicts: ConflictRegion[] = [];

  // Get diffs between base and current, base and incoming
  const currentDiff = Diff.diffLines(base, current);
  const incomingDiff = Diff.diffLines(base, incoming);

  let currentLine = 0;
  let incomingLine = 0;
  let baseLine = 0;

  // Find overlapping changes
  for (let i = 0; i < Math.max(currentDiff.length, incomingDiff.length); i++) {
    const currentChange = currentDiff[i];
    const incomingChange = incomingDiff[i];

    if (currentChange && incomingChange) {
      const currentChanged = currentChange.added || currentChange.removed;
      const incomingChanged = incomingChange.added || incomingChange.removed;

      if (currentChanged && incomingChanged) {
        // Both changed the same region
        const lineCount = currentChange.count || 0;

        conflicts.push({
          startLine: baseLine,
          endLine: baseLine + lineCount,
          currentContent: currentChange.value,
          incomingContent: incomingChange.value,
          baseContent: base.split('\n').slice(baseLine, baseLine + lineCount).join('\n'),
        });
      }
    }

    if (currentChange && !currentChange.removed) {
      currentLine += currentChange.count || 0;
    }

    if (incomingChange && !incomingChange.removed) {
      incomingLine += incomingChange.count || 0;
    }

    if (currentChange && !currentChange.added && !currentChange.removed) {
      baseLine += currentChange.count || 0;
    }
  }

  return conflicts;
}

/**
 * Perform a three-way merge
 */
export function performThreeWayMerge(
  base: string,
  current: string,
  incoming: string,
): MergeResult {
  try {
    // Split into lines for line-by-line comparison
    const baseLines = base.split('\n');
    const currentLines = current.split('\n');
    const incomingLines = incoming.split('\n');

    // Get diffs
    const currentDiff = Diff.diffLines(base, current);
    const incomingDiff = Diff.diffLines(base, incoming);

    const merged: string[] = [];
    const conflicts: ConflictRegion[] = [];

    let baseIndex = 0;
    let currentIndex = 0;
    let incomingIndex = 0;

    // Process both diffs in parallel
    for (let i = 0; i < Math.max(currentDiff.length, incomingDiff.length); i++) {
      const currentChange = i < currentDiff.length ? currentDiff[i] : null;
      const incomingChange = i < incomingDiff.length ? incomingDiff[i] : null;

      if (currentChange && incomingChange) {
        if (!currentChange.added && !currentChange.removed && !incomingChange.added && !incomingChange.removed) {
          // Both unchanged, use base
          merged.push(currentChange.value);
          baseIndex += currentChange.count || 0;
          currentIndex += currentChange.count || 0;
          incomingIndex += incomingChange.count || 0;
        } else if (currentChange.added && !incomingChange.added && !incomingChange.removed) {
          // Only current added, use current
          merged.push(currentChange.value);
          currentIndex += currentChange.count || 0;
        } else if (incomingChange.added && !currentChange.added && !currentChange.removed) {
          // Only incoming added, use incoming
          merged.push(incomingChange.value);
          incomingIndex += incomingChange.count || 0;
        } else {
          // Conflict: both modified
          const startLine = merged.length;
          const currentContent = currentChange.value;
          const incomingContent = incomingChange.value;

          // Add conflict markers
          merged.push('<<<<<<< CURRENT');
          merged.push(currentContent);
          merged.push('=======');
          merged.push(incomingContent);
          merged.push('>>>>>>> INCOMING');

          conflicts.push({
            startLine,
            endLine: merged.length,
            currentContent,
            incomingContent,
            baseContent: currentChange.removed ? currentChange.value : '',
          });

          baseIndex += (currentChange.count || 0);
          currentIndex += (currentChange.count || 0);
          incomingIndex += (incomingChange.count || 0);
        }
      } else if (currentChange) {
        // Only current has changes
        merged.push(currentChange.value);
        currentIndex += currentChange.count || 0;

        if (!currentChange.added) {
          baseIndex += currentChange.count || 0;
        }
      } else if (incomingChange) {
        // Only incoming has changes
        merged.push(incomingChange.value);
        incomingIndex += incomingChange.count || 0;

        if (!incomingChange.added) {
          baseIndex += incomingChange.count || 0;
        }
      }
    }

    const mergedContent = merged.join('');

    if (conflicts.length === 0) {
      return {
        success: true,
        content: mergedContent,
      };
    }

    return {
      success: false,
      content: mergedContent,
      conflicts,
    };
  } catch (error) {
    logger.error('Three-way merge failed', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown merge error',
    };
  }
}

/**
 * Clear all file versions for a chat
 */
export function clearFileVersions(chatId: string): void {
  const versionsMap = getFileVersionsMap();
  versionsMap.delete(chatId);
  saveFileVersionsMap(versionsMap);

  logger.info(`Cleared all file versions for chat ${chatId}`);
}

/**
 * Clear all file versions
 */
export function clearAllFileVersions(): void {
  const versionsMap = new Map<string, Map<string, FileVersion[]>>();
  saveFileVersionsMap(versionsMap);

  logger.info('Cleared all file versions');
}
