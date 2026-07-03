import { exec, type ChildProcess } from 'child_process';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import type { CronJob, CronRunRecord, CronDefaults, PluginAPI } from '../shared/types.js';
import type { CronStorage } from './storage.js';
import { DEFAULT_COMMAND_TIMEOUT_MS, DEFAULT_BLOCK_PRIVATE_HTTP_TARGETS } from '../shared/constants.js';

function isPrivateAddress(addr: string, family: number): boolean {
  if (family === 4) {
    const o = addr.split('.').map(Number);
    if (o[0] === 10) return true;
    if (o[0] === 127) return true;
    if (o[0] === 0) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 169 && o[1] === 254) return true;
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true;
    return false;
  }
  const lower = addr.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) {
    const tail = lower.slice(7);
    if (isIP(tail) === 4) return isPrivateAddress(tail, 4);
    const m = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (m) {
      const hi = parseInt(m[1], 16);
      const lo = parseInt(m[2], 16);
      const v4 = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
      return isPrivateAddress(v4, 4);
    }
    return true;
  }
  return false;
}

function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Aborted'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

async function assertPublicHttpTarget(rawUrl: string, signal: AbortSignal): Promise<{ url: URL; host: string; addresses: { address: string; family: number }[] }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Blocked: invalid URL "${rawUrl}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Blocked: only http/https URLs are allowed (got "${url.protocol}")`);
  }
  let host = url.hostname;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);

  let resolved: { address: string; family: number }[];
  const literal = isIP(host);
  if (literal) {
    resolved = [{ address: host, family: literal }];
  } else {
    try {
      resolved = await abortable(lookup(host, { all: true, verbatim: true }), signal);
    } catch (err) {
      throw new Error(`Blocked: failed to resolve host "${host}": ${err instanceof Error ? err.message : String(err)}`);
    }
    if (resolved.length === 0) {
      throw new Error(`Blocked: host "${host}" did not resolve`);
    }
  }
  for (const { address, family } of resolved) {
    if (isPrivateAddress(address, family)) {
      throw new Error(`Blocked: "${host}" resolves to a private/loopback/link-local address (${address}); blockPrivateHttpTargets is enabled`);
    }
  }
  return { url, host, addresses: resolved };
}

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

function stripSensitiveHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return headers;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

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

  async execute(
    job: CronJob,
    triggeredBy: 'schedule' | 'manual',
    opts: { onStarted?: (run: CronRunRecord) => void } = {},
  ): Promise<CronRunRecord> {
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
      opts.onStarted?.(run);
    } catch (err) {
      this.api.log.warn('onStarted hook threw:', err);
    }

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

    // A run.started bus listener may have called stop-job before the child
    // process was spawned; honour the abort here rather than launching and
    // then racing SIGTERM against the command's initial side effects.
    if (signal.aborted) throw new Error('Killed by user');

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
      const blockPrivate = defaults.blockPrivateHttpTargets ?? DEFAULT_BLOCK_PRIVATE_HTTP_TARGETS;
      const result = await this.runHttpRequest(cmd.http!, timeout, signal, blockPrivate);
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
    signal: AbortSignal | undefined,
    blockPrivate: boolean,
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
      if (!blockPrivate) {
        const response = await this.api.fetch(config.url, {
          method: config.method,
          headers: config.headers,
          body: config.body,
          signal: controller.signal,
        });
        const text = await response.text();
        return { status: response.status, body: text };
      }

      let currentUrl = config.url;
      let method = config.method || 'GET';
      let body: string | undefined = config.body;
      let headers = config.headers;
      let response!: Response;
      const maxRedirects = 5;
      const initialOrigin = (() => { try { return new URL(config.url).origin; } catch { return ''; } })();

      for (let i = 0; ; i++) {
        const validated = await assertPublicHttpTarget(currentUrl, controller.signal);

        // For plain HTTP, connect to the validated IP (prevents DNS rebinding
        // between the lookup above and fetch's own resolution). HTTPS keeps the
        // hostname so TLS SNI/cert validation works — a rebound private target
        // would have to present a certificate valid for the attacker-controlled
        // hostname, which fails closed under normal trust stores. Residual risk
        // is accepted here because api.fetch does not expose a socket-level
        // lookup hook.
        if (validated.url.protocol === 'http:' && isIP(validated.host) === 0) {
          const pinnedHeaders = { ...(headers ?? {}), Host: validated.url.host };
          let lastErr: unknown;
          response = undefined as unknown as Response;
          for (const { address, family } of validated.addresses) {
            const pinned = new URL(validated.url.toString());
            pinned.hostname = family === 6 ? `[${address}]` : address;
            try {
              response = await this.api.fetch(pinned.toString(), {
                method,
                headers: pinnedHeaders,
                body,
                signal: controller.signal,
                redirect: 'manual',
              });
              break;
            } catch (err) {
              lastErr = err;
              if (controller.signal.aborted) throw err;
            }
          }
          if (!response) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
        } else {
          response = await this.api.fetch(validated.url.toString(), {
            method,
            headers,
            body,
            signal: controller.signal,
            redirect: 'manual',
          });
        }

        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get('location');
        if (!location) break;
        if (i >= maxRedirects) {
          throw new Error(`Blocked: too many redirects (> ${maxRedirects})`);
        }
        const nextUrl = new URL(location, validated.url).toString();
        if (new URL(nextUrl).origin !== initialOrigin) {
          headers = stripSensitiveHeaders(headers);
        }
        currentUrl = nextUrl;
        const upper = method.toUpperCase();
        if ((response.status === 303 && upper !== 'GET' && upper !== 'HEAD')
            || ((response.status === 301 || response.status === 302) && upper === 'POST')) {
          method = 'GET';
          body = undefined;
        }
      }

      const text = await response.text();
      return { status: response.status, body: text };
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
