import type { Sandbox } from 'e2b';
import type { MCPConfig } from '~/lib/services/mcpService';
import type { ProjectMode, ProvisionRequest, SandboxInfo, SelectedSkill } from '~/types/skills';
import { createScopedLogger } from '~/utils/logger';
import { findCatalogSkill, resolveSkill, toSelectedSkill } from '../skills/resolver';
import {
  createSandbox,
  runCommand,
  SANDBOX_PROJECT_CONFIG_PATH,
  SANDBOX_SKILLS_PATH,
  templateForMode,
  waitForSandboxReady,
} from './e2b-client';

const logger = createScopedLogger('sandbox.provisioner');

const COMMON_PREVIEW_PORTS = [3000, 3001, 4173, 5173, 5174, 8000, 8080, 8081, 4200, 19006];

export interface ProvisionResult {
  sandbox: SandboxInfo;
}

interface InstallSkillOutcome {
  id: string;
  ok: boolean;
  error?: string;
}

/**
 * Writes all skill files into the sandbox under /home/user/skills/<skillId>/.
 * The SDK's files.write auto-creates parent directories with correct
 * ownership, so no shell mkdir is required (and /opt would not be
 * user-writable anyway).
 */
async function installSkillFiles(
  sandbox: Sandbox,
  skillId: string,
  files: Record<string, string>,
): Promise<void> {
  const root = `${SANDBOX_SKILLS_PATH}/${skillId}`;
  const entries = Object.entries(files).slice(0, 200);

  if (entries.length === 0) {
    return;
  }

  // bounded-concurrency individual writes (each write auto-creates parents)
  const queue = [...entries];

  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (;;) {
      const entry = queue.shift();

      if (!entry) {
        break;
      }

      const [path, content] = entry;

      await sandbox.files.write(`${root}/${path}`, content);
    }
  });

  await Promise.all(workers);
}

async function writeSkillsIndex(sandbox: Sandbox, skills: SelectedSkill[]): Promise<void> {
  const lines = [
    '# Installed Skills',
    '',
    'This sandbox has the following skills installed. Each skill folder contains its',
    'SKILL.md instructions plus any bundled scripts. Follow each SKILL.md exactly when',
    'the task matches the skill.',
    '',
  ];

  for (const skill of skills) {
    lines.push(`## ${skill.name} (\`${SANDBOX_SKILLS_PATH}/${skill.id}\`)`);
    lines.push('');
    lines.push(skill.description || '');
    lines.push('');
  }

  await sandbox.files.write(`${SANDBOX_SKILLS_PATH}/INDEX.md`, lines.join('\n'));
}

async function runInstallCommands(
  sandbox: Sandbox,
  skillId: string,
  commands: string[],
): Promise<InstallSkillOutcome> {
  for (const command of commands) {
    const result = await runCommand(sandbox, command, {
      cwd: `${SANDBOX_SKILLS_PATH}/${skillId}`,
      timeoutMs: 180_000,
    });

    if (result.exitCode !== 0) {
      return {
        id: skillId,
        ok: false,
        error: `install command failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`.slice(0, 500),
      };
    }
  }

  return { id: skillId, ok: true };
}

/**
 * Writes the project's MCP server configuration into the sandbox so tooling
 * inside the sandbox (CLIs, agents, scripts) can discover the same servers.
 * Secrets stay inside the sandbox.
 */
async function writeProjectMcpConfig(sandbox: Sandbox, mcps: MCPConfig): Promise<void> {
  const serverCount = Object.keys(mcps?.mcpServers || {}).length;

  const content = [
    '# Project MCP Configuration',
    '',
    'The MCP servers selected for this project are listed in `mcp.json` next to this file.',
    'When building MCP-related features or debugging integrations, read `mcp.json`.',
    '',
  ].join('\n');

  // files.write auto-creates parent directories
  await sandbox.files.write(`${SANDBOX_PROJECT_CONFIG_PATH}/README.md`, content);
  await sandbox.files.write(
    `${SANDBOX_PROJECT_CONFIG_PATH}/mcp.json`,
    JSON.stringify({ mcpServers: mcps?.mcpServers || {} }, null, 2),
  );

  logger.debug(`wrote mcp.json with ${serverCount} server(s) into sandbox`);
}

/** Detects listening app ports inside the sandbox via `ss` / `netstat`. */
async function detectPorts(sandbox: Sandbox): Promise<number[]> {
  const result = await runCommand(
    sandbox,
    `ss -tlnp 2>/dev/null | awk 'NR>1 {print $4}' | grep -Eo '[0-9]+$' | sort -un | head -40 || ` +
      `netstat -tlnp 2>/dev/null | awk 'NR>1 {print $4}' | grep -Eo '[0-9]+$' | sort -un | head -40`,
    { timeoutMs: 20_000 },
  );

  const detected = result.stdout
    .split(/\s+/)
    .map((token) => Number(token))
    .filter((port) => port > 0 && port < 65536 && port !== 49983 && port !== 22 && port < 32768);

  const merged = new Set<number>([...detected, ...COMMON_PREVIEW_PORTS.slice(0, 4)]);

  // Always include common dev ports so the user can pre-open a preview
  // before their dev server starts.
  for (const port of COMMON_PREVIEW_PORTS) {
    merged.add(port);
  }

  return Array.from(merged).sort((a, b) => a - b).slice(0, 12);
}

