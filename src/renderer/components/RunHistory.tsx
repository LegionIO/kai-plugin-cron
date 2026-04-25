import { useState } from '../hooks';

const h = (...args: any[]) => (globalThis as any).React.createElement(...args);

type RunHistoryProps = {
  runs: any[];
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; color: string }> = {
    completed: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
    failed: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
    skipped: { bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
    running: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  };
  const s = styles[status] ?? { bg: 'rgba(107,114,128,0.15)', color: '#6b7280' };
  return h('span', {
    style: {
      display: 'inline-block',
      borderRadius: '9999px',
      padding: '2px 8px',
      fontSize: '10px',
      fontWeight: 600,
      backgroundColor: s.bg,
      color: s.color,
    },
  }, status);
}

export function RunHistory({ runs }: RunHistoryProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (runs.length === 0) {
    return h('div', { className: 'text-xs text-muted-foreground/60 py-4 text-center' },
      'No runs yet',
    );
  }

  return h('div', { className: 'rounded-xl border border-border/50 overflow-hidden' },
    h('table', { className: 'w-full text-xs' },
      h('thead', null,
        h('tr', { className: 'border-b border-border/50 bg-muted/20' },
          h('th', { className: 'px-3 py-2 text-left font-medium text-muted-foreground' }, 'Time'),
          h('th', { className: 'px-3 py-2 text-left font-medium text-muted-foreground' }, 'Status'),
          h('th', { className: 'px-3 py-2 text-left font-medium text-muted-foreground' }, 'Duration'),
          h('th', { className: 'px-3 py-2 text-left font-medium text-muted-foreground' }, 'Trigger'),
          h('th', { className: 'px-3 py-2 w-8' }),
        ),
      ),
      h('tbody', null,
        runs.map((run: any) => {
          const isExpanded = expanded === run.id;
          const hasDetail = run.commandResult || run.aiResult || run.error || run.skippedReason;

          return [
            h('tr', {
              key: run.id,
              className: `border-b border-border/30 ${hasDetail ? 'cursor-pointer hover:bg-muted/20' : ''}`,
              onClick: () => hasDetail && setExpanded(isExpanded ? null : run.id),
            },
              h('td', { className: 'px-3 py-2' }, formatDateTime(run.startedAt)),
              h('td', { className: 'px-3 py-2' }, statusBadge(run.status)),
              h('td', { className: 'px-3 py-2 font-mono' }, formatDuration(run.durationMs)),
              h('td', { className: 'px-3 py-2' },
                h('span', { className: 'text-muted-foreground' }, run.triggeredBy),
              ),
              h('td', { className: 'px-3 py-2 text-center' },
                hasDetail
                  ? h('span', { style: { fontSize: '10px', opacity: 0.5 } }, isExpanded ? '\u25B2' : '\u25BC')
                  : null,
              ),
            ),

            // Expanded detail row
            isExpanded && hasDetail
              ? h('tr', { key: `${run.id}-detail` },
                  h('td', { colSpan: 5, className: 'px-3 py-3 bg-muted/10' },
                    h(RunDetail, { run }),
                  ),
                )
              : null,
          ];
        }),
      ),
    ),
  );
}

function RunDetail({ run }: { run: any }) {
  if (run.skippedReason) {
    return h('div', { className: 'text-xs text-yellow-500' },
      h('span', { className: 'font-medium' }, 'Skipped: '),
      run.skippedReason,
    );
  }

  if (run.error) {
    return h('div', { className: 'space-y-2' },
      h('div', { className: 'text-xs text-red-400' },
        h('span', { className: 'font-medium' }, 'Error: '),
        run.error,
      ),
      run.commandResult ? h(CommandResultDetail, { result: run.commandResult }) : null,
    );
  }

  if (run.commandResult) {
    return h(CommandResultDetail, { result: run.commandResult });
  }

  if (run.aiResult) {
    return h(AIResultDetail, { result: run.aiResult });
  }

  return null;
}

