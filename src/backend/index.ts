import { CronStorage } from './storage.js';
import { CronScheduler, isValidCronExpression } from './scheduler.js';
import { CronExecutor } from './executor.js';
import { buildCronTools } from './tools.js';
import { PANEL_ID, NAV_ID, SETTINGS_ID, AUTOMATION_TARGET_ID } from '../shared/constants.js';
import type { CronJob, CronDefaults, CronRunRecord, PluginAPI } from '../shared/types.js';

let storage: CronStorage | null = null;
let scheduler: CronScheduler | null = null;
let executor: CronExecutor | null = null;
let unsubConfig: (() => void) | null = null;

const OUTPUT_CAP = 4000;

function busEmit(api: PluginAPI, event: string, payload: unknown): void {
  try {
    api.events?.emit(event, payload);
  } catch (err) {
    api.log.warn(`events.emit(${event}) failed:`, err);
  }
}

function runOutput(run: CronRunRecord): string | undefined {
  let raw: string | undefined;
  if (run.commandResult) {
    raw = run.commandResult.type === 'shell'
      ? run.commandResult.stdout || run.commandResult.stderr
      : run.commandResult.httpBody;
  } else if (run.aiResult) {
    raw = run.aiResult.text;
  }
  if (raw == null) return undefined;
  return raw.length > OUTPUT_CAP ? `${raw.slice(0, OUTPUT_CAP)}…[truncated]` : raw;
}

function runEventPayload(job: CronJob, run: CronRunRecord): Record<string, unknown> {
  return {
    runId: run.id,
    jobId: job.id,
    jobName: job.name,
    jobType: job.type,
    schedule: job.schedule,
    status: run.status,
    triggeredBy: run.triggeredBy,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    exitCode: run.commandResult?.exitCode,
    httpStatus: run.commandResult?.httpStatus,
    error: run.error,
    skippedReason: run.skippedReason,
    output: runOutput(run),
  };
}

async function runJob(
  api: PluginAPI,
  job: CronJob,
  triggeredBy: 'schedule' | 'manual',
  opts: { notify?: boolean } = {},
): Promise<CronRunRecord> {
  const notify = opts.notify ?? true;

  const run = await executor!.execute(job, triggeredBy, {
    // Fires only after the executor has accepted the run and set runningJobs, so
    // (a) run.started is never emitted for a would-be-skipped overlap, and
    // (b) an automation reacting to run.started with stop-job {id} finds a live entry.
    onStarted: (started) => {
      busEmit(api, 'run.started', {
        runId: started.id,
        jobId: job.id,
        jobName: job.name,
        jobType: job.type,
        schedule: job.schedule,
        triggeredBy,
        startedAt: started.startedAt,
      });
      publishState(api);
    },
  });
  publishState(api);

  busEmit(api, 'run.finished', runEventPayload(job, run));

  if (!notify) return run;

  if (run.status === 'completed') {
    api.notifications.show({
      id: `cron-run-${run.id}`,
      title: `Cron: "${job.name}" completed`,
      body: run.durationMs ? `Finished in ${(run.durationMs / 1000).toFixed(1)}s` : 'Finished',
      level: 'success',
      native: true,
      autoDismissMs: 5000,
    });
  } else if (run.status === 'failed') {
    api.notifications.show({
      id: `cron-run-${run.id}`,
      title: `Cron: "${job.name}" failed`,
      body: run.error?.slice(0, 200) ?? 'Unknown error',
      level: 'error',
      native: true,
      autoDismissMs: 10000,
    });
  }

  return run;
}

function publishState(api: PluginAPI): void {
  if (!storage || !scheduler || !executor) return;

  const jobs = Object.values(storage.getJobs());
  const recentRuns = storage.getHistory(null, 50);
  const nextRuns = scheduler.getAllNextRuns();
  const runningJobs = executor.getRunningJobIds();
  const defaults = storage.getDefaults();

  api.state.set('jobs', jobs);
  api.state.set('recentRuns', recentRuns);
  api.state.set('nextRuns', nextRuns);
  api.state.set('runningJobs', runningJobs);
  api.state.set('defaults', defaults);

  api.ui.registerNavigationItem({
    id: NAV_ID,
    visible: true,
    badge: runningJobs.length > 0 ? runningJobs.length : undefined,
    target: { type: 'panel', panelId: PANEL_ID },
  });
}

