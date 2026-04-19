export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 2 ** 40) return (bytes / 2 ** 40).toFixed(2) + ' TiB';
  if (bytes >= 2 ** 30) return (bytes / 2 ** 30).toFixed(2) + ' GiB';
  if (bytes >= 2 ** 20) return (bytes / 2 ** 20).toFixed(1) + ' MiB';
  if (bytes >= 2 ** 10) return (bytes / 2 ** 10).toFixed(0) + ' KiB';
  return Math.round(bytes) + ' B';
}

export function formatRate(bytesPerSec: number): string {
  return formatBytes(bytesPerSec) + '/s';
}

/**
 * qBt's `eta` is seconds; a sentinel of 8640000 (100 days) means "unknown".
 * Returns "1h 23m", "45s", "3d 2h" etc.
 */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 8640000) return '∞';
  if (seconds < 60) return Math.round(seconds) + 's';
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.round((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
}

/**
 * Short duration, e.g. "124d 6h", "3h 15m". Max two segments. Used by the
 * SeedingTime KPI tile. Returns "—" for null/negative/infinite.
 */
export function formatDurationShort(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const s = Math.floor(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  if (mins > 0) return `${mins}m`;
  return `${s}s`;
}
