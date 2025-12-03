import { createScopedLogger } from '~/utils/logger';
import type { CoreMessage } from 'ai';

const logger = createScopedLogger('PromptOptimizer');

export interface ModelCapabilities {
  contextWindow: number;
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
  recommendedMaxTokens: number;
  isReasoningModel: boolean;
  size: 'small' | 'medium' | 'large';
}

export interface OptimizationOptions {
  targetModel: string;
  capabilities: ModelCapabilities;
  preserveCodeBlocks?: boolean;
  preserveFileReferences?: boolean;
  maxContextTokens?: number;
  compressionLevel?: 'none' | 'light' | 'medium' | 'aggressive';
}

export interface OptimizationResult {
  originalTokens: number;
  optimizedTokens: number;
  compressionRatio: number;
  messages: CoreMessage[];
  removedMessages: number;
  truncatedContent: boolean;
}

/**
 * Prompt optimizer for smaller models
 */
export class PromptOptimizer {
  /**
   * Optimize messages for a specific model
   */
  optimize(messages: CoreMessage[], options: OptimizationOptions): OptimizationResult {
    logger.info(`Optimizing ${messages.length} messages for ${options.targetModel}`);

    const originalTokens = this.estimateTokens(messages);
    let optimizedMessages = [...messages];

    // Apply optimization strategies based on compression level
    switch (options.compressionLevel) {
      case 'aggressive':
        optimizedMessages = this.aggressiveOptimization(optimizedMessages, options);
        break;
      case 'medium':
        optimizedMessages = this.mediumOptimization(optimizedMessages, options);
        break;
      case 'light':
        optimizedMessages = this.lightOptimization(optimizedMessages, options);
        break;
      default:
        break;
    }

    // Ensure we stay within context window
    const maxTokens = options.maxContextTokens || options.capabilities.contextWindow * 0.7;
    optimizedMessages = this.enforceTokenLimit(optimizedMessages, maxTokens, options);

    const optimizedTokens = this.estimateTokens(optimizedMessages);
    const compressionRatio = originalTokens > 0 ? optimizedTokens / originalTokens : 1;

    logger.info(
      `Optimization complete: ${originalTokens} -> ${optimizedTokens} tokens (${(compressionRatio * 100).toFixed(1)}%)`,
    );

    return {
      originalTokens,
      optimizedTokens,
      compressionRatio,
      messages: optimizedMessages,
      removedMessages: messages.length - optimizedMessages.length,
      truncatedContent: compressionRatio < 0.9,
    };
  }

  /**
   * Light optimization - minimal changes
   */
  private lightOptimization(messages: CoreMessage[], options: OptimizationOptions): CoreMessage[] {
    return messages.map((msg) => {
      if (typeof msg.content === 'string') {
        // Remove excessive whitespace
        const content = msg.content.replace(/\n{3,}/g, '\n\n').trim();
        return { ...msg, content };
      }

      return msg;
    });
  }

  /**
   * Medium optimization - moderate compression
   */
  private mediumOptimization(messages: CoreMessage[], options: OptimizationOptions): CoreMessage[] {
    let optimized = this.lightOptimization(messages, options);

    // Remove old assistant messages but keep recent ones
    const keepRecentMessages = 10;
    optimized = this.pruneOldMessages(optimized, keepRecentMessages);

    // Summarize repetitive content
    optimized = this.summarizeRepetitiveContent(optimized);

    return optimized;
  }

  /**
   * Aggressive optimization - maximum compression
   */
  private aggressiveOptimization(messages: CoreMessage[], options: OptimizationOptions): CoreMessage[] {
    let optimized = this.mediumOptimization(messages, options);

    // Keep only the most recent messages
    const keepRecentMessages = 5;
    optimized = this.pruneOldMessages(optimized, keepRecentMessages);

    // Truncate long messages
    optimized = this.truncateLongMessages(optimized, options);

    // Remove non-essential metadata
    optimized = optimized.map((msg) => {
      const { role, content } = msg;
      return { role, content };
    });

    return optimized;
  }

  /**
   * Prune old messages, keeping only recent ones
   */
  private pruneOldMessages(messages: CoreMessage[], keepCount: number): CoreMessage[] {
    if (messages.length <= keepCount) {
      return messages;
    }

    // Always keep the system message if it exists
    const systemMessage = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    // Keep the most recent messages
    const recentMessages = otherMessages.slice(-keepCount);

    if (systemMessage) {
      return [systemMessage, ...recentMessages];
    }

    return recentMessages;
  }

  /**
   * Summarize repetitive content
   */
  private summarizeRepetitiveContent(messages: CoreMessage[]): CoreMessage[] {
    // Detect and summarize repetitive patterns
    const seenContent = new Set<string>();
    const result: CoreMessage[] = [];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        const contentHash = this.hashContent(msg.content);

        if (seenContent.has(contentHash)) {
          // Skip duplicate or very similar content
          continue;
        }

        seenContent.add(contentHash);
      }