async function handlePanelAction(api: PluginAPI, action: string, data?: unknown): Promise<void> {
  if (!storage || !scheduler || !executor) return;

  const payload = (data ?? {}) as Record<string, unknown>;

  switch (action) {
    case 'create-job': {
      if (!isValidCronExpression(payload.schedule as string)) {
        api.log.warn(`Cron: rejecting invalid schedule "${payload.schedule}"`);
        api.notifications.show({
          id: 'cron-invalid-schedule',
          title: 'Cron: invalid schedule',
          body: `"${payload.schedule}" is not a valid 5-field cron expression.`,
          level: 'error',
          autoDismissMs: 6000,
        });
        return;
      }
      const now = new Date().toISOString();
      const job: CronJob = {
        id: crypto.randomUUID(),
        name: payload.name as string,
        schedule: payload.schedule as string,
        timezone: payload.timezone as string | undefined,
        enabled: payload.enabled !== false,
        type: payload.type as 'command' | 'ai',
        command: payload.command as CronJob['command'],
        ai: payload.ai as CronJob['ai'],
        createdVia: 'ui',
        pendingApproval: false,
        createdAt: now,
        updatedAt: now,
      };
      storage.saveJob(job);
      scheduler.reschedule(job);
      publishState(api);
      break;
    }

    case 'update-job': {
      const existing = storage.getJob(payload.id as string);
      if (!existing) return;
      if (payload.schedule != null && !isValidCronExpression(payload.schedule as string)) {
        api.log.warn(`Cron: rejecting invalid schedule "${payload.schedule}"`);
        api.notifications.show({
          id: 'cron-invalid-schedule',
          title: 'Cron: invalid schedule',
          body: `"${payload.schedule}" is not a valid 5-field cron expression.`,
          level: 'error',
          autoDismissMs: 6000,
        });
        return;
      }
      const updated: CronJob = {
        ...existing,
        ...Object.fromEntries(
          Object.entries(payload).filter(([k]) => k !== 'id'),
        ),
        pendingApproval: false,
        enabledOnApproval: undefined,
        updatedAt: new Date().toISOString(),
      } as CronJob;
      storage.saveJob(updated);
      scheduler.reschedule(updated);
      publishState(api);
      break;
    }

    case 'approve-job': {
      const job = storage.getJob(payload.id as string);
      if (!job || !job.pendingApproval) return;
      job.pendingApproval = false;
      job.enabled = job.enabledOnApproval ?? true;
      delete job.enabledOnApproval;
      job.updatedAt = new Date().toISOString();
      storage.saveJob(job);
      scheduler.reschedule(job);
      publishState(api);
      break;
    }

    case 'delete-job': {
      const id = payload.id as string;
      executor.kill(id);
      scheduler.remove(id);
      storage.deleteJob(id);
      publishState(api);
      break;
    }

    case 'toggle-job': {
      const job = storage.getJob(payload.id as string);
      if (!job) return;
      if (job.pendingApproval && !job.enabled) {
        api.log.warn(`Cron: refusing to enable pending job "${job.name}"; approve it first`);
        return;
      }
      job.enabled = !job.enabled;
      job.updatedAt = new Date().toISOString();
      storage.saveJob(job);
      scheduler.reschedule(job);
      publishState(api);
      break;
    }

    case 'run-now': {
      const job = storage.getJob(payload.id as string);
      if (!job) return;
      if (job.pendingApproval) {
        api.log.warn(`Cron: refusing to run pending job "${job.name}"; approve it first`);
        return;
      }
      await runJob(api, job, 'manual');
      break;
    }

    case 'stop-job': {
      const id = payload.id as string;
      const killed = executor.kill(id);
      if (killed) {
        api.log.info(`Killed running cron job: ${id}`);
      }
      publishState(api);
      break;
    }

    case 'clear-history': {
      const jobId = payload.jobId as string;
      if (jobId) {
        storage.pruneHistory(jobId, 0);
      }
      publishState(api);
      break;
    }

    case 'load-history': {
      publishState(api);
      break;
    }

    default:
      api.log.warn(`Unknown cron panel action: ${action}`);
  }
}