function CommandResultDetail({ result }: { result: any }) {
  return h('div', { className: 'space-y-2' },
    result.type === 'shell'
      ? h('div', { className: 'space-y-1' },
          result.exitCode != null
            ? h('div', { className: 'text-xs' },
                h('span', { className: 'font-medium text-muted-foreground' }, 'Exit Code: '),
                h('span', { className: result.exitCode === 0 ? 'text-green-500' : 'text-red-400' }, String(result.exitCode)),
              )
            : null,
          result.stdout
            ? h('div', null,
                h('div', { className: 'text-xs font-medium text-muted-foreground mb-1' }, 'stdout'),
                h('pre', {
                  className: 'rounded-lg bg-background/50 p-2 text-xs font-mono max-h-40 overflow-auto',
                  style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
                }, result.stdout),
              )
            : null,
          result.stderr
            ? h('div', null,
                h('div', { className: 'text-xs font-medium text-red-400/80 mb-1' }, 'stderr'),
                h('pre', {
                  className: 'rounded-lg bg-red-500/5 p-2 text-xs font-mono text-red-400/80 max-h-40 overflow-auto',
                  style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
                }, result.stderr),
              )
            : null,
        )
      : h('div', { className: 'space-y-1' },
          h('div', { className: 'text-xs' },
            h('span', { className: 'font-medium text-muted-foreground' }, 'HTTP Status: '),
            h('span', { className: result.httpStatus < 400 ? 'text-green-500' : 'text-red-400' }, String(result.httpStatus)),
          ),
          result.httpBody
            ? h('pre', {
                className: 'rounded-lg bg-background/50 p-2 text-xs font-mono max-h-40 overflow-auto',
                style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
              }, result.httpBody.slice(0, 2000))
            : null,
        ),
  );
}

function AIResultDetail({ result }: { result: any }) {
  const [showMessages, setShowMessages] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(false);

  return h('div', { className: 'space-y-3' },
    // Model info
    h('div', { className: 'text-xs' },
      h('span', { className: 'font-medium text-muted-foreground' }, 'Model: '),
      h('span', null, result.modelKey),
    ),

    // AI response text
    h('div', null,
      h('div', { className: 'text-xs font-medium text-muted-foreground mb-1' }, 'Response'),
      h('div', {
        className: 'rounded-lg bg-background/50 p-3 text-xs max-h-60 overflow-auto',
        style: { whiteSpace: 'pre-wrap' },
      }, result.text),
    ),

    // Tool calls
    result.toolCalls?.length > 0
      ? h('div', null,
          h('button', {
            type: 'button',
            onClick: () => setShowToolCalls(!showToolCalls),
            className: 'text-xs font-medium text-primary hover:text-primary/80',
          }, `${showToolCalls ? 'Hide' : 'Show'} ${result.toolCalls.length} Tool Call${result.toolCalls.length > 1 ? 's' : ''}`),
          showToolCalls
            ? h('div', { className: 'mt-2 space-y-2' },
                result.toolCalls.map((tc: any, idx: number) =>
                  h('div', {
                    key: idx,
                    className: 'rounded-lg border border-border/30 p-2 text-xs',
                  },
                    h('div', { className: 'flex items-center justify-between mb-1' },
                      h('span', { className: 'font-medium font-mono' }, tc.toolName),
                      h('div', { className: 'flex items-center gap-2' },
                        tc.durationMs
                          ? h('span', { className: 'text-muted-foreground' }, `${tc.durationMs}ms`)
                          : null,
                        tc.error
                          ? h('span', { className: 'text-red-400' }, 'Error')
                          : h('span', { className: 'text-green-500' }, 'OK'),
                      ),
                    ),
                    h('div', { className: 'space-y-1' },
                      h('div', null,
                        h('span', { className: 'text-muted-foreground' }, 'Args: '),
                        h('pre', {
                          className: 'inline font-mono',
                          style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
                        }, JSON.stringify(tc.args, null, 2)),
                      ),
                      tc.result != null
                        ? h('div', null,
                            h('span', { className: 'text-muted-foreground' }, 'Result: '),
                            h('pre', {
                              className: 'inline font-mono max-h-20 overflow-auto',
                              style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
                            }, typeof tc.result === 'string' ? tc.result.slice(0, 500) : JSON.stringify(tc.result, null, 2).slice(0, 500)),
                          )
                        : null,
                      tc.error
                        ? h('div', { className: 'text-red-400' },
                            h('span', { className: 'text-muted-foreground' }, 'Error: '),
                            tc.error,
                          )
                        : null,
                    ),
                  ),
                ),
              )
            : null,
        )
      : null,

    // Messages
    result.messages?.length > 0
      ? h('div', null,
          h('button', {
            type: 'button',
            onClick: () => setShowMessages(!showMessages),
            className: 'text-xs font-medium text-primary hover:text-primary/80',
          }, `${showMessages ? 'Hide' : 'Show'} Full Message Log (${result.messages.length})`),
          showMessages
            ? h('div', { className: 'mt-2 space-y-1' },
                result.messages.map((msg: any, idx: number) =>
                  h('div', {
                    key: idx,
                    className: 'rounded-lg bg-background/30 p-2 text-xs',
                  },
                    h('span', {
                      className: 'font-medium',
                      style: {
                        color: msg.role === 'user' ? '#3b82f6' : msg.role === 'system' ? '#eab308' : '#22c55e',
                      },
                    }, msg.role),
                    h('span', { className: 'text-muted-foreground' }, ': '),
                    h('span', { style: { whiteSpace: 'pre-wrap' } }, msg.content?.slice(0, 1000)),
                  ),
                ),
              )
            : null,
        )
      : null,
  );
}
