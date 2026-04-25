import { useState, useCallback } from '../hooks';
import { ModelProfileBar } from './ModelProfileSelectors';
import { cronToHuman } from './cronDisplay';

const h = (...args: any[]) => (globalThis as any).React.createElement(...args);

type JobFormProps = {
  job?: any;
  defaults: any;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
};

const TIMEZONES = [
  '',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Phoenix',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Zurich',
  'Europe/Vienna',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Helsinki',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Bucharest',
  'Europe/Athens',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Colombo',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Adelaide',
  'Pacific/Auckland',
  'Pacific/Fiji',
];

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return h('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': active,
    onClick: onToggle,
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      width: '36px',
      height: '20px',
      borderRadius: '10px',
      backgroundColor: active ? 'var(--color-primary, #3b82f6)' : 'rgba(128,128,128,0.3)',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      flexShrink: 0,
      transition: 'background-color 0.2s',
    },
  },
    h('span', {
      style: {
        position: 'absolute',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        backgroundColor: 'white',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        transition: 'transform 0.2s',
        transform: active ? 'translateX(18px)' : 'translateX(2px)',
      },
    }),
  );
}

export function JobForm({ job, defaults, onSave, onCancel }: JobFormProps) {
  const isEdit = !!job;

  const [name, setName] = useState(job?.name ?? '');
  const [schedule, setSchedule] = useState(job?.schedule ?? '');
  const [timezone, setTimezone] = useState(job?.timezone ?? '');
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [type, setType] = useState<'command' | 'ai'>(job?.type ?? 'command');

  // Command fields
  const [cmdType, setCmdType] = useState<'shell' | 'http'>(job?.command?.type ?? 'shell');
  const [shellCmd, setShellCmd] = useState(job?.command?.shell?.command ?? '');
  const [shellCwd, setShellCwd] = useState(job?.command?.shell?.cwd ?? '');
  const [shellTimeout, setShellTimeout] = useState(job?.command?.shell?.timeoutMs ?? '');
  const [httpUrl, setHttpUrl] = useState(job?.command?.http?.url ?? '');
  const [httpMethod, setHttpMethod] = useState(job?.command?.http?.method ?? 'GET');
  const [httpHeaders, setHttpHeaders] = useState<Array<{ key: string; value: string }>>(
    Object.entries((job?.command?.http?.headers ?? {}) as Record<string, string>).map(([key, value]) => ({ key, value })),
  );
  const [httpBody, setHttpBody] = useState(job?.command?.http?.body ?? '');
  const [httpTimeout, setHttpTimeout] = useState(job?.command?.http?.timeoutMs ?? '');

  // AI fields
  const [aiPrompt, setAiPrompt] = useState(job?.ai?.prompt ?? '');
  const [aiSystemPrompt, setAiSystemPrompt] = useState(job?.ai?.systemPrompt ?? '');
  const [aiEnableTools, setAiEnableTools] = useState(job?.ai?.enableTools !== false);
  const [aiMaxTokens, setAiMaxTokens] = useState(job?.ai?.maxTokens ?? '');
  const [aiModelOverride, setAiModelOverride] = useState(job?.ai?.modelOverride ?? defaults?.modelOverride ?? '');
  const [aiProfileOverride, setAiProfileOverride] = useState(job?.ai?.profileOverride ?? defaults?.profileOverride ?? '');
  const [aiFallbackEnabled, setAiFallbackEnabled] = useState(job?.ai?.fallbackEnabled ?? defaults?.fallbackEnabled ?? false);
  const [aiReasoningEffort, setAiReasoningEffort] = useState(job?.ai?.reasoningEffort ?? defaults?.reasoningEffort ?? '');

  const handleModelProfileChange = useCallback((updates: Record<string, unknown>) => {
    if ('modelOverride' in updates) setAiModelOverride(updates.modelOverride as string ?? '');
    if ('profileOverride' in updates) setAiProfileOverride(updates.profileOverride as string ?? '');
    if ('fallbackEnabled' in updates) setAiFallbackEnabled(updates.fallbackEnabled as boolean);
    if ('reasoningEffort' in updates) setAiReasoningEffort(updates.reasoningEffort as string ?? '');
  }, []);

  const handleSave = useCallback(() => {
    const data: Record<string, unknown> = {
      name,
      schedule,
      timezone: timezone || undefined,
      enabled,
      type,
    };

    if (type === 'command') {
      data.command = {
        type: cmdType,
        ...(cmdType === 'shell' ? {
          shell: {
            command: shellCmd,
            cwd: shellCwd || undefined,
            timeoutMs: shellTimeout ? parseInt(shellTimeout, 10) : undefined,
          },
        } : {
          http: {
            url: httpUrl,
            method: httpMethod,
            headers: httpHeaders.length > 0
              ? Object.fromEntries(httpHeaders.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]))
              : undefined,
            body: httpBody || undefined,
            timeoutMs: httpTimeout ? parseInt(httpTimeout, 10) : undefined,
          },
        }),
      };
    } else {
      data.ai = {
        prompt: aiPrompt,
        systemPrompt: aiSystemPrompt || undefined,
        enableTools: aiEnableTools,
        maxTokens: aiMaxTokens ? parseInt(aiMaxTokens, 10) : undefined,
        modelOverride: aiModelOverride || undefined,
        profileOverride: aiProfileOverride || undefined,
        fallbackEnabled: aiFallbackEnabled || undefined,
        reasoningEffort: aiReasoningEffort || undefined,
      };
    }

    onSave(data);
  }, [name, schedule, timezone, enabled, type, cmdType, shellCmd, shellCwd, shellTimeout, httpUrl, httpMethod, httpHeaders, httpBody, httpTimeout, aiPrompt, aiSystemPrompt, aiEnableTools, aiMaxTokens, aiModelOverride, aiProfileOverride, aiFallbackEnabled, aiReasoningEffort, onSave]);

  const isValid = name.trim() && schedule.trim() && (
    type === 'command'
      ? (cmdType === 'shell' ? shellCmd.trim() : httpUrl.trim())
      : aiPrompt.trim()
  );

  const inputClass = 'w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none';
  const selectClass = 'rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm focus:border-primary/50 focus:outline-none';

  const scheduleHuman = schedule.trim() ? cronToHuman(schedule) : '';
  const showHumanReadable = scheduleHuman && scheduleHuman !== schedule.trim();

  return h('div', { className: 'p-4 space-y-6' },
    // Enabled toggle (at top)
    h('div', { className: 'flex items-center justify-between' },
      h('div', null,
        h('div', { className: 'text-sm font-medium' }, 'Enabled'),
        h('div', { className: 'text-xs text-muted-foreground' }, 'Job will run on schedule when enabled'),
      ),
      h(Toggle, { active: enabled, onToggle: () => setEnabled(!enabled) }),
    ),

    // Name
    h('div', { className: 'space-y-1.5' },
      h('label', { className: 'text-sm font-medium' }, 'Name'),
      h('input', {
        type: 'text',
        value: name,
        onChange: (e: any) => setName(e.target.value),
        placeholder: 'e.g. Daily news summary',
        className: inputClass,
        autoFocus: true,
      }),
    ),

    // Schedule
    h('div', { className: 'space-y-1.5' },
      h('label', { className: 'text-sm font-medium' }, 'Schedule (cron expression)'),
      h('input', {
        type: 'text',
        value: schedule,
        onChange: (e: any) => setSchedule(e.target.value),
        placeholder: '0 9 * * 1-5',
        className: inputClass,
      }),
      showHumanReadable
        ? h('p', { className: 'text-xs', style: { color: 'var(--color-primary, #3b82f6)' } }, scheduleHuman)
        : schedule.trim()
          ? h('p', { className: 'text-xs text-muted-foreground' }, scheduleHuman || schedule)
          : h('p', { className: 'text-xs text-muted-foreground/50' }, 'minute  hour  day-of-month  month  day-of-week'),
    ),

    // Timezone selector
    h('div', { className: 'space-y-1.5' },
      h('label', { className: 'text-sm font-medium' }, 'Timezone'),
      h('select', {
        value: timezone,
        onChange: (e: any) => setTimezone(e.target.value),
        className: inputClass,
      },
        h('option', { value: '' }, 'System default'),
        TIMEZONES.filter(Boolean).map((tz) =>
          h('option', { key: tz, value: tz }, tz.replace(/_/g, ' ')),
        ),
      ),
    ),

    // Type selector
    h('div', { className: 'space-y-1.5' },
      h('label', { className: 'text-sm font-medium' }, 'Type'),
      h('div', { className: 'flex gap-2' },
        h('button', {
          type: 'button',
          onClick: () => setType('command'),
          className: `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            type === 'command'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
          }`,
        }, 'Command'),
        h('button', {
          type: 'button',
          onClick: () => setType('ai'),
          className: `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            type === 'ai'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
          }`,
        }, 'AI Agent'),
      ),
    ),

    // Divider
    h('hr', { className: 'border-border/30' }),

    // Type-specific fields
    type === 'command'
      ? h('div', { className: 'space-y-4' },
          h('div', { className: 'space-y-1.5' },
            h('label', { className: 'text-sm font-medium' }, 'Command Type'),
            h('div', { className: 'flex gap-2' },
              h('button', {
                type: 'button',
                onClick: () => setCmdType('shell'),
                className: `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  cmdType === 'shell' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-muted/50 text-muted-foreground'
                }`,
              }, 'Shell'),
              h('button', {
                type: 'button',
                onClick: () => setCmdType('http'),
                className: `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  cmdType === 'http' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-muted/50 text-muted-foreground'
                }`,
              }, 'HTTP'),
            ),
          ),

          cmdType === 'shell'
            ? h('div', { className: 'space-y-4' },
                h('div', { className: 'space-y-1.5' },
                  h('label', { className: 'text-sm font-medium' }, 'Command'),
                  h('input', {
                    type: 'text',
                    value: shellCmd,
                    onChange: (e: any) => setShellCmd(e.target.value),
                    placeholder: 'echo "Hello, world!"',
                    className: inputClass + ' font-mono text-xs',
                  }),
                ),
                h('div', { className: 'grid grid-cols-2 gap-3' },
                  h('div', { className: 'space-y-1.5' },
                    h('label', { className: 'text-sm font-medium' }, 'Working Directory'),
                    h('input', {
                      type: 'text',
                      value: shellCwd,
                      onChange: (e: any) => setShellCwd(e.target.value),
                      placeholder: 'Optional',
                      className: inputClass,
                    }),
                  ),
                  h('div', { className: 'space-y-1.5' },
                    h('label', { className: 'text-sm font-medium' }, 'Timeout (ms)'),
                    h('input', {
                      type: 'number',
                      value: shellTimeout,
                      onChange: (e: any) => setShellTimeout(e.target.value),
                      placeholder: '60000',
                      className: inputClass,
                    }),
                  ),
                ),
              )
            : h('div', { className: 'space-y-4' },
                h('div', { className: 'grid grid-cols-4 gap-3' },
                  h('div', { className: 'col-span-3 space-y-1.5' },
                    h('label', { className: 'text-sm font-medium' }, 'URL'),
                    h('input', {
                      type: 'text',
                      value: httpUrl,
                      onChange: (e: any) => setHttpUrl(e.target.value),
                      placeholder: 'https://api.example.com/webhook',
                      className: inputClass,
                    }),
                  ),
                  h('div', { className: 'space-y-1.5' },
                    h('label', { className: 'text-sm font-medium' }, 'Method'),
                    h('select', {
                      value: httpMethod,
                      onChange: (e: any) => setHttpMethod(e.target.value),
                      className: selectClass,
                    },
                      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) =>
                        h('option', { key: m, value: m }, m),
                      ),
                    ),
                  ),
                ),
                // Headers editor
                h('div', { className: 'space-y-1.5' },
                  h('div', { className: 'flex items-center justify-between' },
                    h('label', { className: 'text-sm font-medium' }, 'Headers'),
                    h('button', {
                      type: 'button',
                      onClick: () => setHttpHeaders([...httpHeaders, { key: '', value: '' }]),
                      className: 'text-xs text-primary hover:text-primary/80 font-medium',
                    }, '+ Add Header'),
                  ),
                  httpHeaders.length > 0
                    ? h('div', { className: 'space-y-1.5' },
                        httpHeaders.map((_header: { key: string; value: string }, idx: number) =>
                          h('div', { key: idx, className: 'flex gap-2 items-center' },
                            h('input', {
                              type: 'text',
                              value: httpHeaders[idx].key,
                              onChange: (e: any) => {
                                const next = [...httpHeaders];
                                next[idx] = { ...next[idx], key: e.target.value };
                                setHttpHeaders(next);
                              },
                              placeholder: 'Header name',
                              className: 'flex-1 rounded-lg border border-border/50 bg-muted/30 px-2 py-1.5 text-xs font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none',
                            }),
                            h('input', {
                              type: 'text',
                              value: httpHeaders[idx].value,
                              onChange: (e: any) => {
                                const next = [...httpHeaders];
                                next[idx] = { ...next[idx], value: e.target.value };
                                setHttpHeaders(next);
                              },
                              placeholder: 'Value',
                              className: 'flex-1 rounded-lg border border-border/50 bg-muted/30 px-2 py-1.5 text-xs font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none',
                            }),
                            h('button', {
                              type: 'button',
                              onClick: () => setHttpHeaders(httpHeaders.filter((_: any, i: number) => i !== idx)),
                              className: 'text-xs text-muted-foreground hover:text-red-400 px-1',
                              title: 'Remove header',
                            }, '\u2715'),
                          ),
                        ),
                      )
                    : h('p', { className: 'text-xs text-muted-foreground/50' }, 'No custom headers'),
                ),
                h('div', { className: 'space-y-1.5' },
                  h('label', { className: 'text-sm font-medium' }, 'Body'),
                  h('textarea', {
                    value: httpBody,
                    onChange: (e: any) => setHttpBody(e.target.value),
                    placeholder: 'Optional request body...',
                    rows: 3,
                    className: inputClass + ' resize-y font-mono text-xs',
                  }),
                ),
                h('div', { className: 'space-y-1.5' },
                  h('label', { className: 'text-sm font-medium' }, 'Timeout (ms)'),
                  h('input', {
                    type: 'number',
                    value: httpTimeout,
                    onChange: (e: any) => setHttpTimeout(e.target.value),
                    placeholder: '60000',
                    className: inputClass,
                  }),
                ),
              ),
        )
      : h('div', { className: 'space-y-4' },
          h('div', { className: 'space-y-1.5' },
            h('label', { className: 'text-sm font-medium' }, 'Prompt'),
            h('p', { className: 'text-xs text-muted-foreground' }, 'The task the AI agent will perform each time this job runs'),
            h('textarea', {
              value: aiPrompt,
              onChange: (e: any) => setAiPrompt(e.target.value),
              placeholder: 'Collect the top tech news headlines from today and send me a summary email...',
              rows: 4,
              className: inputClass + ' resize-y',
            }),
          ),

          h('div', { className: 'space-y-1.5' },
            h('label', { className: 'text-sm font-medium' }, 'System Prompt'),
            h('p', { className: 'text-xs text-muted-foreground' }, 'Optional instructions to guide AI behavior'),
            h('textarea', {
              value: aiSystemPrompt,
              onChange: (e: any) => setAiSystemPrompt(e.target.value),
              placeholder: 'You are a helpful assistant...',
              rows: 3,
              className: inputClass + ' resize-y',
            }),
          ),

          h('div', { className: 'space-y-1.5' },
            h('label', { className: 'text-sm font-medium' }, 'Model & Profile'),
            h('p', { className: 'text-xs text-muted-foreground' }, 'Override the default model/profile for this job'),
            h(ModelProfileBar, {
              modelOverride: aiModelOverride,
              profileOverride: aiProfileOverride,
              fallbackEnabled: aiFallbackEnabled,
              reasoningEffort: aiReasoningEffort,
              onChange: handleModelProfileChange,
            }),
          ),

          h('div', { className: 'flex items-center gap-6' },
            h('div', { className: 'flex items-center gap-2' },
              h(Toggle, { active: aiEnableTools, onToggle: () => setAiEnableTools(!aiEnableTools) }),
              h('span', { className: 'text-sm' }, 'Enable Tools'),
            ),
            h('div', { className: 'space-y-1.5' },
              h('label', { className: 'text-xs text-muted-foreground' }, 'Max Tokens'),
              h('input', {
                type: 'number',
                value: aiMaxTokens,
                onChange: (e: any) => setAiMaxTokens(e.target.value),
                placeholder: 'Default',
                className: 'w-24 rounded-lg border border-border/50 bg-muted/30 px-2 py-1 text-xs focus:border-primary/50 focus:outline-none',
              }),
            ),
          ),
        ),

    // Save/Cancel
    h('div', { className: 'flex gap-2 pt-2' },
      h('button', {
        type: 'button',
        onClick: handleSave,
        disabled: !isValid,
        className: `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          isValid
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-muted/50 text-muted-foreground/30 cursor-not-allowed'
        }`,
      }, isEdit ? 'Save Changes' : 'Create Job'),
      h('button', {
        type: 'button',
        onClick: onCancel,
        className: 'rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors',
      }, 'Cancel'),
    ),
  );
}
