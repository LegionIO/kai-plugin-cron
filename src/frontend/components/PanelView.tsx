import React, { useState, useCallback } from 'react';
import type { PluginComponentProps } from '../hooks.ts';
import { JobList } from './JobList';
import { JobForm } from './JobForm';
import { JobDetail } from './JobDetail';

type View = { type: 'list' } | { type: 'create' } | { type: 'edit'; jobId: string } | { type: 'detail'; jobId: string };

export function PanelView({ onAction, pluginState }: PluginComponentProps) {
  const state = (pluginState ?? {}) as any;
  const jobs = (state.jobs ?? []) as any[];
  const recentRuns = (state.recentRuns ?? []) as any[];
  const nextRuns = (state.nextRuns ?? {}) as Record<string, string>;
  const runningJobs = (state.runningJobs ?? []) as string[];
  const defaults = (state.defaults ?? {}) as any;

  const [view, setView] = useState<View>({ type: 'list' });

  const handleSelectJob = useCallback((jobId: string) => {
    setView({ type: 'detail', jobId });
  }, []);

  const handleCreate = useCallback(() => {
    setView({ type: 'create' });
  }, []);

  const handleEdit = useCallback((jobId: string) => {
    setView({ type: 'edit', jobId });
  }, []);

  const handleBack = useCallback(() => {
    setView({ type: 'list' });
  }, []);

  const handleSaveJob = useCallback((data: Record<string, unknown>) => {
    if (view.type === 'create') {
      onAction('create-job', data);
    } else if (view.type === 'edit') {
      onAction('update-job', { id: (view as any).jobId, ...data });
    }
    setView({ type: 'list' });
  }, [view, onAction]);

  const selectedJob = view.type === 'detail' || view.type === 'edit'
    ? jobs.find((j: any) => j.id === (view as any).jobId)
    : null;

  const jobRuns = selectedJob
    ? recentRuns.filter((r: any) => r.jobId === selectedJob.id)
    : [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          {view.type !== 'list' ? (
            <button
              type="button"
              onClick={handleBack}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <span style={{ fontSize: '16px' }}>←</span>
            </button>
          ) : null}
          <h2 className="text-sm font-semibold">
            {view.type === 'list' ? 'Cron Jobs'
              : view.type === 'create' ? 'New Cron Job'
              : view.type === 'edit' ? 'Edit Cron Job'
              : selectedJob?.name ?? 'Job Detail'}
          </h2>
        </div>
        {view.type === 'list' ? (
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + New Job
          </button>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view.type === 'list' ? (
          <JobList
            jobs={jobs}
            nextRuns={nextRuns}
            runningJobs={runningJobs}
            recentRuns={recentRuns}
            onSelect={handleSelectJob}
            onToggle={(id: string) => onAction('toggle-job', { id })}
            onRunNow={(id: string) => onAction('run-now', { id })}
            onStop={(id: string) => onAction('stop-job', { id })}
            onDelete={(id: string) => onAction('delete-job', { id })}
            onEdit={handleEdit}
          />
        ) : view.type === 'create' || view.type === 'edit' ? (
          <JobForm
            job={view.type === 'edit' ? selectedJob : null}
            defaults={defaults}
            onSave={handleSaveJob}
            onCancel={handleBack}
          />
        ) : view.type === 'detail' && selectedJob ? (
          <JobDetail
            job={selectedJob}
            runs={jobRuns}
            nextRun={nextRuns[selectedJob.id]}
            isRunning={runningJobs.includes(selectedJob.id)}
            onEdit={() => handleEdit(selectedJob.id)}
            onRunNow={() => onAction('run-now', { id: selectedJob.id })}
            onStop={() => onAction('stop-job', { id: selectedJob.id })}
            onToggle={() => onAction('toggle-job', { id: selectedJob.id })}
            onDelete={() => { onAction('delete-job', { id: selectedJob.id }); handleBack(); }}
            onClearHistory={() => onAction('clear-history', { jobId: selectedJob.id })}
          />
        ) : null}
      </div>
    </div>
  );
}
