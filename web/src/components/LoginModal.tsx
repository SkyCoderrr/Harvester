import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Lock, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { api, HarvesterClientError } from '../api/client';

// Migrated from hand-rolled modal + useFocusTrap to Radix Dialog. Radix
// handles focus trap, scroll lock, Escape-to-close, and ARIA semantics
// internally — so this component is just business logic + markup.

export default function LoginModal(): JSX.Element | null {
  const loginOpen = useAuthStore((s) => s.loginOpen);
  const closeLogin = useAuthStore((s) => s.closeLogin);
  const setToken = useAuthStore((s) => s.setToken);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loginOpen) {
      setPassword('');
      setError(null);
      setBusy(false);
    }
  }, [loginOpen]);

  async function submit(): Promise<void> {
    if (!password) return;
    setBusy(true);
    setError(null);
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
    <Dialog.Root
      open={loginOpen}
      onOpenChange={(open) => {
        if (!open && !busy) closeLogin();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 bg-bg-sub border border-zinc-800 rounded-lg shadow-2xl p-6 focus:outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95"
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <Lock className="h-5 w-5 text-accent-warn" aria-hidden />
            <div>
              <Dialog.Title className="font-semibold">Sign in</Dialog.Title>
              <Dialog.Description className="text-xs text-text-muted">
                This Harvester instance is protected. Enter the LAN access password.
              </Dialog.Description>
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
            {error && (
              <div className="text-sm text-accent-danger" role="alert">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={!password || busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent rounded-md text-sm font-medium disabled:opacity-50 cursor-pointer"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
