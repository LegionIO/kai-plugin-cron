export type CronJobType = 'command' | 'ai';

export type ShellCommandConfig = {
  command: string;
  cwd?: string;
  timeoutMs?: number;
};

export type HttpCommandConfig = {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

export type CommandConfig = {
  type: 'shell' | 'http';
  shell?: ShellCommandConfig;
  http?: HttpCommandConfig;
};

export type AIConfig = {
  prompt: string;
  systemPrompt?: string;
  modelOverride?: string;
  profileOverride?: string;
  fallbackEnabled?: boolean;
  reasoningEffort?: string;
  enableTools?: boolean;
  maxTokens?: number;
};

export type CronJob = {
  id: string;
  name: string;
  schedule: string;
  timezone?: string;
  enabled: boolean;
  type: CronJobType;
  command?: CommandConfig;
  ai?: AIConfig;
  createdAt: string;
  updatedAt: string;
};

export type CronRunStatus = 'running' | 'completed' | 'failed' | 'skipped';

export type CommandResult = {
  type: 'shell' | 'http';
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  httpStatus?: number;
  httpBody?: string;
};

export type AIToolCall = {
  toolName: string;
  args: unknown;
  result: unknown;
  error?: string;
  durationMs?: number;
};

export type AIResult = {
  text: string;
  modelKey: string;
  messages: Array<{ role: string; content: string }>;
  toolCalls: AIToolCall[];
};

export type CronRunRecord = {
  id: string;
  jobId: string;
  jobName: string;
  status: CronRunStatus;
  triggeredBy: 'schedule' | 'manual';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  commandResult?: CommandResult;
  aiResult?: AIResult;
  error?: string;
  skippedReason?: string;
};

export type CronDefaults = {
  modelOverride?: string;
  profileOverride?: string;
  fallbackEnabled?: boolean;
  reasoningEffort?: string;
  maxHistoryRetention?: number;
  commandTimeoutMs?: number;
};

export type CronPluginConfig = {
  jobs?: Record<string, CronJob>;
  defaults?: CronDefaults;
};

export type CronPluginState = {
  jobs: CronJob[];
  recentRuns: CronRunRecord[];
  nextRuns: Record<string, string>;
  runningJobs: string[];
  defaults: CronDefaults;
};

export type PluginAPI = {
  pluginName: string;
  pluginDir: string;
  config: {
    get: () => Record<string, unknown>;
    set: (path: string, value: unknown) => void;
    getPluginData: () => Record<string, unknown>;
    setPluginData: (path: string, value: unknown) => void;
    onChanged: (callback: (config: Record<string, unknown>) => void) => () => void;
  };
  state: {
    get: () => Record<string, unknown>;
    replace: (next: Record<string, unknown>) => void;
    set: (path: string, value: unknown) => void;
    emitEvent: (eventName: string, data?: unknown) => void;
  };
  tools: {
    register: (tools: Array<{
      name: string;
      description: string;
      inputSchema: unknown;
      execute: (input: unknown, context: unknown) => Promise<unknown>;
    }>) => void;
    unregister: (toolNames: string[]) => void;
  };
  ui: {
    registerPanel: (descriptor: Record<string, unknown>) => void;
    registerNavigationItem: (descriptor: Record<string, unknown>) => void;
    registerSettingsSection: (descriptor: Record<string, unknown>) => void;
  };
  notifications: {
    show: (descriptor: Record<string, unknown>) => void;
    dismiss: (id: string) => void;
  };
  agent: {
    generate: (options: {
      messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
      modelKey?: string;
      profileKey?: string;
      reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
      fallbackEnabled?: boolean;
      systemPrompt?: string;
      maxTokens?: number;
      tools?: boolean;
      abortSignal?: AbortSignal;
    }) => Promise<{
      text: string;
      modelKey: string;
      toolCalls: Array<{
        toolName: string;
        args: unknown;
        result: unknown;
        error?: string;
        durationMs?: number;
      }>;
    }>;
  };
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  onAction: (targetId: string, handler: (action: string, data?: unknown) => void | Promise<void>) => void;
  fetch: typeof globalThis.fetch;
};
