import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, Activity } from 'lucide-react';
import { api } from '../api/client';

type Step = 'mteam' | 'qbt' | 'save' | 'complete';

export default function FirstRunPage(): JSX.Element {
  const [step, setStep] = useState<Step>('mteam');
  const [mteamKey, setMteamKey] = useState('');
  const [mteamStatus, setMteamStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [mteamError, setMteamError] = useState('');

  const [qbtHost, setQbtHost] = useState('127.0.0.1');
  const [qbtPort, setQbtPort] = useState(8080);
  const [qbtUser, setQbtUser] = useState('admin');
  const [qbtPass, setQbtPass] = useState('');
  const [qbtStatus, setQbtStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [qbtError, setQbtError] = useState('');
  const [qbtVersion, setQbtVersion] = useState<string | null>(null);

  const [savePath, setSavePath] = useState('C:\\Users\\sky20\\Downloads');

  const qc = useQueryClient();
  const nav = useNavigate();

  async function testMteam(): Promise<void> {
    setMteamStatus('testing');
    setMteamError('');
    try {
      const r = await api.post<{ ok: boolean; profile?: { username?: string }; error?: { user_message: string } }>(
        '/api/settings/test/mteam',
        { api_key: mteamKey },
      );
      if (r.ok) {
        await api.post('/api/first-run/save', { mteam: { api_key: mteamKey } });
        setMteamStatus('ok');
        setStep('qbt');
      } else {
        setMteamStatus('error');
        setMteamError(r.error?.user_message ?? 'M-Team rejected the key.');
      }
    } catch (err) {
      setMteamStatus('error');
      setMteamError((err as Error).message);
    }
  }

  async function testQbt(): Promise<void> {
    setQbtStatus('testing');
    setQbtError('');
    try {
      const r = await api.post<{ ok: boolean; version?: string; error?: string }>(
        '/api/settings/test/qbt',
        { host: qbtHost, port: qbtPort, user: qbtUser, pass: qbtPass },
      );
      if (r.ok) {
        await api.post('/api/first-run/save', {
          qbt: { host: qbtHost, port: qbtPort, user: qbtUser, password: qbtPass },
        });
        setQbtStatus('ok');
        setQbtVersion(r.version ?? null);
        setStep('save');
      } else {
        setQbtStatus('error');
        setQbtError(r.error ?? 'qBittorrent rejected the login.');
      }
    } catch (err) {
      setQbtStatus('error');
      setQbtError((err as Error).message);
    }
  }

  async function finish(): Promise<void> {
    await api.post('/api/first-run/save', { downloads: { default_save_path: savePath } });
    await api.post('/api/first-run/complete');
    await qc.invalidateQueries({ queryKey: ['settings'] });
    nav('/dashboard');
  }

  return (
    <div className="h-full flex items-center justify-center bg-bg-base">
      <div className="w-full max-w-xl bg-bg-sub border border-zinc-800 rounded-lg shadow-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="h-7 w-7 text-accent" />
          <div>
            <h1 className="text-xl font-semibold">Welcome to Harvester</h1>
            <p className="text-sm text-text-muted">
              Let's connect to M-Team and qBittorrent, then set a default save path.
            </p>
          </div>
        </div>

        <Stepper step={step} />

        {step === 'mteam' && (
          <div className="space-y-4 mt-6">
            <h2 className="text-lg font-medium">Step 1 — M-Team API key</h2>
            <p className="text-sm text-text-muted">
              Paste your M-Team API key. Harvester stores it locally in{' '}
              <code className="px-1 py-0.5 bg-bg-elev rounded text-xs">config.json</code>.
            </p>
            <input
              type="text"
              value={mteamKey}
              onChange={(e) => setMteamKey(e.target.value)}
              placeholder="019xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full px-3 py-2 bg-bg-elev border border-zinc-800 rounded-md font-mono text-sm focus:border-accent outline-none"
            />
            {mteamError && <div className="text-sm text-accent-danger">{mteamError}</div>}
            <button
              onClick={() => {
                void testMteam();
              }}
              disabled={!mteamKey || mteamStatus === 'testing'}
              className="flex items-center gap-2 px-4 py-2 bg-accent rounded-md text-sm font-medium disabled:opacity-50"
            >
              {mteamStatus === 'testing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Test &amp; save
            </button>
          </div>
        )}

        {step === 'qbt' && (
          <div className="space-y-4 mt-6">
            <h2 className="text-lg font-medium">Step 2 — qBittorrent WebUI</h2>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Host" value={qbtHost} onChange={setQbtHost} />
              <LabeledInput
                label="Port"
                value={String(qbtPort)}
                onChange={(v) => setQbtPort(Number(v))}
              />
              <LabeledInput label="Username" value={qbtUser} onChange={setQbtUser} />
              <LabeledInput
                label="Password"
                type="password"
                value={qbtPass}
                onChange={setQbtPass}
              />
            </div>
            {qbtError && <div className="text-sm text-accent-danger">{qbtError}</div>}
            {qbtVersion && (
              <div className="text-sm text-accent-success">Connected to qBittorrent {qbtVersion}</div>
            )}
            <button
              onClick={() => {
                void testQbt();
              }}
              disabled={!qbtUser || !qbtPass || qbtStatus === 'testing'}
              className="flex items-center gap-2 px-4 py-2 bg-accent rounded-md text-sm font-medium disabled:opacity-50"
            >
              {qbtStatus === 'testing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Test &amp; save
            </button>
          </div>
        )}

        {step === 'save' && (
          <div className="space-y-4 mt-6">
            <h2 className="text-lg font-medium">Step 3 — Default save path</h2>
            <p className="text-sm text-text-muted">
              Where qBittorrent will save files for Harvester grabs. The folder must exist.
            </p>
            <input
              type="text"
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              className="w-full px-3 py-2 bg-bg-elev border border-zinc-800 rounded-md font-mono text-sm focus:border-accent outline-none"
            />
            <button
              onClick={() => {
                void finish();
              }}
              disabled={!savePath}
              className="flex items-center gap-2 px-4 py-2 bg-accent-success rounded-md text-sm font-medium disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Finish setup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}): JSX.Element {
  return (
    <label className="block">
      <span className="block text-xs text-text-muted mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-bg-elev border border-zinc-800 rounded-md text-sm focus:border-accent outline-none"
      />
    </label>
  );
}

function Stepper({ step }: { step: Step }): JSX.Element {
  const steps: Step[] = ['mteam', 'qbt', 'save'];
  const idx = steps.indexOf(step);
  return (
    <div className="flex items-center gap-1 text-xs text-text-muted">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1 flex-1">
          <div
            className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
              i <= idx ? 'bg-accent text-white' : 'bg-bg-elev'
            }`}
          >
            {i < idx ? <Check className="h-3 w-3" /> : i + 1}
          </div>
          {i < steps.length - 1 && <div className="flex-1 h-0.5 bg-bg-elev" />}
        </div>
      ))}
    </div>
  );
}
