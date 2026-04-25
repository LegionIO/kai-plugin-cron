import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { CronJob, CronRunRecord, CronDefaults, PluginAPI } from '../shared/types.js';
import { DEFAULT_MAX_HISTORY_RETENTION } from '../shared/constants.js';

type HistoryFile = {
  version: number;
  runs: Record<string, CronRunRecord[]>;
};

export class CronStorage {
  private api: PluginAPI;
  private historyPath: string;

  constructor(api: PluginAPI) {
    this.api = api;
    this.historyPath = join(api.pluginDir, 'history.json');
  }

  getJobs(): Record<string, CronJob> {
    const data = this.api.config.getPluginData();
    return (data.jobs as Record<string, CronJob>) ?? {};
  }

  getJob(id: string): CronJob | null {
    return this.getJobs()[id] ?? null;
  }

  saveJob(job: CronJob): void {
    const jobs = this.getJobs();
    jobs[job.id] = job;
    this.api.config.setPluginData('jobs', jobs);
  }

  deleteJob(id: string): void {
    const jobs = this.getJobs();
    delete jobs[id];
    this.api.config.setPluginData('jobs', jobs);
    this.deleteHistoryForJob(id);
  }

  getDefaults(): CronDefaults {
    const data = this.api.config.getPluginData();
    return (data.defaults as CronDefaults) ?? {};
  }

  setDefaults(defaults: CronDefaults): void {
    this.api.config.setPluginData('defaults', defaults);
  }

  private readHistory(): HistoryFile {
    if (!existsSync(this.historyPath)) {
      return { version: 1, runs: {} };
    }
    try {
      return JSON.parse(readFileSync(this.historyPath, 'utf-8'));
    } catch {
      return { version: 1, runs: {} };
    }
  }

  private writeHistory(history: HistoryFile): void {
    const dir = join(this.api.pluginDir);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.historyPath, JSON.stringify(history, null, 2), 'utf-8');
  }

  getHistory(jobId?: string | null, limit?: number): CronRunRecord[] {
    const history = this.readHistory();
    let runs: CronRunRecord[];

    if (jobId) {
      runs = history.runs[jobId] ?? [];
    } else {
      runs = Object.values(history.runs).flat();
    }

    runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    if (limit && limit > 0) {
      runs = runs.slice(0, limit);
    }

    return runs;
  }

  addRun(record: CronRunRecord): void {
    const history = this.readHistory();
    if (!history.runs[record.jobId]) {
      history.runs[record.jobId] = [];
    }
    history.runs[record.jobId].push(record);
    this.writeHistory(history);
  }

  updateRun(runId: string, updates: Partial<CronRunRecord>): void {
    const history = this.readHistory();
    for (const jobRuns of Object.values(history.runs)) {
      const idx = jobRuns.findIndex((r) => r.id === runId);
      if (idx >= 0) {
        jobRuns[idx] = { ...jobRuns[idx], ...updates };
        this.writeHistory(history);
        return;
      }
    }
  }

  pruneHistory(jobId: string, maxRecords?: number): void {
    const max = maxRecords ?? this.getDefaults().maxHistoryRetention ?? DEFAULT_MAX_HISTORY_RETENTION;
    const history = this.readHistory();
    const runs = history.runs[jobId];
    if (!runs || runs.length <= max) return;

    runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    history.runs[jobId] = runs.slice(0, max);
    this.writeHistory(history);
  }

  private deleteHistoryForJob(jobId: string): void {
    const history = this.readHistory();
    delete history.runs[jobId];
    this.writeHistory(history);
  }

  getLastRunAt(jobId: string): string | null {
    const runs = this.getHistory(jobId);
    const completedRuns = runs.filter((r) => r.status === 'completed' || r.status === 'failed');
    if (completedRuns.length === 0) return null;
    return completedRuns[0].startedAt;
  }
}
