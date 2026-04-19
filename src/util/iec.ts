/** IEC formatters. Bytes → GiB/MiB/TiB strings. */

export function gib(bytes: number): number {
  return bytes / 2 ** 30;
}

export function mib(bytes: number): number {
  return bytes / 2 ** 20;
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
  const abs = Math.abs(bytes);
  if (abs >= 2 ** 40) return (bytes / 2 ** 40).toFixed(2) + ' TiB';
  if (abs >= 2 ** 30) return (bytes / 2 ** 30).toFixed(2) + ' GiB';
  if (abs >= 2 ** 20) return (bytes / 2 ** 20).toFixed(2) + ' MiB';
  if (abs >= 2 ** 10) return (bytes / 2 ** 10).toFixed(2) + ' KiB';
  return bytes + ' B';
}

export function formatRate(bytesPerSec: number): string {
  return formatSize(bytesPerSec) + '/s';
}
