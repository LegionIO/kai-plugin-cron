import * as cronParser from 'cron-parser';
const { parseExpression } = cronParser;
import type { CronJob, CronRunRecord } from '../shared/types.js';
import type { CronStorage } from './storage.js';

type SchedulerCallbacks = {
  onJobDue: (job: CronJob) => void;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
};

export class CronScheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private nextRuns = new Map<string, Date>();
  private callbacks: SchedulerCallbacks;
  private storage: CronStorage;

  constructor(storage: CronStorage, callbacks: SchedulerCallbacks) {
    this.storage = storage;
    this.callbacks = callbacks;
  }

  start(jobs: CronJob[]): void {
    for (const job of jobs) {
      if (job.enabled) {
        this.scheduleNext(job);
      }
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.nextRuns.clear();
  }

  reschedule(job: CronJob): void {
    this.remove(job.id);
    if (job.enabled) {
      this.scheduleNext(job);
    }
  }

  remove(jobId: string): void {
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }
    this.nextRuns.delete(jobId);
  }

  getNextRun(jobId: string): string | null {
    const next = this.nextRuns.get(jobId);
    return next ? next.toISOString() : null;
  }

  getAllNextRuns(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [jobId, date] of this.nextRuns) {
      result[jobId] = date.toISOString();
    }
    return result;
  }

  detectMissedRuns(jobs: CronJob[]): CronRunRecord[] {
    const missed: CronRunRecord[] = [];
    const now = new Date();

    for (const job of jobs) {
      if (!job.enabled) continue;

      const lastRunAt = this.storage.getLastRunAt(job.id);
      if (!lastRunAt) continue;

      const startFrom = new Date(lastRunAt);
      try {
        const interval = parseExpression(job.schedule, {
          currentDate: startFrom,
          tz: job.timezone,
        });

        while (true) {
          const next = interval.next();
          if (next.toDate().getTime() >= now.getTime()) break;

          missed.push({
            id: `skip-${job.id}-${next.toDate().getTime()}`,
            jobId: job.id,
            jobName: job.name,
            status: 'skipped',
            triggeredBy: 'schedule',
            startedAt: next.toDate().toISOString(),
            completedAt: now.toISOString(),
            skippedReason: 'App was not running',
          });
        }
      } catch (err) {
        this.callbacks.log.warn(`Failed to detect missed runs for job "${job.name}":`, err);
      }
    }

    return missed;
  }

  private scheduleNext(job: CronJob): void {
    try {
      const interval = parseExpression(job.schedule, {
        currentDate: new Date(),
        tz: job.timezone,
      });
      const next = interval.next().toDate();
      const delay = next.getTime() - Date.now();

      this.nextRuns.set(job.id, next);

      const timer = setTimeout(() => {
        this.timers.delete(job.id);
        this.nextRuns.delete(job.id);
        this.callbacks.onJobDue(job);
        const currentJob = this.storage.getJob(job.id);
        if (currentJob?.enabled) {
          this.scheduleNext(currentJob);
        }
      }, Math.max(delay, 0));

      this.timers.set(job.id, timer);
      this.callbacks.log.info(`Scheduled "${job.name}" for ${next.toISOString()} (in ${Math.round(delay / 1000)}s)`);
    } catch (err) {
      this.callbacks.log.error(`Failed to schedule job "${job.name}":`, err);
    }
  }
}

export function getNextCronDate(schedule: string, timezone?: string): Date | null {
  try {
    const interval = parseExpression(schedule, {
      currentDate: new Date(),
      tz: timezone,
    });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

export function isValidCronExpression(schedule: string): boolean {
  try {
    parseExpression(schedule);
    return true;
  } catch {
    return false;
  }
}
