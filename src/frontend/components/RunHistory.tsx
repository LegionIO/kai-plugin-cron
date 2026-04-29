import React, { useState } from 'react';

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
  return (
    <span
      style={{
        display: 'inline-block',
        borderRadius: '9999px',
        padding: '2px 8px',
        fontSize: '10px',
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
      }}
    >
      {status}
    </span>
  );
}

export function RunHistory({ runs }: RunHistoryProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (runs.length === 0) {
    return (
      <div className="text-xs text-muted-foreground/60 py-4 text-center">
        No runs yet
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 bg-muted/20">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Duration</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Trigger</th>
            <th className="px-3 py-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run: any) => {
            const isExpanded = expanded === run.id;
            const hasDetail = run.commandResult || run.aiResult || run.error || run.skippedReason;

            return [
              <tr
                key={run.id}
                className={`border-b border-border/30 ${hasDetail ? 'cursor-pointer hover:bg-muted/20' : ''}`}
                onClick={() => hasDetail && setExpanded(isExpanded ? null : run.id)}
              >
                <td className="px-3 py-2">{formatDateTime(run.startedAt)}</td>
                <td className="px-3 py-2">{statusBadge(run.status)}</td>
                <td className="px-3 py-2 font-mono">{formatDuration(run.durationMs)}</td>
                <td className="px-3 py-2">
                  <span className="text-muted-foreground">{run.triggeredBy}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  {hasDetail ? (
                    <span style={{ fontSize: '10px', opacity: 0.5 }}>{isExpanded ? '▲' : '▼'}</span>
                  ) : null}
                </td>
              </tr>,

              isExpanded && hasDetail ? (
                <tr key={`${run.id}-detail`}>
                  <td colSpan={5} className="px-3 py-3 bg-muted/10">
                    <RunDetail run={run} />
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunDetail({ run }: { run: any }) {
  if (run.skippedReason) {
    return (
      <div className="text-xs text-yellow-500">
        <span className="font-medium">Skipped: </span>
        {run.skippedReason}
      </div>
    );
  }

  if (run.error) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-red-400">
          <span className="font-medium">Error: </span>
          {run.error}
        </div>
        {run.commandResult ? <CommandResultDetail result={run.commandResult} /> : null}
      </div>
    );
  }

  if (run.commandResult) {
    return <CommandResultDetail result={run.commandResult} />;
  }

  if (run.aiResult) {
    return <AIResultDetail result={run.aiResult} />;
  }

  return null;
}

function CommandResultDetail({ result }: { result: any }) {
  return (
    <div className="space-y-2">
      {result.type === 'shell' ? (
        <div className="space-y-1">
          {result.exitCode != null ? (
            <div className="text-xs">
              <span className="font-medium text-muted-foreground">Exit Code: </span>
              <span className={result.exitCode === 0 ? 'text-green-500' : 'text-red-400'}>{String(result.exitCode)}</span>
            </div>
          ) : null}
          {result.stdout ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">stdout</div>
              <pre
                className="rounded-lg bg-background/50 p-2 text-xs font-mono max-h-40 overflow-auto"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {result.stdout}
              </pre>
            </div>
          ) : null}
          {result.stderr ? (
            <div>
              <div className="text-xs font-medium text-red-400/80 mb-1">stderr</div>
              <pre
                className="rounded-lg bg-red-500/5 p-2 text-xs font-mono text-red-400/80 max-h-40 overflow-auto"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {result.stderr}
              </pre>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-xs">
            <span className="font-medium text-muted-foreground">HTTP Status: </span>
            <span className={result.httpStatus < 400 ? 'text-green-500' : 'text-red-400'}>{String(result.httpStatus)}</span>
          </div>
          {result.httpBody ? (
            <pre
              className="rounded-lg bg-background/50 p-2 text-xs font-mono max-h-40 overflow-auto"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
            >
              {result.httpBody.slice(0, 2000)}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  );
}

function AIResultDetail({ result }: { result: any }) {
  const [showMessages, setShowMessages] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(false);

  return (
    <div className="space-y-3">
      {/* Model info */}
      <div className="text-xs">
        <span className="font-medium text-muted-foreground">Model: </span>
        <span>{result.modelKey}</span>
      </div>

      {/* AI response text */}
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Response</div>
        <div
          className="rounded-lg bg-background/50 p-3 text-xs max-h-60 overflow-auto"
          style={{ whiteSpace: 'pre-wrap' }}
        >
          {result.text}
        </div>
      </div>

      {/* Tool calls */}
      {result.toolCalls?.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowToolCalls(!showToolCalls)}
            className="text-xs font-medium text-primary hover:text-primary/80"
          >
            {showToolCalls ? 'Hide' : 'Show'} {result.toolCalls.length} Tool Call{result.toolCalls.length > 1 ? 's' : ''}
          </button>
          {showToolCalls ? (
            <div className="mt-2 space-y-2">
              {result.toolCalls.map((tc: any, idx: number) => (
                <div key={idx} className="rounded-lg border border-border/30 p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium font-mono">{tc.toolName}</span>
                    <div className="flex items-center gap-2">
                      {tc.durationMs ? (
                        <span className="text-muted-foreground">{tc.durationMs}ms</span>
                      ) : null}
                      {tc.error ? (
                        <span className="text-red-400">Error</span>
                      ) : (
                        <span className="text-green-500">OK</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div>
                      <span className="text-muted-foreground">Args: </span>
                      <pre
                        className="inline font-mono"
                        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                      >
                        {JSON.stringify(tc.args, null, 2)}
                      </pre>
                    </div>
                    {tc.result != null ? (
                      <div>
                        <span className="text-muted-foreground">Result: </span>
                        <pre
                          className="inline font-mono max-h-20 overflow-auto"
                          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                        >
                          {typeof tc.result === 'string' ? tc.result.slice(0, 500) : JSON.stringify(tc.result, null, 2).slice(0, 500)}
                        </pre>
                      </div>
                    ) : null}
                    {tc.error ? (
                      <div className="text-red-400">
                        <span className="text-muted-foreground">Error: </span>
                        {tc.error}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Messages */}
      {result.messages?.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowMessages(!showMessages)}
            className="text-xs font-medium text-primary hover:text-primary/80"
          >
            {showMessages ? 'Hide' : 'Show'} Full Message Log ({result.messages.length})
          </button>
          {showMessages ? (
            <div className="mt-2 space-y-1">
              {result.messages.map((msg: any, idx: number) => (
                <div key={idx} className="rounded-lg bg-background/30 p-2 text-xs">
                  <span
                    className="font-medium"
                    style={{
                      color: msg.role === 'user' ? '#3b82f6' : msg.role === 'system' ? '#eab308' : '#22c55e',
                    }}
                  >
                    {msg.role}
                  </span>
                  <span className="text-muted-foreground">: </span>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content?.slice(0, 1000)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
