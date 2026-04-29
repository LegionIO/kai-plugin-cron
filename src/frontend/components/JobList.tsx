import React, { useState } from 'react';
import { cronToHuman } from './cronDisplay';

type JobListProps = {
  jobs: any[];
  nextRuns: Record<string, string>;
  runningJobs: string[];
  recentRuns: any[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onRunNow: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
};

function getLastStatus(recentRuns: any[], jobId: string): string | null {
  const runs = recentRuns.filter((r: any) => r.jobId === jobId && r.status !== 'running');
  if (runs.length === 0) return null;
  return runs[0].status;
}

function statusDot(status: string | null) {
  const colors: Record<string, string> = {
    completed: '#22c55e',
    failed: '#ef4444',
    skipped: '#eab308',
    running: '#3b82f6',
  };
  const color = status ? colors[status] ?? '#6b7280' : '#6b7280';
  return (
    <span
      title={status ?? 'No runs yet'}
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

function relativeTime(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  if (absDiff < 60_000) return diff > 0 ? 'in < 1m' : '< 1m ago';
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000);
    return diff > 0 ? `in ${mins}m` : `${mins}m ago`;
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.round(absDiff / 3_600_000);
    return diff > 0 ? `in ${hrs}h` : `${hrs}h ago`;
  }
  const days = Math.round(absDiff / 86_400_000);
  return diff > 0 ? `in ${days}d` : `${days}d ago`;
}

export function JobList({ jobs, nextRuns, runningJobs, recentRuns, onSelect, onToggle, onRunNow, onStop, onDelete, onEdit }: JobListProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div style={{ fontSize: '48px', opacity: 0.3, marginBottom: '12px' }}>⏰</div>
        <p className="text-sm">No cron jobs configured yet</p>
        <p className="text-xs mt-1 opacity-60">Click "+ New Job" to create one</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {jobs.map((job: any) => {
        const isRunning = runningJobs.includes(job.id);
        const lastStatus = isRunning ? 'running' : getLastStatus(recentRuns, job.id);
        const nextRun = nextRuns[job.id];

        return (
          <div
            key={job.id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() => onSelect(job.id)}
          >
            {/* Status dot */}
            {statusDot(lastStatus)}

            {/* Job info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{job.name}</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: job.type === 'ai' ? 'rgba(147,51,234,0.15)' : 'rgba(59,130,246,0.15)',
                    color: job.type === 'ai' ? 'rgb(147,51,234)' : 'rgb(59,130,246)',
                  }}
                >
                  {job.type === 'ai' ? 'AI' : 'CMD'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {cronToHuman(job.schedule)}
                {nextRun && job.enabled ? (
                  <span className="ml-2 opacity-60">{`• ${relativeTime(nextRun)}`}</span>
                ) : null}
              </div>
            </div>

            {/* Actions (stop propagation to prevent selecting the job) */}
            <div
              className="flex items-center gap-1"
              onClick={(e: any) => e.stopPropagation()}
            >
              {/* Enable/disable toggle */}
              <button
                type="button"
                onClick={() => onToggle(job.id)}
                title={job.enabled ? 'Disable' : 'Enable'}
                className={`rounded-lg px-2 py-1 text-xs transition-colors ${
                  job.enabled
                    ? 'text-green-500 hover:bg-green-500/10'
                    : 'text-muted-foreground/50 hover:bg-muted/50'
                }`}
              >
                {job.enabled ? 'ON' : 'OFF'}
              </button>

              {/* Run Now / Stop */}
              {isRunning ? (
                <button
                  type="button"
                  onClick={() => onStop(job.id)}
                  title="Stop running job"
                  className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  ■
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onRunNow(job.id)}
                  title="Run now"
                  className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  ▶
                </button>
              )}

              {/* Edit */}
              <button
                type="button"
                onClick={() => onEdit(job.id)}
                title="Edit"
                className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                ✎
              </button>

              {/* Delete */}
              {confirmDelete === job.id ? (
                <button
                  type="button"
                  onClick={() => { onDelete(job.id); setConfirmDelete(null); }}
                  className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 font-medium"
                >
                  Confirm?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(job.id)}
                  title="Delete"
                  className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