// Automation-bus action target. Only run-now / stop-job / clear-history are
// accepted here so that an agent-authored automation rule (via the host
// `automations` tool) cannot mutate the job set: create/update/approve would
// bypass requireAgentApproval, and toggle/delete are gated on the AI-tool path
// so they stay gated here too. The panel:cron-panel target remains registered
// for renderer IPC but is not declared in the automation catalog. Returns
// {ok:true,...} or {error:string} so the host engine can record success/failure.
async function handleAutomationAction(api: PluginAPI, action: string, data?: unknown): Promise<unknown> {
  if (!storage || !executor) return { error: 'Cron plugin not ready' };
  const payload = (data ?? {}) as Record<string, unknown>;

  switch (action) {
    case 'run-now': {
      const id = payload.id as string;
      const job = storage.getJob(id);
      if (!job) return { error: `Job not found: ${id}` };
      if (job.pendingApproval) return { error: `Job "${job.name}" is pending user approval` };
      const run = await runJob(api, job, 'manual', { notify: false });
      return {
        ok: run.status !== 'failed',
        runId: run.id,
        status: run.status,
        durationMs: run.durationMs,
        ...(run.error && { error: run.error }),
      };
    }

    case 'stop-job': {
      const id = payload.id as string;
      const killed = executor.kill(id);
      publishState(api);
      return killed ? { ok: true, jobId: id } : { error: `Job ${id} is not running` };
    }

    case 'clear-history': {
      const jobId = payload.jobId as string;
      if (!jobId) return { error: 'jobId is required' };
      storage.pruneHistory(jobId, 0);
      publishState(api);
      return { ok: true, jobId };
    }

    default:
      return {
        error: `Cron automation target does not accept "${action}". Allowed: run-now, stop-job, clear-history. Use the cron_* tools for job creation/modification/toggle/delete (those honour requireAgentApproval).`,
      };
  }
}

async function handleSettingsAction(api: PluginAPI, action: string, data?: unknown): Promise<void> {
  if (!storage) return;

  switch (action) {
    case 'save-defaults': {
      const defaults = data as CronDefaults;
      storage.setDefaults(defaults);
      publishState(api);
      break;
    }

    default:
      api.log.warn(`Unknown cron settings action: ${action}`);
  }
}

