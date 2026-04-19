import { useState } from 'react';
import { Routes, Route, Navigate, Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Download,
  Filter,
  Lock,
  RefreshCw,
  ScrollText,
  Settings as SettingsIcon,
  Activity,
  Pause,
  Play,
} from 'lucide-react';
import { api } from './api/client';
import type { ServiceStateView, Settings as SettingsT } from '@shared/types';
import FirstRunPage from './pages/FirstRunPage';
import DashboardPage from './pages/DashboardPage';
import TorrentsPage from './pages/TorrentsPage';
import RulesPage from './pages/RulesPage';
import SettingsPage from './pages/SettingsPage';
import LogsPage from './pages/LogsPage';
import ToastContainer from './components/ToastContainer';
import LoginModal from './components/LoginModal';

export default function App(): JSX.Element {
  const settingsQ = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsT>('/api/settings'),
    refetchInterval: 30_000,
  });

  const firstRunDone = settingsQ.data?.first_run_completed ?? true;

  if (settingsQ.isLoading) {
    return <div className="flex h-full items-center justify-center text-text-muted">Loading…</div>;
  }

  if (!firstRunDone) {
    return (
      <>
        <Routes>
          <Route path="/first-run" element={<FirstRunPage />} />
          <Route path="*" element={<Navigate to="/first-run" replace />} />
        </Routes>
        <ToastContainer />
        <LoginModal />
      </>
    );
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/first-run" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/torrents" element={<TorrentsPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
      <ToastContainer />
      <LoginModal />
    </div>
  );
}

function Sidebar(): JSX.Element {
  const nav = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/torrents', icon: Download, label: 'Torrents' },
    { to: '/rules', icon: Filter, label: 'Rules' },
    { to: '/logs', icon: ScrollText, label: 'Logs' },
    { to: '/settings', icon: SettingsIcon, label: 'Settings' },
  ];
  return (
    <aside className="w-56 bg-bg-sub border-r border-zinc-800 flex flex-col">
      <Link to="/" className="flex items-center gap-2 px-4 py-4 border-b border-zinc-800">
        <Activity className="h-6 w-6 text-accent" />
        <span className="font-semibold">Harvester</span>
      </Link>
      <nav className="flex-1 flex flex-col gap-0.5 p-2">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm',
                isActive
                  ? 'bg-bg-elev text-text-primary'
                  : 'text-text-muted hover:bg-bg-elev/60 hover:text-text-primary',
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function TopBar(): JSX.Element {
  const location = useLocation();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const stateQ = useQuery({
    queryKey: ['service', 'state'],
    queryFn: () => api.get<ServiceStateView>('/api/service/state'),
    refetchInterval: 5_000,
  });
  const status = stateQ.data?.status ?? 'STOPPED';
  const statusColor = {
    RUNNING: 'bg-accent-success',
    STOPPED: 'bg-text-subtle',
    PAUSED_USER: 'bg-accent-warn',
    PAUSED_EMERGENCY: 'bg-accent-danger',
    PAUSED_BACKOFF: 'bg-accent-warn',
  }[status];

  async function toggle(): Promise<void> {
    if (status === 'RUNNING') {
      await api.post('/api/service/pause');
    } else if (status === 'PAUSED_USER' || status === 'STOPPED') {
      await api.post('/api/service/resume');
    }
    await stateQ.refetch();
  }

  async function refresh(): Promise<void> {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // Refetch every active query (dashboard, torrents, rules, stats, logs …).
      await qc.refetchQueries({ type: 'active' });
    } finally {
      // Small delay so the spinner has perceivable feedback even on fast local server.
      setTimeout(() => setRefreshing(false), 300);
    }
  }

  return (
    <header className="h-14 px-6 bg-bg-sub border-b border-zinc-800 flex items-center justify-between">
      <h1 className="text-lg font-medium capitalize">
        {location.pathname.replace('/', '') || 'dashboard'}
      </h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <div className={clsx('h-2 w-2 rounded-full', statusColor)} />
          <span className="text-text-muted">{status.toLowerCase().replace('_', ' ')}</span>
        </div>
        <button
          onClick={() => {
            void refresh();
          }}
          disabled={refreshing}
          title="Refresh all data now"
          aria-label="Refresh"
          className="h-8 w-8 flex items-center justify-center bg-bg-elev rounded-md border border-zinc-800 hover:bg-bg-elev/80 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={clsx('h-4 w-4', refreshing && 'animate-spin')} />
        </button>
        <button
          onClick={() => {
            void toggle();
          }}
          disabled={status === 'PAUSED_EMERGENCY' || status === 'PAUSED_BACKOFF'}
          title={
            status === 'RUNNING'
              ? 'Pause the grab poller only. Profile/ratio sync, transfer-speed sampling, and lifecycle cleanup keep running.'
              : 'Resume the grab poller. Other workers were never paused.'
          }
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-bg-elev rounded-md border border-zinc-800 hover:bg-bg-elev/80 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {status === 'RUNNING' ? (
            <>
              <Pause className="h-4 w-4" /> Pause grabs
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Resume grabs
            </>
          )}
        </button>
      </div>
    </header>
  );
}

function Footer(): JSX.Element {
  const stateQ = useQuery({
    queryKey: ['service', 'state'],
    queryFn: () => api.get<ServiceStateView>('/api/service/state'),
  });
  const state = stateQ.data;
  return (
    <footer className="h-8 px-4 bg-bg-sub border-t border-zinc-800 flex items-center justify-between text-xs text-text-muted">
      <div className="flex items-center gap-3">
        <span>
          {state?.preflight.mteam ? 'M-Team OK' : 'M-Team ?'} · {state?.preflight.qbt ? 'qBt OK' : 'qBt ?'} ·{' '}
          {state?.preflight.allowed_client ? 'client OK' : 'client ?'}
        </span>
        {state?.lan.enabled && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-warn/15 text-accent-warn border border-accent-warn/30">
            <Lock className="h-3 w-3" />
            LAN: {state.lan.listening_on}
          </span>
        )}
      </div>
      <span>Harvester 0.1.0</span>
    </footer>
  );
}
