import { createScopedLogger } from '~/utils/logger';
import type { LanguageModelV1, CoreMessage } from 'ai';

const logger = createScopedLogger('AgentOrchestrator');

export interface AgentTask {
  id: string;
  type: 'planning' | 'reasoning' | 'execution' | 'review' | 'reflection';
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  input: any;
  output?: any;
  error?: string;
  dependencies?: string[]; // IDs of tasks this depends on
  startTime?: number;
  endTime?: number;
}

export interface AgentPlan {
  id: string;
  goal: string;
  tasks: AgentTask[];
  currentTaskIndex: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
}

export interface AgentConfig {
  planningModel?: LanguageModelV1;
  reasoningModel?: LanguageModelV1;
  executionModel?: LanguageModelV1;
  maxIterations?: number;
  enableReflection?: boolean;
  enableParallelExecution?: boolean;
}

export interface ExecutionContext {
  chatId: string;
  messages: CoreMessage[];
  files: Record<string, string>;
  env?: Record<string, string>;
}

/**
 * Agent orchestrator for multi-step planning and execution
 */
export class AgentOrchestrator {
  private config: Required<AgentConfig>;
  private plans: Map<string, AgentPlan> = new Map();

  constructor(config: AgentConfig) {
    this.config = {
      planningModel: config.planningModel!,
      reasoningModel: config.reasoningModel || config.planningModel!,
      executionModel: config.executionModel || config.planningModel!,
      maxIterations: config.maxIterations || 10,
      enableReflection: config.enableReflection ?? true,
      enableParallelExecution: config.enableParallelExecution ?? false,
    };
  }

  /**
   * Create a plan for achieving a goal
   */
  async createPlan(goal: string, context: ExecutionContext): Promise<AgentPlan> {
    const planId = this.generateId();

    logger.info(`Creating plan for goal: ${goal}`);

    const plan: AgentPlan = {
      id: planId,
      goal,
      tasks: [],
      currentTaskIndex: 0,
      status: 'planning',
      createdAt: Date.now(),
    };

    this.plans.set(planId, plan);

    try {
      // Use planning model to break down the goal into tasks
      const tasks = await this.planTasks(goal, context);

      plan.tasks = tasks;
      plan.status = 'executing';

      logger.info(`Created plan with ${tasks.length} tasks`);

      return plan;
    } catch (error) {
      logger.error('Failed to create plan', error);
      plan.status = 'failed';
      throw error;
    }
  }

  /**
   * Plan tasks using the planning model
   */
  private async planTasks(goal: string, context: ExecutionContext): Promise<AgentTask[]> {
    const planningPrompt = this.buildPlanningPrompt(goal, context);

    // Call planning model to generate task breakdown
    // This is a simplified version - actual implementation would use the model
    const tasks: AgentTask[] = [
      {
        id: this.generateId(),
        type: 'reasoning',
        description: `Analyze the goal: "${goal}"`,
        status: 'pending',
        input: { goal, context },
      },
      {
        id: this.generateId(),
        type: 'planning',
        description: 'Break down into implementation steps',
        status: 'pending',
        input: { goal },
        dependencies: [],
      },
      {
        id: this.generateId(),
        type: 'execution',
        description: 'Execute implementation steps',
        status: 'pending',
        input: {},
        dependencies: [],
      },
    ];

    if (this.config.enableReflection) {
      tasks.push({
        id: this.generateId(),
        type: 'review',
        description: 'Review and validate results',
        status: 'pending',
        input: {},
        dependencies: tasks.map((t) => t.id),
      });
    }

    return tasks;
  }

