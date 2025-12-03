import { createScopedLogger } from '~/utils/logger';
import type { CoreMessage } from 'ai';

const logger = createScopedLogger('ProjectPlanner');

export interface ProjectPlan {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  status: 'draft' | 'active' | 'completed' | 'archived';
  phases: ProjectPhase[];
  milestones: Milestone[];
  resources: Resource[];
  risks: Risk[];
  metadata: {
    chatId?: string;
    estimatedDuration?: number;
    actualDuration?: number;
    complexity?: 'low' | 'medium' | 'high';
    technology?: string[];
  };
}

export interface ProjectPhase {
  id: string;
  name: string;
  description: string;
  order: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  startDate?: number;
  endDate?: number;
  tasks: Task[];
  dependencies?: string[]; // IDs of phases this depends on
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  estimatedHours?: number;
  actualHours?: number;
  createdAt: number;
  completedAt?: number;
  dependencies?: string[];
  tags?: string[];
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  targetDate: number;
  completed: boolean;
  completedDate?: number;
  deliverables: string[];
}

export interface Resource {
  id: string;
  name: string;
  type: 'documentation' | 'library' | 'api' | 'tool' | 'asset';
  url?: string;
  description: string;
}

export interface Risk {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: 'low' | 'medium' | 'high';
  mitigation: string;
  status: 'identified' | 'mitigated' | 'accepted';
}

/**
 * Project planner service for generating and managing project plans
 */
export class ProjectPlanner {
  private plans: Map<string, ProjectPlan> = new Map();