export async function activate(api: PluginAPI): Promise<void> {
  api.log.info('Cron plugin activating');

  storage = new CronStorage(api);
  executor = new CronExecutor(api, storage);

  scheduler = new CronScheduler(storage, {
    onJobDue: async (job: CronJob) => {
      api.log.info(`Cron job "${job.name}" is due, executing...`);
      busEmit(api, 'job.due', {
        jobId: job.id,
        jobName: job.name,
        jobType: job.type,
        schedule: job.schedule,
        firedAt: new Date().toISOString(),
      });
      // Bus listeners run their actions asynchronously, so a job.due automation that
      // dispatches toggle-job/delete-job cannot land before the sync prefix of
      // execute() records the run. Re-read anyway so a synchronous listener that
      // does mutate storage sees its edit honoured rather than executing stale state.
      const current = storage!.getJob(job.id);
      if (!current || !current.enabled || current.pendingApproval) return;
      await runJob(api, current, 'schedule');
    },
    log: api.log,
  });

  // Register UI
  api.ui.registerPanelView({
    id: PANEL_ID,
    title: 'Cron Scheduler',
    visible: true,
    width: 'full',
  });

  api.ui.registerNavigationItem({
    id: NAV_ID,
    visible: true,
    target: { type: 'panel', panelId: PANEL_ID },
  });

  api.ui.registerSettingsView({
    id: SETTINGS_ID,
    label: 'Cron Scheduler',
  });

  // Register action handlers
  api.onAction(`panel:${PANEL_ID}`, (action, data) => handlePanelAction(api, action, data));
  api.onAction(`settings:${SETTINGS_ID}`, (action, data) => handleSettingsAction(api, action, data));
  api.onAction(AUTOMATION_TARGET_ID, (action, data) => handleAutomationAction(api, action, data));

  // Automation event bus catalog
  try {
    api.events?.declare({
      events: [
        {
          event: 'job.due',
          title: 'Schedule fired',
          description: 'A cron schedule reached its next fire time (emitted before execution begins).',
          payloadSchema: {
            type: 'object',
            properties: {
              jobId: { type: 'string' },
              jobName: { type: 'string' },
              jobType: { type: 'string', enum: ['command', 'ai'] },
              schedule: { type: 'string' },
              firedAt: { type: 'string' },
            },
          },
        },
        {
          event: 'run.started',
          title: 'Run started',
          description: 'A cron job began executing (scheduled or manual). Not emitted when the executor skips an overlapping run.',
          payloadSchema: {
            type: 'object',
            properties: {
              runId: { type: 'string' },
              jobId: { type: 'string' },
              jobName: { type: 'string' },
              jobType: { type: 'string', enum: ['command', 'ai'] },
              schedule: { type: 'string' },
              triggeredBy: { type: 'string', enum: ['schedule', 'manual'] },
              startedAt: { type: 'string' },
            },
          },
        },
        {
          event: 'run.finished',
          title: 'Run finished',
          description: 'A cron job finished executing. Filter on `status` for completed / failed / skipped.',
          payloadSchema: {
            type: 'object',
            properties: {
              runId: { type: 'string' },
              jobId: { type: 'string' },
              jobName: { type: 'string' },
              jobType: { type: 'string', enum: ['command', 'ai'] },
              schedule: { type: 'string' },
              status: { type: 'string', enum: ['completed', 'failed', 'skipped'] },
              triggeredBy: { type: 'string', enum: ['schedule', 'manual'] },
              startedAt: { type: 'string' },
              completedAt: { type: 'string' },
              durationMs: { type: 'number' },
              exitCode: { type: 'number' },
              httpStatus: { type: 'number' },
              error: { type: 'string' },
              skippedReason: { type: 'string' },
              output: { type: 'string', description: 'stdout / response body / AI text (truncated to 4000 chars)' },
            },
          },
        },
      ],
      actions: [
        {
          targetId: AUTOMATION_TARGET_ID,
          title: 'Cron job action',
          description:
            'Dispatch a Cron action. Set the action verb to one of: run-now {id}, stop-job {id}, ' +
            'clear-history {jobId}. Job creation/modification/approval/toggle/delete are rejected ' +
            'on this target — use the cron_* tools, which honour the requireAgentApproval gate.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Job id (for run-now / stop-job)' },
              jobId: { type: 'string', description: 'Job id (for clear-history)' },
            },
            additionalProperties: true,
          },
        },
      ],
    });
  } catch (err) {
    api.log.warn('events.declare unavailable:', err);
  }

  // Register AI tools
  const tools = buildCronTools({
    storage,
    scheduler,
    executor,
    api,
    publishState: () => publishState(api),
    runJob: (job, triggeredBy) => runJob(api, job, triggeredBy, { notify: false }),
  });
  api.tools.register(tools as any);

  // Detect missed runs
  const jobs = Object.values(storage.getJobs());
  const missedRuns = scheduler.detectMissedRuns(jobs);
  if (missedRuns.length > 0) {
    api.log.info(`Detected ${missedRuns.length} missed cron run(s)`);
    storage.addRuns(missedRuns);
    for (const jobId of new Set(missedRuns.map((r) => r.jobId))) {
      storage.pruneHistory(jobId);
    }
    api.notifications.show({
      id: 'cron-missed-runs',
      title: 'Cron: Missed runs detected',
      body: `${missedRuns.length} scheduled run(s) were skipped while the app was closed`,
      level: 'warning',
      native: true,
      autoDismissMs: 10000,
    });
  }

  // Start scheduler
  scheduler.start(jobs);

  // Watch for config changes
  unsubConfig = api.config.onChanged(() => {
    if (!storage || !scheduler) return;
    const currentJobs = Object.values(storage.getJobs());
    scheduler.stop();
    scheduler.start(currentJobs);
    publishState(api);
  });

  // Publish initial state
  publishState(api);

  api.log.info(`Cron plugin activated with ${jobs.length} job(s)`);
}

export async function deactivate(): Promise<void> {
  if (unsubConfig) {
    unsubConfig();
    unsubConfig = null;
  }
  if (scheduler) {
    scheduler.stop();
    scheduler = null;
  }
  executor = null;
  storage = null;
}
