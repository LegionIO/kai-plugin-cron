import { useState, useCallback } from '../hooks';
import { ModelProfileBar } from './ModelProfileSelectors';

const h = (...args: any[]) => (globalThis as any).React.createElement(...args);

type PluginComponentProps = {
  pluginName: string;
  props?: Record<string, unknown>;
  onAction: (action: string, data?: unknown) => void;
  onClose?: () => void;
  config?: Record<string, unknown>;
  updateConfig?: (path: string, value: unknown) => Promise<void>;
  pluginConfig?: Record<string, unknown>;
  pluginState?: Record<string, unknown>;
  setPluginConfig?: (path: string, value: unknown) => Promise<void>;
};

function SettingsSection({ title, children }: { title: string; children: any }) {
  return h('div', { className: 'space-y-4' },
    h('h3', { className: 'text-sm font-semibold border-b border-border/50 pb-2' }, title),
    children,
  );
}

function SettingsField({ label, description, children }: { label: string; description?: string; children: any }) {
  return h('div', { className: 'space-y-1.5' },
    h('label', { className: 'text-sm font-medium' }, label),
    description ? h('p', { className: 'text-xs text-muted-foreground' }, description) : null,
    children,
  );
}

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

  const inputClass = 'w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none';

  return h('div', { className: 'space-y-8' },
    // Status
    h(SettingsSection, { title: 'Status' },
      h('div', { className: 'grid grid-cols-2 gap-x-4 gap-y-1 text-sm' },
        h('span', { className: 'text-muted-foreground' }, 'Total Jobs:'),
        h('span', null, String(jobCount)),
        h('span', { className: 'text-muted-foreground' }, 'Enabled:'),
        h('span', null, String(enabledCount)),
      ),
    ),

    // Default AI settings
    h(SettingsSection, { title: 'Default AI Settings' },
      h('p', { className: 'text-xs text-muted-foreground' },
        'These defaults apply to all AI cron jobs unless overridden per-job.',
      ),
      h(ModelProfileBar, {
        modelOverride: localDefaults.modelOverride as string,
        profileOverride: localDefaults.profileOverride as string,
        fallbackEnabled: localDefaults.fallbackEnabled as boolean,
        reasoningEffort: localDefaults.reasoningEffort as string,
        onChange: handleModelProfileChange,
      }),
    ),

    // History retention
    h(SettingsSection, { title: 'History' },
      h(SettingsField, {
        label: 'Max Records Per Job',
        description: 'Number of run records to keep per job before pruning old ones',
      },
        h('input', {
          type: 'number',
          value: localDefaults.maxHistoryRetention ?? 100,
          onChange: (e: any) => updateDefault('maxHistoryRetention', parseInt(e.target.value, 10) || 100),
          className: inputClass,
          style: { maxWidth: '120px' },
        }),
      ),
    ),

    // Default timeouts
    h(SettingsSection, { title: 'Defaults' },
      h(SettingsField, {
        label: 'Command Timeout (ms)',
        description: 'Default timeout for shell commands and HTTP requests',
      },
        h('input', {
          type: 'number',
          value: localDefaults.commandTimeoutMs ?? 60000,
          onChange: (e: any) => updateDefault('commandTimeoutMs', parseInt(e.target.value, 10) || 60000),
          className: inputClass,
          style: { maxWidth: '120px' },
        }),
      ),
    ),
  );
}
