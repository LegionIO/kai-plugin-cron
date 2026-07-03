import type { CronJob, CronDefaults, CronRunRecord, PluginAPI } from '../shared/types.js';
import type { CronStorage } from './storage.js';
import type { CronScheduler } from './scheduler.js';
import type { CronExecutor } from './executor.js';
import { isValidCronExpression } from './scheduler.js';
import { DEFAULT_REQUIRE_AGENT_APPROVAL } from '../shared/constants.js';

type Deps = {
  storage: CronStorage;
  scheduler: CronScheduler;
  executor: CronExecutor;
  api: PluginAPI;
  publishState: () => void;
  runJob: (job: CronJob, triggeredBy: 'schedule' | 'manual') => Promise<CronRunRecord>;
};

export function buildCronTools(deps: Deps) {
  const { storage, scheduler, executor, api, publishState, runJob } = deps;

  const requiresApproval = (): boolean =>
    storage.getDefaults().requireAgentApproval ?? DEFAULT_REQUIRE_AGENT_APPROVAL;

  const notifyPending = (job: CronJob, verb: 'created' | 'modified'): void => {
    api.notifications.show({
      id: `cron-pending-${job.id}`,
      title: `Cron: "${job.name}" awaiting approval`,
      body: `An AI-${verb} job is pending your approval in the Cron panel before it will run.`,
      level: 'warning',
      native: true,
      autoDismissMs: 15000,
    });
  };

  const z = {
    object: (shape: Record<string, unknown>) => ({ _shape: shape, _type: 'object' }),
    string: () => ({ _type: 'string', optional: () => ({ _type: 'string', _optional: true }), describe: (d: string) => ({ _type: 'string', _describe: d, optional: () => ({ _type: 'string', _optional: true, _describe: d }), }) }),
    number: () => ({ _type: 'number', optional: () => ({ _type: 'number', _optional: true }), describe: (d: string) => ({ _type: 'number', _describe: d, optional: () => ({ _type: 'number', _optional: true, _describe: d }), }) }),
    boolean: () => ({ _type: 'boolean', optional: () => ({ _type: 'boolean', _optional: true }), describe: (d: string) => ({ _type: 'boolean', _describe: d, optional: () => ({ _type: 'boolean', _optional: true, _describe: d }), }) }),
    enum: (values: string[]) => ({ _type: 'enum', _values: values, optional: () => ({ _type: 'enum', _values: values, _optional: true }) }),
  };

  return [
    {
      name: 'create',
      description: 'Create a new scheduled cron job. Supports two types: "command" (shell command or HTTP request) and "ai" (AI agent task with a prompt). Returns the created job.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Human-readable name for the cron job' },
          schedule: { type: 'string', description: 'Standard cron expression (e.g. "0 9 * * 1-5" for weekdays at 9am, "*/5 * * * *" for every 5 minutes)' },
          type: { type: 'string', enum: ['command', 'ai'], description: 'Job type: "command" for shell/HTTP, "ai" for AI agent task' },
          enabled: { type: 'boolean', description: 'Whether the job is enabled (default: true)' },
          timezone: { type: 'string', description: 'IANA timezone (default: system timezone)' },
          command: {
            type: 'object',
            description: 'Command configuration (required when type is "command")',
            properties: {
              type: { type: 'string', enum: ['shell', 'http'] },
              shell: {
                type: 'object',
                properties: {
                  command: { type: 'string', description: 'Shell command to execute' },
                  cwd: { type: 'string', description: 'Working directory' },
                  timeoutMs: { type: 'number', description: 'Timeout in milliseconds' },
                },
              },
              http: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  method: { type: 'string' },
                  headers: { type: 'object' },
                  body: { type: 'string' },
                  timeoutMs: { type: 'number' },
                },
              },
            },
          },
          ai: {
            type: 'object',
            description: 'AI configuration (required when type is "ai")',
            properties: {
              prompt: { type: 'string', description: 'The prompt/task for the AI agent' },
              systemPrompt: { type: 'string', description: 'System prompt to guide AI behavior' },
              enableTools: { type: 'boolean', description: 'Allow AI to use tools (default: true)' },
            },
          },
        },
        required: ['name', 'schedule', 'type'],
      },
      execute: async (input: unknown) => {
        const data = input as Record<string, unknown>;
        if (!data.name || !data.schedule || !data.type) {
          return { error: 'Missing required fields: name, schedule, type' };
        }
        if (!isValidCronExpression(data.schedule as string)) {
          return { error: `Invalid cron expression: "${data.schedule}"` };
        }

        const gated = requiresApproval();
        const now = new Date().toISOString();
        const job: CronJob = {
          id: crypto.randomUUID(),
          name: data.name as string,
          schedule: data.schedule as string,
          timezone: data.timezone as string | undefined,
          enabled: gated ? false : data.enabled !== false,
          type: data.type as 'command' | 'ai',
          command: data.command as CronJob['command'],
          ai: data.ai as CronJob['ai'],
          createdVia: 'agent',
          pendingApproval: gated,
          ...(gated && { enabledOnApproval: data.enabled !== false }),
          createdAt: now,
          updatedAt: now,
        };

        storage.saveJob(job);
        scheduler.reschedule(job);
        publishState();

        if (gated) {
          notifyPending(job, 'created');
          return {
            success: true,
            pendingApproval: true,
            message: 'Job saved but requires user approval in the Cron panel before it will run. The user has been notified.',
            job: { id: job.id, name: job.name, schedule: job.schedule, type: job.type, enabled: job.enabled },
          };
        }

        return {
          success: true,
          job: { id: job.id, name: job.name, schedule: job.schedule, type: job.type, enabled: job.enabled },
          nextRun: scheduler.getNextRun(job.id),
        };
      },
    },

    {
      name: 'list',
      description: 'List all configured cron jobs with their current status and next run time.',
      inputSchema: {
        type: 'object',
        properties: {
          enabledOnly: { type: 'boolean', description: 'Only return enabled jobs' },
        },
      },
      execute: async (input: unknown) => {
        const data = (input ?? {}) as Record<string, unknown>;
        const jobs = Object.values(storage.getJobs());
        const filtered = data.enabledOnly ? jobs.filter((j) => j.enabled) : jobs;

        return {
          count: filtered.length,
          jobs: filtered.map((j) => ({
            id: j.id,
            name: j.name,
            schedule: j.schedule,
            type: j.type,
            enabled: j.enabled,
            nextRun: scheduler.getNextRun(j.id),
            running: executor.isRunning(j.id),
          })),
        };
      },
    },

    {
      name: 'get',
      description: 'Get full details of a specific cron job including its configuration.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The cron job ID' },
        },
        required: ['id'],
      },
      execute: async (input: unknown) => {
        const data = input as Record<string, unknown>;
        const job = storage.getJob(data.id as string);
        if (!job) return { error: `Job not found: ${data.id}` };
        return {
          ...job,
          nextRun: scheduler.getNextRun(job.id),
          running: executor.isRunning(job.id),
        };
      },
    },

    {
      name: 'update',
      description: 'Update an existing cron job. Only provided fields are updated.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The cron job ID to update' },
          name: { type: 'string' },
          schedule: { type: 'string' },
          enabled: { type: 'boolean' },
          timezone: { type: 'string' },
          command: { type: 'object' },
          ai: { type: 'object' },
        },
        required: ['id'],
      },
      execute: async (input: unknown) => {
        const data = input as Record<string, unknown>;
        const job = storage.getJob(data.id as string);
        if (!job) return { error: `Job not found: ${data.id}` };

        if (data.schedule != null && !isValidCronExpression(data.schedule as string)) {
          return { error: `Invalid cron expression: "${data.schedule}"` };
        }

        const gated = requiresApproval();
        const intendedEnabled = data.enabled != null
          ? Boolean(data.enabled)
          : (job.pendingApproval ? (job.enabledOnApproval ?? job.enabled) : job.enabled);

        const updated: CronJob = {
          ...job,
          ...(data.name != null && { name: data.name as string }),
          ...(data.schedule != null && { schedule: data.schedule as string }),
          ...(data.enabled != null && { enabled: data.enabled as boolean }),
          ...(data.timezone !== undefined && { timezone: data.timezone as string }),
          ...(data.command != null && { command: data.command as CronJob['command'] }),
          ...(data.ai != null && { ai: data.ai as CronJob['ai'] }),
          ...(gated && { enabled: false, pendingApproval: true, enabledOnApproval: intendedEnabled }),
          updatedAt: new Date().toISOString(),
        };

        storage.saveJob(updated);
        scheduler.reschedule(updated);
        publishState();

        if (gated) {
          notifyPending(updated, 'modified');
          return {
            success: true,
            pendingApproval: true,
            message: 'Job updated but requires user approval in the Cron panel before it will run. The user has been notified.',
            job: { id: updated.id, name: updated.name, schedule: updated.schedule, enabled: updated.enabled },
          };
        }

        return {
          success: true,
          job: { id: updated.id, name: updated.name, schedule: updated.schedule, enabled: updated.enabled },
          nextRun: scheduler.getNextRun(updated.id),
        };
      },
    },

    {
      name: 'delete',
      description: 'Delete a cron job and all its run history.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The cron job ID to delete' },
        },
        required: ['id'],
      },
      execute: async (input: unknown) => {
        const data = input as Record<string, unknown>;
        const job = storage.getJob(data.id as string);
        if (!job) return { error: `Job not found: ${data.id}` };
        if (requiresApproval()) {
          return { error: `requireAgentApproval is enabled; job deletion must be performed by the user in the Cron panel.` };
        }

        executor.kill(job.id);
        scheduler.remove(job.id);
        storage.deleteJob(job.id);
        publishState();

        return { success: true, deleted: { id: job.id, name: job.name } };
      },
    },

    {
      name: 'get_history',
      description: 'Get run history for a cron job or all jobs. Returns most recent runs first.',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Filter to a specific job ID (omit for all jobs)' },
          limit: { type: 'number', description: 'Max records to return (default: 20)' },
          status: { type: 'string', enum: ['completed', 'failed', 'skipped', 'running'], description: 'Filter by status' },
        },
      },
      execute: async (input: unknown) => {
        const data = (input ?? {}) as Record<string, unknown>;
        let runs = storage.getHistory(data.jobId as string | undefined, (data.limit as number) ?? 20);
        if (data.status) {
          runs = runs.filter((r) => r.status === data.status);
        }
        return {
          count: runs.length,
          runs: runs.map((r) => ({
            id: r.id,
            jobId: r.jobId,
            jobName: r.jobName,
            status: r.status,
            triggeredBy: r.triggeredBy,
            startedAt: r.startedAt,
            completedAt: r.completedAt,
            durationMs: r.durationMs,
            error: r.error,
            skippedReason: r.skippedReason,
            hasCommandResult: !!r.commandResult,
            hasAIResult: !!r.aiResult,
            aiResultSummary: r.aiResult ? r.aiResult.text.slice(0, 200) : undefined,
          })),
        };
      },
    },

    {
      name: 'run_now',
      description: 'Immediately execute a cron job (does not affect its schedule). Returns the run result.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The cron job ID to run' },
        },
        required: ['id'],
      },
      execute: async (input: unknown) => {
        const data = input as Record<string, unknown>;
        const job = storage.getJob(data.id as string);
        if (!job) return { error: `Job not found: ${data.id}` };
        if (job.pendingApproval) {
          return { error: `Job "${job.name}" is pending user approval and cannot be run until approved in the Cron panel.` };
        }

        const run = await runJob(job, 'manual');

        return {
          runId: run.id,
          status: run.status,
          durationMs: run.durationMs,
          error: run.error,
          commandResult: run.commandResult,
          aiResultText: run.aiResult?.text,
          aiToolCallCount: run.aiResult?.toolCalls?.length ?? 0,
        };
      },
    },

    {
      name: 'stop',
      description: 'Stop/kill a currently running cron job.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The cron job ID to stop' },
        },
        required: ['id'],
      },
      execute: async (input: unknown) => {
        const data = input as Record<string, unknown>;
        const jobId = data.id as string;
        if (!executor.isRunning(jobId)) {
          return { error: `Job is not currently running: ${jobId}` };
        }
        const killed = executor.kill(jobId);
        publishState();
        return { success: killed, jobId };
      },
    },
  ];
}