  /**
   * Generate a project plan from a goal description
   */
  async generatePlan(
    goal: string,
    context?: {
      chatId?: string;
      messages?: CoreMessage[];
      existingFiles?: string[];
      technology?: string[];
    },
  ): Promise<ProjectPlan> {
    logger.info(`Generating project plan for: ${goal}`);

    const planId = this.generateId();

    const plan: ProjectPlan = {
      id: planId,
      title: goal,
      description: `Project plan for: ${goal}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'draft',
      phases: this.generatePhases(goal, context),
      milestones: this.generateMilestones(goal),
      resources: [],
      risks: this.identifyRisks(goal, context),
      metadata: {
        chatId: context?.chatId,
        complexity: this.estimateComplexity(goal),
        technology: context?.technology || [],
      },
    };

    this.plans.set(planId, plan);

    logger.info(`Generated plan ${planId} with ${plan.phases.length} phases`);

    return plan;
  }

  /**
   * Generate project phases
   */
  private generatePhases(goal: string, context?: any): ProjectPhase[] {
    // This would use LLM to generate phases, but here's a template
    const phases: ProjectPhase[] = [
      {
        id: this.generateId(),
        name: 'Planning & Design',
        description: 'Define requirements, architecture, and technical approach',
        order: 1,
        status: 'not_started',
        tasks: [
          {
            id: this.generateId(),
            title: 'Gather requirements',
            description: 'Document all functional and non-functional requirements',
            status: 'todo',
            priority: 'high',
            estimatedHours: 4,
            createdAt: Date.now(),
            tags: ['planning', 'requirements'],
          },
          {
            id: this.generateId(),
            title: 'Design system architecture',
            description: 'Create high-level system design and component diagrams',
            status: 'todo',
            priority: 'high',
            estimatedHours: 8,
            createdAt: Date.now(),
            tags: ['design', 'architecture'],
          },
        ],
      },
      {
        id: this.generateId(),
        name: 'Implementation',
        description: 'Build core functionality and features',
        order: 2,
        status: 'not_started',
        tasks: [
          {
            id: this.generateId(),
            title: 'Set up project structure',
            description: 'Initialize project with necessary dependencies',
            status: 'todo',
            priority: 'high',
            estimatedHours: 2,
            createdAt: Date.now(),
            tags: ['setup'],
          },
          {
            id: this.generateId(),
            title: 'Implement core features',
            description: 'Build main application functionality',
            status: 'todo',
            priority: 'high',
            estimatedHours: 40,
            createdAt: Date.now(),
            tags: ['development', 'core'],
          },
        ],
      },
      {
        id: this.generateId(),
        name: 'Testing & QA',
        description: 'Test functionality and fix bugs',
        order: 3,
        status: 'not_started',
        tasks: [
          {
            id: this.generateId(),
            title: 'Write unit tests',
            description: 'Create comprehensive unit test coverage',
            status: 'todo',
            priority: 'medium',
            estimatedHours: 12,
            createdAt: Date.now(),
            tags: ['testing', 'unit-tests'],
          },
          {
            id: this.generateId(),
            title: 'Integration testing',
            description: 'Test component interactions',
            status: 'todo',
            priority: 'medium',
            estimatedHours: 8,
            createdAt: Date.now(),
            tags: ['testing', 'integration'],
          },
        ],
      },
      {
        id: this.generateId(),
        name: 'Deployment',
        description: 'Deploy to production and monitor',
        order: 4,
        status: 'not_started',
        tasks: [
          {
            id: this.generateId(),
            title: 'Prepare deployment pipeline',
            description: 'Set up CI/CD and deployment infrastructure',
            status: 'todo',
            priority: 'high',
            estimatedHours: 6,
            createdAt: Date.now(),
            tags: ['deployment', 'devops'],
          },
          {
            id: this.generateId(),
            title: 'Deploy to production',
            description: 'Execute production deployment',
            status: 'todo',
            priority: 'critical',
            estimatedHours: 4,
            createdAt: Date.now(),
            tags: ['deployment', 'production'],
          },
        ],
      },
    ];

    return phases;
  }

  /**
   * Generate milestones
   */
  private generateMilestones(goal: string): Milestone[] {
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    return [
      {
        id: this.generateId(),
        name: 'Design Complete',
        description: 'All design documents and architecture completed',
        targetDate: now + oneWeek,
        completed: false,
        deliverables: ['Architecture diagram', 'Requirements document', 'Technical specification'],
      },
      {
        id: this.generateId(),
        name: 'MVP Ready',
        description: 'Minimum viable product with core features',
        targetDate: now + oneWeek * 4,
        completed: false,
        deliverables: ['Working application', 'Basic tests', 'Documentation'],
      },
      {
        id: this.generateId(),
        name: 'Production Launch',
        description: 'Application deployed to production',
        targetDate: now + oneWeek * 8,
        completed: false,
        deliverables: ['Production deployment', 'Monitoring setup', 'User documentation'],
      },
    ];
  }

  /**
   * Identify potential risks
   */
  private identifyRisks(goal: string, context?: any): Risk[] {
    return [
      {
        id: this.generateId(),
        description: 'Technical complexity may lead to schedule delays',
        severity: 'medium',
        probability: 'medium',
        mitigation: 'Break down complex tasks, add buffer time to estimates',
        status: 'identified',
      },
      {
        id: this.generateId(),
        description: 'Dependencies on external APIs may cause integration issues',
        severity: 'medium',
        probability: 'high',
        mitigation: 'Implement error handling and fallback mechanisms',
        status: 'identified',
      },
      {
        id: this.generateId(),
        description: 'Scope creep could extend timeline',
        severity: 'high',
        probability: 'medium',
        mitigation: 'Maintain strict scope control, document change requests',
        status: 'identified',
      },
    ];
  }

  /**
   * Estimate project complexity
   */
  private estimateComplexity(goal: string): 'low' | 'medium' | 'high' {
    const keywords = goal.toLowerCase();

    const highComplexityIndicators = [
      'distributed',
      'real-time',
      'machine learning',
      'ai',
      'blockchain',
      'microservices',
    ];
    const mediumComplexityIndicators = ['api', 'database', 'authentication', 'integration'];

    if (highComplexityIndicators.some((indicator) => keywords.includes(indicator))) {
      return 'high';
    }

    if (mediumComplexityIndicators.some((indicator) => keywords.includes(indicator))) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Export plan as Markdown
   */
  exportAsMarkdown(planId: string): string {
    const plan = this.plans.get(planId);

    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    let markdown = `# ${plan.title}\n\n`;
    markdown += `${plan.description}\n\n`;
    markdown += `**Status:** ${plan.status}\n`;
    markdown += `**Created:** ${new Date(plan.createdAt).toLocaleDateString()}\n`;
    markdown += `**Complexity:** ${plan.metadata.complexity}\n\n`;

    // Add technology stack
    if (plan.metadata.technology && plan.metadata.technology.length > 0) {
      markdown += `## Technology Stack\n\n`;
      markdown += plan.metadata.technology.map((tech) => `- ${tech}`).join('\n');
      markdown += `\n\n`;
    }

    // Add milestones
    if (plan.milestones.length > 0) {
      markdown += `## Milestones\n\n`;

      for (const milestone of plan.milestones) {
        const status = milestone.completed ? '✅' : '⏳';
        markdown += `### ${status} ${milestone.name}\n\n`;
        markdown += `${milestone.description}\n\n`;
        markdown += `**Target Date:** ${new Date(milestone.targetDate).toLocaleDateString()}\n\n`;
        markdown += `**Deliverables:**\n`;
        markdown += milestone.deliverables.map((d) => `- ${d}`).join('\n');
        markdown += `\n\n`;
      }
    }

    // Add phases and tasks
    markdown += `## Project Phases\n\n`;

    for (const phase of plan.phases) {
      const statusIcon = this.getStatusIcon(phase.status);
      markdown += `### ${statusIcon} Phase ${phase.order}: ${phase.name}\n\n`;
      markdown += `${phase.description}\n\n`;
      markdown += `**Status:** ${phase.status}\n\n`;

      if (phase.tasks.length > 0) {
        markdown += `#### Tasks\n\n`;

        for (const task of phase.tasks) {
          const taskIcon = this.getStatusIcon(task.status);
          markdown += `- ${taskIcon} **${task.title}** (${task.priority} priority)\n`;
          markdown += `  - ${task.description}\n`;

          if (task.estimatedHours) {
            markdown += `  - Estimated: ${task.estimatedHours}h\n`;
          }

          if (task.tags && task.tags.length > 0) {
            markdown += `  - Tags: ${task.tags.join(', ')}\n`;
          }

          markdown += `\n`;
        }
      }

      markdown += `\n`;
    }

    // Add risks
    if (plan.risks.length > 0) {
      markdown += `## Risk Assessment\n\n`;

      for (const risk of plan.risks) {
        markdown += `### ${risk.description}\n\n`;
        markdown += `- **Severity:** ${risk.severity}\n`;
        markdown += `- **Probability:** ${risk.probability}\n`;
        markdown += `- **Status:** ${risk.status}\n`;
        markdown += `- **Mitigation:** ${risk.mitigation}\n\n`;
      }
    }

    // Add resources
    if (plan.resources.length > 0) {
      markdown += `## Resources\n\n`;

      for (const resource of plan.resources) {
        markdown += `- **${resource.name}** (${resource.type})\n`;
        markdown += `  - ${resource.description}\n`;

        if (resource.url) {
          markdown += `  - URL: ${resource.url}\n`;
        }

        markdown += `\n`;
      }
    }

    return markdown;
  }

  /**
   * Get status icon for markdown
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'completed':
      case 'done':
        return '✅';
      case 'in_progress':
        return '🔄';
      case 'blocked':
        return '🚫';
      case 'not_started':
      case 'todo':
        return '📋';
      default:
        return '⚪';
    }
  }

  /**
   * Update plan
   */
  updatePlan(planId: string, updates: Partial<ProjectPlan>): ProjectPlan {
    const plan = this.plans.get(planId);

    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    const updated = {
      ...plan,
      ...updates,
      updatedAt: Date.now(),
    };

    this.plans.set(planId, updated);

    logger.info(`Updated plan ${planId}`);

    return updated;
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): ProjectPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * Get all plans
   */
  getAllPlans(): ProjectPlan[] {
    return Array.from(this.plans.values());
  }

  /**
   * Delete plan
   */
  deletePlan(planId: string): void {
    this.plans.delete(planId);
    logger.info(`Deleted plan ${planId}`);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create a global project planner instance
 */
let globalPlanner: ProjectPlanner | null = null;

export function getProjectPlanner(): ProjectPlanner {
  if (!globalPlanner) {
    globalPlanner = new ProjectPlanner();
  }

  return globalPlanner;
}
