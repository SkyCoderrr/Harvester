import { useEffect, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { api, HarvesterClientError } from '../api/client';

export default function LoginModal(): JSX.Element | null {
  const loginOpen = useAuthStore((s) => s.loginOpen);
  const closeLogin = useAuthStore((s) => s.closeLogin);
  const setToken = useAuthStore((s) => s.setToken);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Clear state when closed.
  useEffect(() => {
    if (!loginOpen) {
      setPassword('');
      setError(null);
      setBusy(false);
    }
  }, [loginOpen]);

  if (!loginOpen) return null;

  async function submit(): Promise<void> {
    if (!password) return;
    setBusy(true);
    setError(null);
    // Set the token optimistically, then probe /api/service/state — which requires auth.
    setToken(password);
    try {
      await api.get('/api/service/state');
      closeLogin();
    } catch (err) {
      if (err instanceof HarvesterClientError && err.code === 'AUTH_UNAUTHENTICATED') {
        setError('Incorrect password.');
      } else if (err instanceof HarvesterClientError && err.code === 'AUTH_RATE_LIMITED') {
        setError(err.user_message);
      } else {
        setError((err as Error).message);
      }
      setToken(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center backdrop-blur-sm">
      <div className="w-full max-w-sm bg-bg-sub border border-zinc-800 rounded-lg shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="h-5 w-5 text-accent-warn" />
          <div>
            <h2 className="font-semibold">Sign in</h2>
            <p className="text-xs text-text-muted">
              This Harvester instance is protected. Enter the LAN access password.
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-3"
        >
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 bg-bg-elev border border-zinc-800 rounded-md font-mono text-sm focus:border-accent outline-none"
          />
          {error && <div className="text-sm text-accent-danger">{error}</div>}
          <button
            type="submit"
            disabled={!password || busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent rounded-md text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
