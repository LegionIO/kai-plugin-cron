import * as cronParser from 'cron-parser';
const { parseExpression } = cronParser;
import type { CronJob, CronRunRecord } from '../shared/types.js';
import type { CronStorage } from './storage.js';
import { MAX_TIMER_MS, DEFAULT_MAX_HISTORY_RETENTION } from '../shared/constants.js';

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
      if (job.enabled && !job.pendingApproval) {
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
    if (job.enabled && !job.pendingApproval) {
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
    const cap = this.storage.getDefaults().maxHistoryRetention ?? DEFAULT_MAX_HISTORY_RETENTION;

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

        const jobMissed: CronRunRecord[] = [];
        let capped = false;
        while (true) {
          const next = interval.next();
          if (next.toDate().getTime() >= now.getTime()) break;
          if (jobMissed.length >= cap) {
            capped = true;
            break;
          }

          jobMissed.push({
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

        if (capped && jobMissed.length > 0) {
          const last = jobMissed[jobMissed.length - 1];
          last.id = `skip-${job.id}-${now.getTime()}`;
          last.startedAt = now.toISOString();
          last.skippedReason = `${cap}+ runs skipped while app was closed`;
        }

        missed.push(...jobMissed);
      } catch (err) {
        this.callbacks.log.warn(`Failed to detect missed runs for job "${job.name}":`, err);
      }
    }

    return missed;
  }

  private scheduleNext(job: CronJob, target?: Date): void {
    try {
      let next: Date;
      if (target) {
        next = target;
      } else {
        const interval = parseExpression(job.schedule, {
          currentDate: new Date(),
          tz: job.timezone,
        });
        next = interval.next().toDate();
      }
      const delay = next.getTime() - Date.now();

      this.nextRuns.set(job.id, next);

      const timer = setTimeout(() => {
        this.timers.delete(job.id);

        const currentJob = this.storage.getJob(job.id);
        if (!currentJob?.enabled || currentJob.pendingApproval) {
          this.nextRuns.delete(job.id);
          return;
        }

        if (Date.now() < next.getTime()) {
          this.scheduleNext(currentJob, next);
          return;
        }

        this.nextRuns.delete(job.id);
        this.callbacks.onJobDue(currentJob);

        // A job.due bus listener may have update/toggle/delete/reschedule'd this
        // job before onJobDue's sync prefix returned. If a timer already exists
        // that reschedule wins; otherwise re-read storage so we schedule from the
        // current definition rather than the pre-emit snapshot.
        if (this.timers.has(job.id)) return;
        const afterJob = this.storage.getJob(job.id);
        if (afterJob?.enabled && !afterJob.pendingApproval) {
          this.scheduleNext(afterJob);
        }
      }, Math.min(Math.max(delay, 0), MAX_TIMER_MS));

      const prev = this.timers.get(job.id);
      if (prev) clearTimeout(prev);
      this.timers.set(job.id, timer);
      if (!target) {
        this.callbacks.log.info(`Scheduled "${job.name}" for ${next.toISOString()} (in ${Math.round(delay / 1000)}s)`);
      }
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

export function isValidCronExpression(schedule: unknown): boolean {
  if (typeof schedule !== 'string') return false;
  const trimmed = schedule.trim();
  if (trimmed.length === 0) return false;
  if (!trimmed.startsWith('@') && trimmed.split(/\s+/).length !== 5) {
    return false;
  }
  try {
    parseExpression(trimmed);
    return true;
  } catch {
    return false;
  }
}
