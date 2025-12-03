import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('VSCodeIntegration');

export interface VSCodeConnection {
  connected: boolean;
  extensionVersion?: string;
  workspaceFolder?: string;
}

export interface FileChange {
  path: string;
  type: 'create' | 'update' | 'delete';
  content?: string;
  previousContent?: string;
}

export interface ConfirmationRequest {
  id: string;
  type: 'file_change' | 'command' | 'terminal';
  title: string;
  description: string;
  changes?: FileChange[];
  command?: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface SyncState {
  lastSyncTime: number;
  pendingChanges: FileChange[];
  conflicts: Array<{
    path: string;
    localContent: string;
    remoteContent: string;
  }>;
}

/**
 * VSCode integration service for syncing with VSCode extension
 */
export class VSCodeIntegration {
  private connection: VSCodeConnection = { connected: false };
  private pendingRequests: Map<string, ConfirmationRequest> = new Map();
  private syncState: SyncState = {
    lastSyncTime: 0,
    pendingChanges: [],
    conflicts: [],
  };
  private messagePort: MessagePort | null = null;

  /**
   * Initialize connection with VSCode extension
   */
  async connect(): Promise<boolean> {
    logger.info('Attempting to connect to VSCode extension');

    try {
      // Check if running in VSCode webview context
      if (typeof window !== 'undefined' && (window as any).acquireVsCodeApi) {
        const vscode = (window as any).acquireVsCodeApi();
        this.connection.connected = true;
        logger.info('Connected to VSCode extension');
        return true;
      }

      // Try to connect via MessageChannel for web-based connection
      if (typeof window !== 'undefined' && window.parent !== window) {
        return new Promise((resolve) => {
          const channel = new MessageChannel();
          this.messagePort = channel.port1;

          channel.port1.onmessage = (event) => {
            if (event.data.type === 'vscode-connection-ack') {
              this.connection.connected = true;
              this.connection.extensionVersion = event.data.version;
              this.connection.workspaceFolder = event.data.workspaceFolder;
              logger.info(`Connected to VSCode extension v${event.data.version}`);
              resolve(true);
            }
          };

          // Send connection request to parent window
          window.parent.postMessage(
            {
              type: 'vscode-connection-request',
              source: 'bolt.diy',
            },
            '*',
            [channel.port2],
          );

          // Timeout after 5 seconds
          setTimeout(() => {
            if (!this.connection.connected) {
              logger.warn('VSCode extension connection timeout');
              resolve(false);
            }
          }, 5000);
        });
      }

      logger.warn('VSCode extension not detected');
      return false;
    } catch (error) {
      logger.error('Failed to connect to VSCode extension', error);
      return false;
    }
  }

  /**
   * Disconnect from VSCode extension
   */
  disconnect(): void {
    this.connection.connected = false;
    this.messagePort?.close();
    this.messagePort = null;
    logger.info('Disconnected from VSCode extension');
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.connection.connected;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(): VSCodeConnection {
    return { ...this.connection };
  }

  /**
   * Request confirmation for file changes
   */
  async requestFileChangeConfirmation(changes: FileChange[]): Promise<ConfirmationRequest> {
    const request: ConfirmationRequest = {
      id: this.generateId(),
      type: 'file_change',
      title: 'Confirm File Changes',
      description: `${changes.length} file(s) will be modified`,
      changes,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.pendingRequests.set(request.id, request);

    // Send to VSCode
    if (this.connection.connected) {
      this.sendMessage({
        type: 'confirmation-request',
        request,
      });
    }

    logger.info(`Created confirmation request ${request.id} for ${changes.length} changes`);

    return request;
  }

  /**
   * Request confirmation for command execution
   */
  async requestCommandConfirmation(command: string, description: string): Promise<ConfirmationRequest> {
    const request: ConfirmationRequest = {
      id: this.generateId(),
      type: 'command',
      title: 'Confirm Command Execution',
      description,
      command,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.pendingRequests.set(request.id, request);

    // Send to VSCode
    if (this.connection.connected) {
      this.sendMessage({
        type: 'confirmation-request',
        request,
      });
    }

    logger.info(`Created confirmation request ${request.id} for command: ${command}`);

    return request;
  }

  /**
   * Approve a confirmation request
   */
  approveRequest(requestId: string): void {
    const request = this.pendingRequests.get(requestId);

    if (request) {
      request.status = 'approved';

      // Send approval to VSCode
      if (this.connection.connected) {
        this.sendMessage({
          type: 'confirmation-response',
          requestId,
          approved: true,
        });
      }

      logger.info(`Approved request ${requestId}`);
    }
  }

  /**
   * Reject a confirmation request
   */
  rejectRequest(requestId: string): void {
    const request = this.pendingRequests.get(requestId);

    if (request) {
      request.status = 'rejected';

      // Send rejection to VSCode
      if (this.connection.connected) {
        this.sendMessage({
          type: 'confirmation-response',
          requestId,
          approved: false,
        });
      }

      logger.info(`Rejected request ${requestId}`);
    }
  }

  /**
   * Get pending confirmation requests
   */
  getPendingRequests(): ConfirmationRequest[] {
    return Array.from(this.pendingRequests.values()).filter((r) => r.status === 'pending');
  }

  /**
   * Sync files with VSCode workspace
   */
  async syncFiles(files: Record<string, string>): Promise<void> {
    if (!this.connection.connected) {
      throw new Error('Not connected to VSCode extension');
    }

    logger.info(`Syncing ${Object.keys(files).length} files with VSCode`);

    // Send sync request
    this.sendMessage({
      type: 'sync-files',
      files,
      timestamp: Date.now(),
    });
  }

  /**
   * Pull files from VSCode workspace
   */
  async pullFiles(): Promise<Record<string, string>> {
    if (!this.connection.connected) {
      throw new Error('Not connected to VSCode extension');
    }

    logger.info('Pulling files from VSCode workspace');

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Pull files timeout'));
      }, 10000);

      // Set up one-time message handler
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'pull-files-response') {
          clearTimeout(timeoutId);
          this.messagePort?.removeEventListener('message', handler);
          resolve(event.data.files);
        }
      };