/**
 * Full provisioning flow: create sandbox → install skills → write MCP config
 * → detect ports → produce SandboxInfo with preview hosts.
 */
export async function provisionSandbox(
  request: ProvisionRequest,
  apiKey: string,
): Promise<ProvisionResult> {
  const { chatId, mode } = request;
  const template = templateForMode(mode, request.template);

  logger.info(`provisioning sandbox for chat ${chatId} (mode=${mode}, template=${template})`);

  const sandbox = await createSandbox({
    apiKey,
    template,
    metadata: {
      chatId: String(chatId).slice(0, 200),
      mode: String(mode),
      managedBy: 'bolt-diy',
    },
    envs: {
      BOLT_PROJECT_ID: String(chatId).slice(0, 100),
      BOLT_PROJECT_MODE: String(mode),
    },
  });

  const sandboxInfo: SandboxInfo = {
    sandboxId: sandbox.sandboxId,
    status: 'provisioning',
    template,
    skillsPath: SANDBOX_SKILLS_PATH,
    installedSkills: [],
    createdAt: new Date().toISOString(),
  };

  // Fresh sandboxes can transiently fail their first command — warm up first.
  await waitForSandboxReady(sandbox);

  // ---- install skills ----
  const selectedSkills: SelectedSkill[] = request.skills || [];
  const outcomes: InstallSkillOutcome[] = [];

  for (const skill of selectedSkills) {
    try {
      // Prefer client-resolved files; fall back to resolving server-side.
      let files = request.skillFiles?.[skill.id];

      if (!files) {
        const def = findCatalogSkill(skill.id);

        if (def) {
          const resolved = await resolveSkill(def);
          files = resolved.files;
        }
      }

      if (!files) {
        outcomes.push({ id: skill.id, ok: false, error: 'skill files could not be resolved' });
        continue;
      }

      await installSkillFiles(sandbox, skill.id, files);

      const commands = request.installCommands?.[skill.id] || findCatalogSkill(skill.id)?.installCommands || [];

      if (commands.length > 0) {
        outcomes.push(await runInstallCommands(sandbox, skill.id, commands));
      } else {
        outcomes.push({ id: skill.id, ok: true });
      }

      sandboxInfo.installedSkills?.push(skill.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 5).join(' | ') : '';
      logger.error(`skill ${skill.id} install failed: ${message} ${stack}`);
      outcomes.push({ id: skill.id, ok: false, error: message.slice(0, 300) });
    }
  }

  if (selectedSkills.length > 0) {
    await writeSkillsIndex(
      sandbox,
      selectedSkills.map((s) => ({
        ...s,
        instructions: s.instructions || '',
      })),
    ).catch((error) => logger.warn('INDEX.md write failed:', error instanceof Error ? error.message : error));
  }

  // ---- MCP config ----
  if (request.mcps && Object.keys(request.mcps.mcpServers || {}).length > 0) {
    await writeProjectMcpConfig(sandbox, request.mcps).catch((error) =>
      logger.warn('mcp config write failed:', error instanceof Error ? error.message : error),
    );
  }

  // ---- ports / preview hosts ----
  let ports: number[] = [];

  try {
    ports = await detectPorts(sandbox);
  } catch (error) {
    logger.warn('port detection failed:', error instanceof Error ? error.message : error);
  }

  const previewHosts: Record<string, string> = {};

  for (const port of ports) {
    try {
      previewHosts[String(port)] = sandbox.getHost(port);
    } catch {
      // ignore individual host resolution failures
    }
  }

  sandboxInfo.previewHosts = previewHosts;
  sandboxInfo.status = 'ready';

  const failures = outcomes.filter((o) => !o.ok);

  if (failures.length > 0) {
    logger.warn(`provisioning completed with ${failures.length} skill failure(s): ${failures.map((f) => f.id).join(', ')}`);
  }

  logger.info(`sandbox ${sandbox.sandboxId} ready: skills=[${sandboxInfo.installedSkills?.join(', ')}] ports=[${ports.join(', ')}]`);


  return { sandbox: sandboxInfo };
}

/**
 * Re-applies the project's skills/MCP config onto an existing sandbox
 * (used after reconnect when files may be stale).
 */
export async function syncSkillsOntoSandbox(request: ProvisionRequest, apiKey: string, sandboxId: string): Promise<ProvisionResult> {
  const { connectSandbox } = await import('./e2b-client');
  const sandbox = await connectSandbox(sandboxId, apiKey);

  const info: SandboxInfo = {
    sandboxId,
    status: 'ready',
    installedSkills: [],
    skillsPath: SANDBOX_SKILLS_PATH,
  };

  for (const skill of request.skills || []) {
    try {
      let files = request.skillFiles?.[skill.id];

      if (!files) {
        const def = findCatalogSkill(skill.id);

        if (!def) {
          continue;
        }

        files = (await resolveSkill(def)).files;
      }

      await installSkillFiles(sandbox, skill.id, files);
      info.installedSkills?.push(skill.id);
    } catch (error) {
      logger.warn(`resync skill ${skill.id} failed:`, error instanceof Error ? error.message : error);
    }
  }

  if (request.mcps && Object.keys(request.mcps.mcpServers || {}).length > 0) {
    await writeProjectMcpConfig(sandbox, request.mcps).catch(() => undefined);
  }


  return { sandbox: info };
}
