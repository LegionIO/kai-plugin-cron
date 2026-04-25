import { CronStorage } from './main/storage.js';
import { CronScheduler } from './main/scheduler.js';
import { CronExecutor } from './main/executor.js';
import { buildCronTools } from './main/tools.js';
import { PANEL_ID, NAV_ID, SETTINGS_ID, CLOCK_ICON_SVG } from './shared/constants.js';
import type { CronJob, CronDefaults, PluginAPI } from './shared/types.js';

let storage: CronStorage | null = null;
let scheduler: CronScheduler | null = null;
let executor: CronExecutor | null = null;
let unsubConfig: (() => void) | null = null;

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
    label: 'Cron',
    icon: { svg: CLOCK_ICON_SVG },
    visible: true,
    priority: 40,
    badge: runningJobs.length > 0 ? runningJobs.length : undefined,
    target: { type: 'panel', panelId: PANEL_ID },
  });
}

async function handlePanelAction(api: PluginAPI, action: string, data?: unknown): Promise<void> {
  if (!storage || !scheduler || !executor) return;

  const payload = (data ?? {}) as Record<string, unknown>;

  switch (action) {
    case 'create-job': {
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
      const updated: CronJob = {
        ...existing,
        ...Object.fromEntries(
          Object.entries(payload).filter(([k]) => k !== 'id'),
        ),
        updatedAt: new Date().toISOString(),
      } as CronJob;
      storage.saveJob(updated);
      scheduler.reschedule(updated);
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
      publishState(api);
      const run = await executor.execute(job, 'manual');
      publishState(api);

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
      publishState(api);

      const run = await executor!.execute(job, 'schedule');
      publishState(api);

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
    },
    log: api.log,
  });

  // Register UI
  api.ui.registerPanel({
    id: PANEL_ID,
    component: 'CronPanel',
    title: 'Cron Scheduler',
    visible: true,
    width: 'full',
  });

  api.ui.registerNavigationItem({
    id: NAV_ID,
    label: 'Cron',
    icon: { svg: CLOCK_ICON_SVG },
    visible: true,
    priority: 40,
    target: { type: 'panel', panelId: PANEL_ID },
  });

  api.ui.registerSettingsSection({
    id: SETTINGS_ID,
    label: 'Cron Scheduler',
    component: 'CronSettings',
    priority: 40,
  });

  // Register action handlers
  api.onAction(`panel:${PANEL_ID}`, (action, data) => handlePanelAction(api, action, data));
  api.onAction(`settings:CronSettings`, (action, data) => handleSettingsAction(api, action, data));

  // Register AI tools
  const tools = buildCronTools({
    storage,
    scheduler,
    executor,
    api,
    publishState: () => publishState(api),
  });
  api.tools.register(tools as any);

  // Detect missed runs
  const jobs = Object.values(storage.getJobs());
  const missedRuns = scheduler.detectMissedRuns(jobs);
  if (missedRuns.length > 0) {
    api.log.info(`Detected ${missedRuns.length} missed cron run(s)`);
    for (const run of missedRuns) {
      storage.addRun(run);
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