      result.push(msg);
    }

    return result;
  }

  /**
   * Truncate long messages
   */
  private truncateLongMessages(messages: CoreMessage[], options: OptimizationOptions): CoreMessage[] {
    const maxLength = options.capabilities.size === 'small' ? 2000 : 4000;

    return messages.map((msg) => {
      if (typeof msg.content === 'string' && msg.content.length > maxLength) {
        let truncated = msg.content.slice(0, maxLength);

        // Try to truncate at a natural boundary
        const lastNewline = truncated.lastIndexOf('\n');

        if (lastNewline > maxLength * 0.8) {
          truncated = truncated.slice(0, lastNewline);
        }

        // Preserve code blocks if option is set
        if (options.preserveCodeBlocks) {
          truncated = this.preserveCodeBlocksInTruncation(msg.content, truncated);
        }

        return {
          ...msg,
          content: truncated + '\n\n[Content truncated for context optimization]',
        };
      }

      return msg;
    });
  }

  /**
   * Preserve code blocks when truncating
   */
  private preserveCodeBlocksInTruncation(original: string, truncated: string): string {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = original.match(codeBlockRegex) || [];

    // If we cut off in the middle of a code block, remove the partial block
    if (truncated.split('```').length % 2 === 0) {
      // Odd number of backticks, we're in a code block
      const lastCodeBlockStart = truncated.lastIndexOf('```');
      truncated = truncated.slice(0, lastCodeBlockStart);
    }

    return truncated;
  }

  /**
   * Enforce token limit by removing oldest messages
   */
  private enforceTokenLimit(
    messages: CoreMessage[],
    maxTokens: number,
    options: OptimizationOptions,
  ): CoreMessage[] {
    let currentTokens = this.estimateTokens(messages);

    if (currentTokens <= maxTokens) {
      return messages;
    }

    // Keep system message and recent messages
    const systemMessage = messages.find((m) => m.role === 'system');
    let otherMessages = messages.filter((m) => m.role !== 'system');

    // Remove messages from the middle, keeping recent context
    while (currentTokens > maxTokens && otherMessages.length > 2) {
      // Remove from the middle to preserve recent context
      const removeIndex = Math.floor(otherMessages.length / 2);
      otherMessages.splice(removeIndex, 1);

      const testMessages = systemMessage ? [systemMessage, ...otherMessages] : otherMessages;
      currentTokens = this.estimateTokens(testMessages);
    }

    return systemMessage ? [systemMessage, ...otherMessages] : otherMessages;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(messages: CoreMessage[]): number {
    let total = 0;

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        // Rough estimate: ~4 characters per token
        total += msg.content.length / 4;
      } else if (Array.isArray(msg.content)) {
        // Handle multi-part content
        for (const part of msg.content) {
          if (typeof part === 'object' && 'text' in part) {
            total += part.text.length / 4;
          }
        }
      }

      // Add overhead for role and structure
      total += 4;
    }

    return Math.ceil(total);
  }

  /**
   * Hash content for deduplication
   */
  private hashContent(content: string): string {
    // Simple hash for detecting similar content
    let hash = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return hash.toString(36);
  }

  /**
   * Create an optimized system prompt for smaller models
   */
  createOptimizedSystemPrompt(
    originalPrompt: string,
    capabilities: ModelCapabilities,
  ): string {
    if (capabilities.size === 'large') {
      return originalPrompt;
    }

    // For smaller models, create a more concise prompt
    const lines = originalPrompt.split('\n');
    const essential: string[] = [];

    // Keep only essential instructions
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and overly verbose explanations
      if (!trimmed || trimmed.length < 10) {
        continue;
      }

      // Keep instructions, skip examples for small models
      if (
        trimmed.startsWith('-') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('1.') ||
        trimmed.includes('IMPORTANT') ||
        trimmed.includes('MUST') ||
        trimmed.includes('NEVER')
      ) {
        essential.push(line);
      }
    }

    let optimized = essential.join('\n');

    // Further compress for very small models
    if (capabilities.size === 'small') {
      optimized = optimized
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return optimized;
  }
}

/**
 * Get model capabilities based on model name
 */
export function getModelCapabilities(modelName: string): ModelCapabilities {
  const name = modelName.toLowerCase();

  // Determine model size
  let size: 'small' | 'medium' | 'large' = 'medium';

  if (name.includes('mini') || name.includes('7b') || name.includes('8b') || name.includes('small')) {
    size = 'small';
  } else if (
    name.includes('large') ||
    name.includes('70b') ||
    name.includes('claude') ||
    name.includes('gpt-4')
  ) {
    size = 'large';
  }

  // Determine context window
  let contextWindow = 8192;

  if (name.includes('claude')) {
    contextWindow = 200000;
  } else if (name.includes('gpt-4') && !name.includes('mini')) {
    contextWindow = 128000;
  } else if (name.includes('gemini')) {
    contextWindow = name.includes('1.5') ? 1000000 : 32000;
  }

  // Check if reasoning model
  const isReasoningModel = /o1|o3|reasoning/i.test(name);

  return {
    contextWindow,
    supportsToolCalling: !name.includes('instruct-only'),
    supportsStreaming: true,
    supportsVision: name.includes('vision') || name.includes('gpt-4') || name.includes('claude-3'),
    recommendedMaxTokens: Math.floor(contextWindow * 0.7),
    isReasoningModel,
    size,
  };
}

/**
 * Create a global prompt optimizer instance
 */
let globalOptimizer: PromptOptimizer | null = null;

export function getPromptOptimizer(): PromptOptimizer {
  if (!globalOptimizer) {
    globalOptimizer = new PromptOptimizer();
  }

  return globalOptimizer;
}
