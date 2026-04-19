import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Check, Loader2, Lock, RotateCw } from 'lucide-react';
import { api, HarvesterClientError } from '../api/client';
import type { Settings as SettingsT } from '@shared/types';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { TOAST_CATEGORIES, toast, useToastStore } from '../store/toast';
import { useAuthStore } from '../store/auth';

export default function SettingsPage(): JSX.Element {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsT>('/api/settings') });
  const qc = useQueryClient();
  const [interval, setInterval] = useState<number | null>(null);
  const [seedHours, setSeedHours] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  if (q.isLoading || !q.data) return <div className="p-6 text-text-muted">Loading…</div>;
  const s = q.data;

  async function save(patch: Record<string, unknown>): Promise<void> {
    setSaving(true);
    try {
      await api.put('/api/settings', patch);
      await qc.invalidateQueries({ queryKey: ['settings'] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <Section title="M-Team">
        <Row label="API key" value={s.mteam.api_key_masked || '(not set)'} />
        <Row label="Auth OK" value={s.mteam.api_key_set ? 'yes' : 'no'} />
      </Section>

      <Section title="qBittorrent">
        <Row label="Host" value={`${s.qbt.host}:${s.qbt.port}`} />
        <Row label="User" value={s.qbt.user || '(not set)'} />
        <Row label="Password set" value={s.qbt.password_set ? 'yes' : 'no'} />
        <Row label="Allowed client" value={s.qbt.allowed_client_ok ? 'yes' : 'no'} />
      </Section>

      <Section title="Poller">
        <label className="block">
          <span className="block text-xs text-text-muted mb-1">Interval (seconds, min 60)</span>
          <input
            type="number"
            min={60}
            max={3600}
            defaultValue={s.poller.interval_sec}
            onChange={(e) => setInterval(Number(e.target.value))}
            className="px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded text-sm font-mono w-32"
          />
        </label>
        <button
          onClick={() => {
            if (interval) void save({ poller: { interval_sec: interval } });
          }}
          disabled={saving || interval == null}
          className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-accent rounded text-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save
        </button>
      </Section>

      <LanSection settings={s} />

      <NotificationsSection />

      <Section title="Lifecycle">
        <Row label="Default save path" value={s.downloads.default_save_path} />
        <label className="block mt-3">
          <span className="block text-xs text-text-muted mb-1">Seed time hours (0.1 – 720)</span>
          <input
            type="number"
            min={0.1}
            max={720}
            step={0.1}
            defaultValue={s.lifecycle.seed_time_hours}
            onChange={(e) => setSeedHours(Number(e.target.value))}
            className="px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded text-sm font-mono w-32"
          />
        </label>
        <button
          onClick={() => {
            if (seedHours != null) void save({ lifecycle: { seed_time_hours: seedHours } });
          }}
          disabled={saving || seedHours == null}
          className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-accent rounded text-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save
        </button>
      </Section>
    </div>
  );
}

function NotificationsSection(): JSX.Element {
  const muted = useToastStore((s) => s.mutedCategories);
  const mute = useToastStore((s) => s.muteCategory);
  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-text-muted" />
        <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
          Notifications
        </h2>
      </div>
      <div className="text-sm text-text-muted">
        Toast notifications you don't want to see. Muting is per-browser and persisted in
        localStorage.
      </div>
      <div className="divide-y divide-zinc-800 border border-zinc-800 rounded">
        {TOAST_CATEGORIES.map((c) => {
          const isMuted = muted.has(c.key);
          return (
            <div key={c.key} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-xs text-text-muted">{c.description}</div>
              </div>
              <button
                onClick={() => mute(c.key, !isMuted)}
                aria-label={isMuted ? `Unmute ${c.label}` : `Mute ${c.label}`}
                className={
                  isMuted
                    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-zinc-800 bg-bg-base text-text-muted cursor-pointer hover:text-text-primary'
                    : 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-accent-success/30 bg-accent-success/10 text-accent-success cursor-pointer hover:bg-accent-success/20'
                }
              >
                {isMuted ? (
                  <>
                    <BellOff className="h-3 w-3" /> Muted
                  </>
                ) : (
                  <>
                    <Bell className="h-3 w-3" /> On
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LanSection({ settings }: { settings: SettingsT }): JSX.Element {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [bindHost, setBindHost] = useState('0.0.0.0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartPending, setRestartPending] = useState(false);
  const setToken = useAuthStore((a) => a.setToken);
  const enabled = settings.lan_access.enabled;

  async function enable(): Promise<void> {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<{ ok: boolean; requires_restart: boolean }>('/api/settings/lan-access', {
        enabled: true,
        password,
        bind_host: bindHost,
      });
      // Pre-seed token so the user doesn't get kicked back to login modal on next call.
      setToken(password);
      setPassword('');
      setRestartPending(true);
      await qc.invalidateQueries({ queryKey: ['settings'] });
      toast.warn(
        'LAN access enabled — restart required',
        'Server will rebind to 0.0.0.0 after restart.',
        'lan',
      );
    } catch (err) {
      setError(err instanceof HarvesterClientError ? err.user_message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/settings/lan-access/disable');
      setToken(null);
      setRestartPending(true);
      await qc.invalidateQueries({ queryKey: ['settings'] });
      toast.warn(
        'LAN access disabled — restart required',
        'Server will rebind to 127.0.0.1 after restart.',
        'lan',
      );
    } catch (err) {
      setError(err instanceof HarvesterClientError ? err.user_message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function restart(): Promise<void> {
    await api.post('/api/service/restart').catch(() => {});
    toast.info(
      'Restart requested',
      'The server is shutting down. Relaunch it from scripts/start.bat and refresh.',
      'lan',
    );
  }

  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-accent-warn" />
        <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">Network (LAN access)</h2>
      </div>
      <div className="text-sm text-text-muted">
        By default Harvester only listens on <code className="font-mono text-text-primary">127.0.0.1</code>.
        Enable LAN access to expose the UI on <code className="font-mono text-text-primary">0.0.0.0</code>{' '}
        behind a password. Changes require a server restart.
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span>
          Status:{' '}
          <span className={enabled ? 'text-accent-warn font-medium' : 'text-text-muted'}>
            {enabled ? 'LAN enabled' : 'localhost only'}
          </span>
        </span>
      </div>
      {!enabled && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Bind address</label>
            <input
              type="text"
              value={bindHost}
              onChange={(e) => setBindHost(e.target.value.trim())}
              placeholder="0.0.0.0"
              className="w-full max-w-md px-3 py-2 bg-bg-elev border border-zinc-800 rounded text-sm font-mono focus:border-accent outline-none"
            />
            <div className="mt-1 text-[11px] text-text-muted">
              <code className="font-mono text-text-primary">0.0.0.0</code> = every NIC
              (recommended). Use a specific LAN IP like{' '}
              <code className="font-mono text-text-primary">192.168.2.13</code> to bind
              only that interface.
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">LAN password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="12+ chars, 3 of 4 classes"
              className="w-full max-w-md px-3 py-2 bg-bg-elev border border-zinc-800 rounded text-sm font-mono focus:border-accent outline-none"
            />
            {password && <PasswordStrengthMeter password={password} />}
          </div>
          {error && <div className="text-xs text-accent-danger">{error}</div>}
          <button
            onClick={() => {
              void enable();
            }}
            disabled={!password || !bindHost || busy}
            className="flex items-center gap-2 px-4 py-2 bg-accent rounded text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Enable LAN access
          </button>
        </div>
      )}
      {enabled && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (confirm('Disable LAN access and rebind to 127.0.0.1? Requires restart.'))
                void disable();
            }}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded text-sm hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
          >
            Disable LAN access
          </button>
        </div>
      )}
      {restartPending && (
        <div className="flex items-center gap-3 p-3 rounded border border-accent-warn/40 bg-accent-warn/10 text-sm">
          <RotateCw className="h-4 w-4 text-accent-warn" />
          <span className="flex-1">Server needs to restart for bind changes to apply.</span>
          <button
            onClick={() => {
              void restart();
            }}
            className="px-3 py-1 bg-accent-warn text-black rounded font-medium text-xs cursor-pointer"
          >
            Restart now
          </button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg p-5">
      <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-zinc-800 last:border-b-0">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
