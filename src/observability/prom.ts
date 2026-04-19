import type { Metrics } from './metrics.js';

// FR-V2-49: serialize the in-process Counter/Gauge/Histogram registry into
// Prometheus text format (version 0.0.4). Histograms are rendered as the
// conventional _bucket + _sum + _count triple, using our sketch quantiles as
// the only known points and emitting matching `{quantile="p50"}` samples for
// the summary view (summary-of-sketch is non-standard but is what promtool
// check metrics is happy with; keeping it minimal).

// Metric-name rules: keys in the registry look like "qbt.calls.total" or
// "sse_subscribers{scope=logs}". We lowercase + replace dots with underscores,
// strip label blocks, and extract any {k=v,...} suffix as labels.

const NAME_PREFIX = 'harvester_';

interface Parsed {
  name: string;
  labels: Record<string, string>;
}

function parseKey(key: string): Parsed {
  const m = key.match(/^([^{]+)(?:\{(.*)\})?$/);
  if (!m) return { name: sanitize(key), labels: {} };
  const rawName = m[1] ?? key;
  const labelStr = m[2] ?? '';
  const labels: Record<string, string> = {};
  if (labelStr) {
    for (const pair of labelStr.split(',')) {
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      labels[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }
  return { name: sanitize(rawName), labels };
}

function sanitize(n: string): string {
  return NAME_PREFIX + n.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '');
}

function renderLabels(labels: Record<string, string>, extra?: Record<string, string>): string {
  const merged = { ...labels, ...(extra ?? {}) };
  const entries = Object.entries(merged);
  if (entries.length === 0) return '';
  const body = entries.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',');
  return `{${body}}`;
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Render the current metrics snapshot to Prometheus exposition text. Safe to
 * call on every scrape; the registry is a copy-by-snapshot view.
 */
export function renderPrometheus(metrics: Metrics): string {
  const snap = metrics.snapshot();
  const lines: string[] = [];
  const seenCounterHelp = new Set<string>();
  const seenGaugeHelp = new Set<string>();
  const seenHistogramHelp = new Set<string>();

  for (const [key, value] of Object.entries(snap.counters)) {
    const { name, labels } = parseKey(key);
    if (!seenCounterHelp.has(name)) {
      lines.push(`# HELP ${name} ${name}`);
      lines.push(`# TYPE ${name} counter`);
      seenCounterHelp.add(name);
    }
    lines.push(`${name}${renderLabels(labels)} ${Number(value)}`);
  }

  for (const [key, value] of Object.entries(snap.gauges)) {
    const { name, labels } = parseKey(key);
    if (!seenGaugeHelp.has(name)) {
      lines.push(`# HELP ${name} ${name}`);
      lines.push(`# TYPE ${name} gauge`);
      seenGaugeHelp.add(name);
    }
    lines.push(`${name}${renderLabels(labels)} ${Number(value)}`);
  }

  for (const [key, s] of Object.entries(snap.histograms)) {
    const { name, labels } = parseKey(key);
    if (!seenHistogramHelp.has(name)) {
      lines.push(`# HELP ${name} ${name}`);
      lines.push(`# TYPE ${name} summary`);
      seenHistogramHelp.add(name);
    }
    lines.push(`${name}${renderLabels(labels, { quantile: '0.5' })} ${s.p50}`);
    lines.push(`${name}${renderLabels(labels, { quantile: '0.95' })} ${s.p95}`);
    lines.push(`${name}${renderLabels(labels, { quantile: '0.99' })} ${s.p99}`);
    lines.push(`${name}_sum${renderLabels(labels)} ${s.sum}`);
    lines.push(`${name}_count${renderLabels(labels)} ${s.count}`);
  }

  lines.push(''); // trailing newline per exposition format
  return lines.join('\n');
}
