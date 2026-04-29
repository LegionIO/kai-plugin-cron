import React from 'react';
import { RunHistory } from './RunHistory';
import { cronToHuman } from './cronDisplay';

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
  return (
    <div className="p-4 space-y-6">
      {/* Summary card */}
      <div className="rounded-xl border border-border/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: job.type === 'ai' ? 'rgba(147,51,234,0.15)' : 'rgba(59,130,246,0.15)',
                color: job.type === 'ai' ? 'rgb(147,51,234)' : 'rgb(59,130,246)',
              }}
            >
              {job.type === 'ai' ? 'AI Agent' : 'Command'}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                job.enabled ? 'bg-green-500/15 text-green-500' : 'bg-muted/50 text-muted-foreground/50'
              }`}
            >
              {job.enabled ? 'Enabled' : 'Disabled'}
            </span>
            {isRunning ? (
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">Running...</span>
            ) : null}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              Edit
            </button>
            {isRunning ? (
              <button
                type="button"
                onClick={onStop}
                className="rounded-lg px-3 py-1 text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={onRunNow}
                className="rounded-lg px-3 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                Run Now
              </button>
            )}
            <button
              type="button"
              onClick={onToggle}
              className="rounded-lg px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              {job.enabled ? 'Disable' : 'Enable'}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <span className="text-muted-foreground">Schedule:</span>
          <span>{cronToHuman(job.schedule)}<span className="text-muted-foreground/60 ml-2">({job.schedule})</span></span>

          {job.timezone ? [
            <span key="tz-label" className="text-muted-foreground">Timezone:</span>,
            <span key="tz-value">{job.timezone}</span>,
          ] : null}

          {nextRun ? [
            <span key="next-label" className="text-muted-foreground">Next Run:</span>,
            <span key="next-value">{formatDate(nextRun)}</span>,
          ] : null}

          <span className="text-muted-foreground">Created:</span>
          <span>{formatDate(job.createdAt)}</span>

          <span className="text-muted-foreground">Updated:</span>
          <span>{formatDate(job.updatedAt)}</span>
        </div>

        {/* Type-specific info */}
        {job.type === 'command' && job.command ? (
          <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-medium text-muted-foreground">
              {job.command.type === 'shell' ? 'Shell Command' : 'HTTP Request'}
            </div>
            {job.command.type === 'shell' ? (
              <code className="block font-mono text-foreground/80 select-all">{job.command.shell?.command}</code>
            ) : (
              <code className="block font-mono text-foreground/80">
                {`${job.command.http?.method ?? 'GET'} ${job.command.http?.url}`}
              </code>
            )}
          </div>
        ) : null}

        {job.type === 'ai' && job.ai ? (
          <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-medium text-muted-foreground">AI Prompt</div>
            <p className="text-foreground/80 whitespace-pre-wrap">{job.ai.prompt}</p>
            {job.ai.systemPrompt ? (
              <div className="mt-2">
                <div className="font-medium text-muted-foreground">System Prompt</div>
                <p className="text-foreground/60 whitespace-pre-wrap">{job.ai.systemPrompt}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Run history */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Run History</h3>
          {runs.length > 0 ? (
            <button
              type="button"
              onClick={onClearHistory}
              className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          ) : null}
        </div>
        <RunHistory runs={runs} />
      </div>
    </div>
  );
}