      this.messagePort?.addEventListener('message', handler);

      // Send pull request
      this.sendMessage({
        type: 'pull-files',
      });
    });
  }

  /**
   * Open file in VSCode
   */
  async openFile(filePath: string, line?: number): Promise<void> {
    if (!this.connection.connected) {
      throw new Error('Not connected to VSCode extension');
    }

    logger.info(`Opening file in VSCode: ${filePath}${line ? `:${line}` : ''}`);

    this.sendMessage({
      type: 'open-file',
      filePath,
      line,
    });
  }

  /**
   * Execute command in VSCode terminal
   */
  async executeCommand(command: string, cwd?: string): Promise<void> {
    if (!this.connection.connected) {
      throw new Error('Not connected to VSCode extension');
    }

    logger.info(`Executing command in VSCode terminal: ${command}`);

    this.sendMessage({
      type: 'execute-command',
      command,
      cwd,
    });
  }

  /**
   * Show notification in VSCode
   */
  async showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
    if (!this.connection.connected) {
      return;
    }

    this.sendMessage({
      type: 'show-notification',
      message,
      notificationType: type,
    });
  }

  /**
   * Send message to VSCode extension
   */
  private sendMessage(message: any): void {
    if (this.messagePort) {
      this.messagePort.postMessage(message);
    } else if ((window as any).acquireVsCodeApi) {
      const vscode = (window as any).acquireVsCodeApi();
      vscode.postMessage(message);
    }
  }

  /**
   * Handle incoming messages from VSCode
   */
  private handleMessage(event: MessageEvent): void {
    const { type, data } = event.data;

    switch (type) {
      case 'confirmation-response':
        this.handleConfirmationResponse(data);
        break;
      case 'file-changed':
        this.handleFileChanged(data);
        break;
      case 'sync-complete':
        this.handleSyncComplete(data);
        break;
      default:
        logger.debug(`Received unknown message type: ${type}`);
    }
  }

  /**
   * Handle confirmation response from VSCode
   */
  private handleConfirmationResponse(data: any): void {
    const request = this.pendingRequests.get(data.requestId);

    if (request) {
      request.status = data.approved ? 'approved' : 'rejected';
      logger.info(`Request ${data.requestId} ${request.status} by user`);
    }
  }

  /**
   * Handle file changed event from VSCode
   */
  private handleFileChanged(data: any): void {
    logger.info(`File changed in VSCode: ${data.path}`);

    // Add to pending changes
    this.syncState.pendingChanges.push({
      path: data.path,
      type: data.changeType,
      content: data.content,
    });
  }

  /**
   * Handle sync complete event from VSCode
   */
  private handleSyncComplete(data: any): void {
    logger.info('Sync with VSCode complete');
    this.syncState.lastSyncTime = Date.now();
    this.syncState.pendingChanges = [];
  }

  /**
   * Get current sync state
   */
  getSyncState(): SyncState {
    return { ...this.syncState };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create a global VSCode integration instance
 */
let globalVSCodeIntegration: VSCodeIntegration | null = null;

export function getVSCodeIntegration(): VSCodeIntegration {
  if (!globalVSCodeIntegration) {
    globalVSCodeIntegration = new VSCodeIntegration();
  }

  return globalVSCodeIntegration;
}

/**
 * Auto-connect on module load if in VSCode context
 */
if (typeof window !== 'undefined') {
  const integration = getVSCodeIntegration();

  // Try to connect automatically
  integration.connect().catch((error) => {
    logger.debug('VSCode auto-connect failed (this is normal if not running in VSCode)', error);
  });
}
