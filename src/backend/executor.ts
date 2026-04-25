import { exec, type ChildProcess } from 'child_process';
import type { CronJob, CronRunRecord, CronDefaults, PluginAPI } from '../shared/types.js';
import type { CronStorage } from './storage.js';
import { DEFAULT_COMMAND_TIMEOUT_MS } from '../shared/constants.js';

type RunningEntry = {
  abortController: AbortController;
  childProcess?: ChildProcess;
};

export class CronExecutor {
  private api: PluginAPI;
  private storage: CronStorage;
  private runningJobs = new Map<string, RunningEntry>();

  constructor(api: PluginAPI, storage: CronStorage) {
    this.api = api;
    this.storage = storage;
  }

  isRunning(jobId: string): boolean {
    return this.runningJobs.has(jobId);
  }

  getRunningJobIds(): string[] {
    return [...this.runningJobs.keys()];
  }

  kill(jobId: string): boolean {
    const entry = this.runningJobs.get(jobId);
    if (!entry) return false;

    entry.abortController.abort();
    if (entry.childProcess) {
      try { entry.childProcess.kill('SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => {
        try { entry.childProcess?.kill('SIGKILL'); } catch { /* ignore */ }
      }, 3000);
    }
    return true;
  }

  async execute(job: CronJob, triggeredBy: 'schedule' | 'manual'): Promise<CronRunRecord> {
    if (this.runningJobs.has(job.id)) {
      const skipped: CronRunRecord = {
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        jobId: job.id,
        jobName: job.name,
        status: 'skipped',
        triggeredBy,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        skippedReason: 'Previous run still in progress',
      };
      this.storage.addRun(skipped);
      return skipped;
    }

    const run: CronRunRecord = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      jobId: job.id,
      jobName: job.name,
      status: 'running',
      triggeredBy,
      startedAt: new Date().toISOString(),
    };

    this.storage.addRun(run);

    const abortController = new AbortController();
    this.runningJobs.set(job.id, { abortController });

    try {
      if (job.type === 'command') {
        await this.executeCommand(job, run, abortController.signal);
      } else if (job.type === 'ai') {
        await this.executeAI(job, run, abortController.signal);
      }

      run.status = 'completed';
    } catch (err) {
      if (abortController.signal.aborted) {
        run.status = 'failed';
        run.error = 'Killed by user';
      } else {
        run.status = 'failed';
        run.error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      run.completedAt = new Date().toISOString();
      run.durationMs = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
      this.storage.updateRun(run.id, run);
      this.storage.pruneHistory(job.id);
      this.runningJobs.delete(job.id);
    }

    return run;
  }

  private async executeCommand(job: CronJob, run: CronRunRecord, signal: AbortSignal): Promise<void> {
    const cmd = job.command;
    if (!cmd) throw new Error('No command configuration');

    const defaults = this.storage.getDefaults();
    const timeout = (cmd.type === 'shell' ? cmd.shell?.timeoutMs : cmd.http?.timeoutMs)
      ?? defaults.commandTimeoutMs
      ?? DEFAULT_COMMAND_TIMEOUT_MS;

    if (cmd.type === 'shell') {
      const result = await this.runShellCommand(job.id, cmd.shell!.command, cmd.shell?.cwd, timeout, signal);
      run.commandResult = {
        type: 'shell',
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
      if (result.exitCode !== 0 && !signal.aborted) {
        throw new Error(`Command exited with code ${result.exitCode}: ${result.stderr || result.stdout}`);
      }
      if (signal.aborted) throw new Error('Killed by user');
    } else if (cmd.type === 'http') {
      const result = await this.runHttpRequest(cmd.http!, timeout, signal);
      run.commandResult = {
        type: 'http',
        httpStatus: result.status,
        httpBody: result.body,
      };
      if (result.status >= 400) {
        throw new Error(`HTTP ${result.status}: ${result.body.slice(0, 500)}`);
      }
    }
  }

  private runShellCommand(
    jobId: string,
    command: string,
    cwd?: string,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = exec(command, {
        cwd: cwd || undefined,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: signal?.aborted ? 137 : (error ? (error.code ?? 1) : 0),
        });
      });

      const entry = this.runningJobs.get(jobId);
      if (entry) {
        entry.childProcess = proc;
      }

      if (signal) {
        const onAbort = () => {
          try { proc.kill('SIGTERM'); } catch { /* ignore */ }
          setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch { /* ignore */ }
          }, 3000);
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }
    });
  }

  private async runHttpRequest(
    config: { url: string; method: string; headers?: Record<string, string>; body?: string; timeoutMs?: number },
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    if (signal) {
      const onAbort = () => controller.abort();
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    try {
      const response = await this.api.fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body,
        signal: controller.signal,
      });

      const body = await response.text();
      return { status: response.status, body };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async executeAI(job: CronJob, run: CronRunRecord, signal: AbortSignal): Promise<void> {
    const ai = job.ai;
    if (!ai) throw new Error('No AI configuration');

    if (signal.aborted) throw new Error('Killed by user');

    const defaults = this.storage.getDefaults();
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'user', content: ai.prompt },
    ];

    const result = await this.api.agent.generate({
      messages,
      systemPrompt: ai.systemPrompt,
      modelKey: ai.modelOverride ?? defaults.modelOverride,
      profileKey: ai.profileOverride ?? defaults.profileOverride,
      reasoningEffort: (ai.reasoningEffort ?? defaults.reasoningEffort) as 'low' | 'medium' | 'high' | 'xhigh' | undefined,
      fallbackEnabled: ai.fallbackEnabled ?? defaults.fallbackEnabled,
      maxTokens: ai.maxTokens,
      tools: ai.enableTools !== false,
      abortSignal: signal,
    });

    run.aiResult = {
      text: result.text,
      modelKey: result.modelKey,
      messages: [
        ...(ai.systemPrompt ? [{ role: 'system', content: ai.systemPrompt }] : []),
        { role: 'user', content: ai.prompt },
        { role: 'assistant', content: result.text },
      ],
      toolCalls: result.toolCalls ?? [],
    };
  }
}