  /**
   * Execute a plan
   */
  async executePlan(
    planId: string,
    context: ExecutionContext,
    onProgress?: (task: AgentTask) => void,
  ): Promise<AgentPlan> {
    const plan = this.plans.get(planId);

    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    logger.info(`Executing plan ${planId}`);

    try {
      for (let i = 0; i < plan.tasks.length; i++) {
        const task = plan.tasks[i];

        // Check dependencies
        if (task.dependencies && task.dependencies.length > 0) {
          const allDependenciesCompleted = task.dependencies.every((depId) => {
            const depTask = plan.tasks.find((t) => t.id === depId);
            return depTask?.status === 'completed';
          });

          if (!allDependenciesCompleted) {
            logger.warn(`Task ${task.id} has incomplete dependencies, skipping`);
            continue;
          }
        }

        // Execute task
        await this.executeTask(task, context);

        // Notify progress
        if (onProgress) {
          onProgress(task);
        }

        // Check for failure
        if (task.status === 'failed') {
          plan.status = 'failed';
          logger.error(`Task ${task.id} failed, aborting plan`);
          break;
        }

        plan.currentTaskIndex = i + 1;
      }

      // Check if all tasks completed
      const allCompleted = plan.tasks.every((t) => t.status === 'completed');

      if (allCompleted) {
        plan.status = 'completed';
        plan.completedAt = Date.now();
        logger.info(`Plan ${planId} completed successfully`);
      }

      return plan;
    } catch (error) {
      logger.error('Failed to execute plan', error);
      plan.status = 'failed';
      throw error;
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: AgentTask, context: ExecutionContext): Promise<void> {
    task.status = 'in_progress';
    task.startTime = Date.now();

    try {
      let output: any;

      switch (task.type) {
        case 'reasoning':
          output = await this.executeReasoningTask(task, context);
          break;
        case 'planning':
          output = await this.executePlanningTask(task, context);
          break;
        case 'execution':
          output = await this.executeExecutionTask(task, context);
          break;
        case 'review':
          output = await this.executeReviewTask(task, context);
          break;
        case 'reflection':
          output = await this.executeReflectionTask(task, context);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      task.output = output;
      task.status = 'completed';
      task.endTime = Date.now();

      logger.info(`Task ${task.id} completed in ${task.endTime - task.startTime}ms`);
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.endTime = Date.now();

      logger.error(`Task ${task.id} failed`, error);
      throw error;
    }
  }

  /**
   * Execute reasoning task
   */
  private async executeReasoningTask(task: AgentTask, context: ExecutionContext): Promise<any> {
    logger.info(`Executing reasoning task: ${task.description}`);

    // Use reasoning model for deep thinking
    // This would integrate with o1/o3 models or similar reasoning models

    return {
      reasoning: 'Analysis of the goal and context',
      recommendations: ['Step 1', 'Step 2', 'Step 3'],
    };
  }

  /**
   * Execute planning task
   */
  private async executePlanningTask(task: AgentTask, context: ExecutionContext): Promise<any> {
    logger.info(`Executing planning task: ${task.description}`);

    return {
      steps: [
        { id: 1, action: 'Create file structure' },
        { id: 2, action: 'Implement core functionality' },
        { id: 3, action: 'Add tests' },
      ],
    };
  }

  /**
   * Execute execution task
   */
  private async executeExecutionTask(task: AgentTask, context: ExecutionContext): Promise<any> {
    logger.info(`Executing execution task: ${task.description}`);

    // This would use the execution model to generate code/make changes
    return {
      filesModified: [],
      actions: [],
    };
  }

  /**
   * Execute review task
   */
  private async executeReviewTask(task: AgentTask, context: ExecutionContext): Promise<any> {
    logger.info(`Executing review task: ${task.description}`);

    return {
      passed: true,
      issues: [],
      suggestions: [],
    };
  }

  /**
   * Execute reflection task
   */
  private async executeReflectionTask(task: AgentTask, context: ExecutionContext): Promise<any> {
    logger.info(`Executing reflection task: ${task.description}`);

    return {
      learnings: [],
      improvements: [],
    };
  }

  /**
   * Build planning prompt
   */
  private buildPlanningPrompt(goal: string, context: ExecutionContext): string {
    return `
You are a planning agent. Your task is to break down a high-level goal into concrete, executable steps.

Goal: ${goal}

Context:
- Chat ID: ${context.chatId}
- Available files: ${Object.keys(context.files).length}
- Recent messages: ${context.messages.length}

Please analyze the goal and create a detailed plan with specific tasks.
Consider:
1. What information do we need to gather?
2. What files need to be created or modified?
3. What dependencies exist between tasks?
4. What validation steps are needed?

Provide a structured plan with tasks that can be executed sequentially or in parallel.
    `.trim();
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): AgentPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * Get all plans
   */
  getAllPlans(): AgentPlan[] {
    return Array.from(this.plans.values());
  }

  /**
   * Cancel a plan
   */
  cancelPlan(planId: string): void {
    const plan = this.plans.get(planId);

    if (plan) {
      plan.status = 'failed';

      // Mark in-progress tasks as failed
      for (const task of plan.tasks) {
        if (task.status === 'in_progress') {
          task.status = 'failed';
          task.error = 'Plan cancelled';
        }
      }

      logger.info(`Cancelled plan ${planId}`);
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
 * Create a global agent orchestrator instance
 */
let globalOrchestrator: AgentOrchestrator | null = null;

export function getAgentOrchestrator(config?: AgentConfig): AgentOrchestrator {
  if (!globalOrchestrator && config) {
    globalOrchestrator = new AgentOrchestrator(config);
  }

  if (!globalOrchestrator) {
    throw new Error('Agent orchestrator not initialized. Provide config on first call.');
  }

  return globalOrchestrator;
}

export function resetAgentOrchestrator(): void {
  globalOrchestrator = null;
}
