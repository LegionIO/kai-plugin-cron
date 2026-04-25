import { RunHistory } from './RunHistory';
import { cronToHuman } from './cronDisplay';

const h = (...args: any[]) => (globalThis as any).React.createElement(...args);

type JobDetailProps = {
  job: any;
  runs: any[];
  nextRun?: string;
  isRunning: boolean;
  onEdit: () => void;
  onRunNow: () => void;
  onStop: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onClearHistory: () => void;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function JobDetail({ job, runs, nextRun, isRunning, onEdit, onRunNow, onStop, onToggle, onDelete, onClearHistory }: JobDetailProps) {
  return h('div', { className: 'p-4 space-y-6' },
    // Summary card
    h('div', { className: 'rounded-xl border border-border/50 p-4 space-y-3' },
      h('div', { className: 'flex items-center justify-between' },
        h('div', { className: 'flex items-center gap-2' },
          h('span', {
            className: 'rounded-full px-2 py-0.5 text-xs font-medium',
            style: {
              backgroundColor: job.type === 'ai' ? 'rgba(147,51,234,0.15)' : 'rgba(59,130,246,0.15)',
              color: job.type === 'ai' ? 'rgb(147,51,234)' : 'rgb(59,130,246)',
            },
          }, job.type === 'ai' ? 'AI Agent' : 'Command'),
          h('span', {
            className: `rounded-full px-2 py-0.5 text-xs font-medium ${
              job.enabled ? 'bg-green-500/15 text-green-500' : 'bg-muted/50 text-muted-foreground/50'
            }`,
          }, job.enabled ? 'Enabled' : 'Disabled'),
          isRunning
            ? h('span', { className: 'rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400' }, 'Running...')
            : null,
        ),
        h('div', { className: 'flex gap-1' },
          h('button', {
            type: 'button',
            onClick: onEdit,
            className: 'rounded-lg px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors',
          }, 'Edit'),
          isRunning
            ? h('button', {
                type: 'button',
                onClick: onStop,
                className: 'rounded-lg px-3 py-1 text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors',
              }, 'Stop')
            : h('button', {
                type: 'button',
                onClick: onRunNow,
                className: 'rounded-lg px-3 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors',
              }, 'Run Now'),
          h('button', {
            type: 'button',
            onClick: onToggle,
            className: 'rounded-lg px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors',
          }, job.enabled ? 'Disable' : 'Enable'),
          h('button', {
            type: 'button',
            onClick: onDelete,
            className: 'rounded-lg px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors',
          }, 'Delete'),
        ),
      ),

      // Details grid
      h('div', { className: 'grid grid-cols-2 gap-x-6 gap-y-2 text-sm' },
        h('span', { className: 'text-muted-foreground' }, 'Schedule:'),
        h('span', null, cronToHuman(job.schedule), h('span', { className: 'text-muted-foreground/60 ml-2' }, `(${job.schedule})`)),

        job.timezone ? [
          h('span', { key: 'tz-label', className: 'text-muted-foreground' }, 'Timezone:'),
          h('span', { key: 'tz-value' }, job.timezone),
        ] : null,

        nextRun ? [
          h('span', { key: 'next-label', className: 'text-muted-foreground' }, 'Next Run:'),
          h('span', { key: 'next-value' }, formatDate(nextRun)),
        ] : null,

        h('span', { className: 'text-muted-foreground' }, 'Created:'),
        h('span', null, formatDate(job.createdAt)),

        h('span', { className: 'text-muted-foreground' }, 'Updated:'),
        h('span', null, formatDate(job.updatedAt)),
      ),

      // Type-specific info
      job.type === 'command' && job.command
        ? h('div', { className: 'rounded-lg bg-muted/30 p-3 text-xs space-y-1' },
            h('div', { className: 'font-medium text-muted-foreground' },
              job.command.type === 'shell' ? 'Shell Command' : 'HTTP Request',
            ),
            job.command.type === 'shell'
              ? h('code', { className: 'block font-mono text-foreground/80 select-all' }, job.command.shell?.command)
              : h('code', { className: 'block font-mono text-foreground/80' },
                  `${job.command.http?.method ?? 'GET'} ${job.command.http?.url}`,
                ),
          )
        : null,

      job.type === 'ai' && job.ai
        ? h('div', { className: 'rounded-lg bg-muted/30 p-3 text-xs space-y-1' },
            h('div', { className: 'font-medium text-muted-foreground' }, 'AI Prompt'),
            h('p', { className: 'text-foreground/80 whitespace-pre-wrap' }, job.ai.prompt),
            job.ai.systemPrompt
              ? h('div', { className: 'mt-2' },
                  h('div', { className: 'font-medium text-muted-foreground' }, 'System Prompt'),
                  h('p', { className: 'text-foreground/60 whitespace-pre-wrap' }, job.ai.systemPrompt),
                )
              : null,
          )
        : null,
    ),

    // Run history
    h('div', { className: 'space-y-2' },
      h('div', { className: 'flex items-center justify-between' },
        h('h3', { className: 'text-sm font-semibold' }, 'Run History'),
        runs.length > 0
          ? h('button', {
              type: 'button',
              onClick: onClearHistory,
              className: 'text-xs text-muted-foreground hover:text-red-400 transition-colors',
            }, 'Clear')
          : null,
      ),
      h(RunHistory, { runs }),
    ),
  );
}
