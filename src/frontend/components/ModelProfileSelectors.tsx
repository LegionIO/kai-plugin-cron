import React, { useState, useEffect, useCallback, useRef } from 'react';

const appApi = () => (globalThis as any).window?.app;

type ModelInfo = { key: string; displayName: string };
type ProfileInfo = { key: string; name: string; primaryModelKey: string };

export function useModelCatalog() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [defaultKey, setDefaultKey] = useState<string | null>(null);
  useEffect(() => {
    appApi()?.modelCatalog?.()
      .then((data: any) => {
        setModels(data?.models ?? []);
        setDefaultKey(data?.defaultKey ?? null);
      })
      .catch(() => {});
  }, []);
  return { models, defaultKey };
}

export function useProfileCatalog() {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [defaultKey, setDefaultKey] = useState<string | null>(null);
  useEffect(() => {
    appApi()?.profileCatalog?.()
      .then((data: any) => {
        setProfiles(data?.profiles ?? []);
        setDefaultKey(data?.defaultKey ?? null);
      })
      .catch(() => {});
  }, []);
  return { profiles, defaultKey };
}

type DropdownProps = {
  label: string;
  icon: string;
  value: string;
  options: Array<{ value: string; label: string; detail?: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  direction?: 'up' | 'down';
};

export function Dropdown({ label, icon, value, options, onChange, disabled, direction = 'down' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const win = globalThis as any;
    const handler = (e: any) => {
      if (!rootRef.current || !(rootRef.current as any).contains(e.target)) setOpen(false);
    };
    win.window?.addEventListener('pointerdown', handler);
    return () => win.window?.removeEventListener('pointerdown', handler);
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          borderRadius: '12px',
          border: '1px solid var(--color-border, rgba(128,128,128,0.25))',
          background: 'var(--color-card, rgba(255,255,255,0.7))',
          padding: '4px 10px',
          fontSize: '11px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          color: 'inherit',
          transition: 'background 0.15s',
        }}
      >
        <span style={{ fontSize: '12px' }}>{icon}</span>
        <span style={{ fontWeight: 500, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label ?? label}</span>
        <span style={{ fontSize: '10px', opacity: 0.5 }}>▾</span>
      </button>

      {open ? (
        <div
          style={{
            position: 'absolute',
            [direction === 'down' ? 'top' : 'bottom']: '100%',
            [direction === 'down' ? 'marginTop' : 'marginBottom']: '6px',
            left: 0,
            zIndex: 50,
            width: '240px',
            borderRadius: '16px',
            border: '1px solid var(--color-border, rgba(128,128,128,0.25))',
            background: 'var(--color-popover, rgba(255,255,255,0.95))',
            padding: '6px',
            boxShadow: '0 16px 40px rgba(5,4,15,0.28)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 500, color: 'var(--color-muted-foreground, #888)' }}>{label}</div>
          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '12px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  border: 'none',
                  background: opt.value === value ? 'var(--color-primary, #3b82f6)' : 'none',
                  color: opt.value === value ? '#fff' : 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left' as const,
                  transition: 'background 0.1s',
                }}
                onMouseOver={(e: any) => { if (opt.value !== value) e.currentTarget.style.background = 'var(--color-muted, #f3f4f6)'; }}
                onMouseOut={(e: any) => { if (opt.value !== value) e.currentTarget.style.background = 'none'; }}
              >
                <span style={{ flex: 1, fontWeight: 500 }}>{opt.label}</span>
                {opt.detail ? <span style={{ fontSize: '10px', opacity: 0.6 }}>{opt.detail}</span> : null}
                {opt.value === value ? <span>✓</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type AutoManualToggleProps = {
  enabled: boolean;
  onToggle: (value: boolean) => void;
};

export function AutoManualToggle({ enabled, onToggle }: AutoManualToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      title={enabled ? 'Auto-routing enabled (click for manual)' : 'Manual routing (click for auto)'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        borderRadius: '12px',
        border: `1px solid ${enabled ? 'var(--color-primary, #3b82f6)' : 'var(--color-border, rgba(128,128,128,0.25))'}`,
        background: enabled ? 'rgba(59,130,246,0.1)' : 'var(--color-card, rgba(255,255,255,0.7))',
        color: enabled ? 'var(--color-primary, #3b82f6)' : 'inherit',
        padding: '4px 10px',
        fontSize: '11px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: '12px' }}>⇄</span>
      <span>{enabled ? 'Auto' : 'Manual'}</span>
    </button>
  );
}

type ModelProfileBarProps = {
  modelOverride?: string;
  profileOverride?: string;
  fallbackEnabled?: boolean;
  reasoningEffort?: string;
  onChange: (updates: Record<string, unknown>) => void;
  direction?: 'up' | 'down';
};

export function ModelProfileBar({ modelOverride, profileOverride, fallbackEnabled, reasoningEffort, onChange, direction = 'down' }: ModelProfileBarProps) {
  const { models } = useModelCatalog();
  const { profiles } = useProfileCatalog();

  const isAuto = fallbackEnabled ?? false;
  const selectedProfileKey = profileOverride ?? '';
  const selectedProfile = profiles.find((p) => p.key === selectedProfileKey);

  const modelOptions = [
    { value: '', label: 'Default' },
    ...models.map((m) => ({ value: m.key, label: m.displayName })),
  ];

  const profileOptions = [
    { value: '', label: 'Default (no profile)' },
    ...profiles.map((p) => ({ value: p.key, label: p.name })),
  ];

  const thinkingOptions = [
    { value: '', label: 'Default' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'Extra High' },
  ];

  const handleProfileChange = (key: string) => {
    const profile = profiles.find((p) => p.key === key);
    onChange({
      profileOverride: key || undefined,
      fallbackEnabled: Boolean(key),
      modelOverride: profile ? profile.primaryModelKey : undefined,
    });
  };

  const handleAutoToggle = (auto: boolean) => {
    if (auto && selectedProfile) {
      onChange({ fallbackEnabled: true, modelOverride: selectedProfile.primaryModelKey });
    } else {
      onChange({ fallbackEnabled: false });
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        alignItems: 'center',
        padding: '8px 0',
      }}
    >
      <Dropdown
        label="Select profile"
        icon="👤"
        value={selectedProfileKey}
        options={profileOptions}
        onChange={handleProfileChange}
        direction={direction}
      />
      <AutoManualToggle
        enabled={isAuto}
        onToggle={handleAutoToggle}
      />
      <Dropdown
        label="Select model"
        icon="⚙"
        value={modelOverride ?? ''}
        options={modelOptions}
        onChange={(v: string) => onChange({ modelOverride: v || undefined })}
        disabled={isAuto}
        direction={direction}
      />
      <Dropdown
        label="Select thinking"
        icon="🧠"
        value={reasoningEffort ?? ''}
        options={thinkingOptions}
        onChange={(v: string) => onChange({ reasoningEffort: v || undefined })}
        direction={direction}
      />
    </div>
  );
}
