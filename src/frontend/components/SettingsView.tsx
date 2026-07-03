import React, { useState, useCallback } from 'react';
import type { PluginComponentProps } from '../hooks.ts';
import { ModelProfileBar } from './ModelProfileSelectors';

export function SettingsView({ onAction, pluginConfig, pluginState }: PluginComponentProps) {
  const defaults = ((pluginConfig as any)?.defaults ?? {}) as Record<string, unknown>;
  const state = (pluginState ?? {}) as any;
  const jobCount = (state.jobs ?? []).length;
  const enabledCount = (state.jobs ?? []).filter((j: any) => j.enabled).length;

  const [localDefaults, setLocalDefaults] = useState<Record<string, unknown>>({ ...defaults });

  const updateDefault = useCallback((key: string, value: unknown) => {
    const next = { ...localDefaults, [key]: value };
    setLocalDefaults(next);
    onAction('save-defaults', next);
  }, [localDefaults, onAction]);

  const handleModelProfileChange = useCallback((updates: Record<string, unknown>) => {
    const next = { ...localDefaults, ...updates };
    setLocalDefaults(next);
    onAction('save-defaults', next);
  }, [localDefaults, onAction]);

  const inputClass = 'w-full rounded-xl border border-border/70 bg-card/80 px-2.5 py-1.5 text-xs';

  return (
    <div className="space-y-6">
      {/* Status */}
      <fieldset className="space-y-3 rounded-lg border border-border/50 p-3">
        <legend className="px-1 text-[10px] font-medium text-muted-foreground">Status</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Total Jobs:</span>
          <span>{String(jobCount)}</span>
          <span className="text-muted-foreground">Enabled:</span>
          <span>{String(enabledCount)}</span>
        </div>
      </fieldset>

      {/* Default AI settings */}
      <fieldset className="space-y-3 rounded-lg border border-border/50 p-3">
        <legend className="px-1 text-[10px] font-medium text-muted-foreground">Default AI Settings</legend>
        <p className="text-xs text-muted-foreground">
          These defaults apply to all AI cron jobs unless overridden per-job.
        </p>
        <ModelProfileBar
          modelOverride={localDefaults.modelOverride as string}
          profileOverride={localDefaults.profileOverride as string}
          fallbackEnabled={localDefaults.fallbackEnabled as boolean}
          reasoningEffort={localDefaults.reasoningEffort as string}
          onChange={handleModelProfileChange}
        />
      </fieldset>

      {/* History retention */}
      <fieldset className="space-y-3 rounded-lg border border-border/50 p-3">
        <legend className="px-1 text-[10px] font-medium text-muted-foreground">History</legend>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Max Records Per Job</label>
          <p className="text-xs text-muted-foreground">Number of run records to keep per job before pruning old ones</p>
          <input
            type="number"
            value={(localDefaults.maxHistoryRetention as number | undefined) ?? 100}
            onChange={(e: any) => updateDefault('maxHistoryRetention', parseInt(e.target.value, 10) || 100)}
            className={inputClass}
            style={{ maxWidth: '120px' }}
          />
        </div>
      </fieldset>

      {/* Security */}
      <fieldset className="space-y-3 rounded-lg border border-border/50 p-3">
        <legend className="px-1 text-[10px] font-medium text-muted-foreground">Security</legend>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(localDefaults.requireAgentApproval)}
            onChange={(e: any) => updateDefault('requireAgentApproval', e.target.checked)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <div className="text-sm font-medium">Require approval for AI-created jobs</div>
            <p className="text-xs text-muted-foreground">
              Jobs created or modified by the AI agent are saved disabled and must be approved in the Cron panel before
              they will run. Recommended if the assistant processes untrusted content (web pages, emails, documents).
            </p>
          </div>
        </label>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(localDefaults.blockPrivateHttpTargets)}
            onChange={(e: any) => updateDefault('blockPrivateHttpTargets', e.target.checked)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <div className="text-sm font-medium">Block HTTP requests to private addresses</div>
            <p className="text-xs text-muted-foreground">
              HTTP cron jobs will refuse to connect to loopback, link-local, or private-network (RFC1918) addresses.
              Disable if you need scheduled requests to localhost or LAN services.
            </p>
          </div>
        </label>
      </fieldset>

      {/* Default timeouts */}
      <fieldset className="space-y-3 rounded-lg border border-border/50 p-3">
        <legend className="px-1 text-[10px] font-medium text-muted-foreground">Defaults</legend>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Command Timeout (ms)</label>
          <p className="text-xs text-muted-foreground">Default timeout for shell commands and HTTP requests</p>
          <input
            type="number"
            value={(localDefaults.commandTimeoutMs as number | undefined) ?? 60000}
            onChange={(e: any) => updateDefault('commandTimeoutMs', parseInt(e.target.value, 10) || 60000)}
            className={inputClass}
            style={{ maxWidth: '120px' }}
          />
        </div>
      </fieldset>
    </div>
  );
}
