/**
 * Tiny in-process metrics registry. Counter + Gauge + Histogram. Snapshotted on
 * `/api/metrics` and wired to the Dashboard.
 */

interface Counter {
  inc(n?: number): void;
  get(): number;
}
interface Gauge {
  set(v: number): void;
  inc(n?: number): void;
  dec(n?: number): void;
  get(): number;
}
interface Histogram {
  observe(v: number): void;
  snapshot(): { count: number; sum: number; p50: number; p95: number; p99: number; max: number };
}

export interface Metrics {
  counter(name: string, labels?: Record<string, string>): Counter;
  gauge(name: string, labels?: Record<string, string>): Gauge;
  histogram(name: string, labels?: Record<string, string>): Histogram;
  snapshot(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, ReturnType<Histogram['snapshot']>>;
  };
}

function keyOf(name: string, labels?: Record<string, string>): string {
  if (!labels) return name;
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return parts ? `${name}{${parts}}` : name;
}

function newCounter(): Counter {
  let n = 0;
  return {
    inc(x = 1) {
      n += x;
    },
    get() {
      return n;
    },
  };
}

function newGauge(): Gauge {
  let n = 0;
  return {
    set(v) {
      n = v;
    },
    inc(x = 1) {
      n += x;
    },
    dec(x = 1) {
      n -= x;
    },
    get() {
      return n;
    },
  };
}

function newHistogram(cap = 2000): Histogram {
  const ring: number[] = [];
  let count = 0;
  let sum = 0;
  let max = 0;
  return {
    observe(v) {
      count++;
      sum += v;
      if (v > max) max = v;
      if (ring.length < cap) ring.push(v);
      else ring[count % cap] = v;
    },
    snapshot() {
      if (count === 0) return { count, sum, p50: 0, p95: 0, p99: 0, max };
      const sorted = [...ring].sort((a, b) => a - b);
      const q = (p: number): number => sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)))] ?? 0;
      return { count, sum, p50: q(0.5), p95: q(0.95), p99: q(0.99), max };
    },
  };
}

export function createMetrics(): Metrics {
  const counters = new Map<string, Counter>();
  const gauges = new Map<string, Gauge>();
  const histograms = new Map<string, Histogram>();

  return {
    counter(name, labels) {
      const k = keyOf(name, labels);
      let c = counters.get(k);
      if (!c) {
        c = newCounter();
        counters.set(k, c);
      }
      return c;
    },
    gauge(name, labels) {
      const k = keyOf(name, labels);
      let g = gauges.get(k);
      if (!g) {
        g = newGauge();
        gauges.set(k, g);
      }
      return g;
    },
    histogram(name, labels) {
      const k = keyOf(name, labels);
      let h = histograms.get(k);
      if (!h) {
        h = newHistogram();
        histograms.set(k, h);
      }
      return h;
    },
    snapshot() {
      const cs: Record<string, number> = {};
      for (const [k, c] of counters) cs[k] = c.get();
      const gs: Record<string, number> = {};
      for (const [k, g] of gauges) gs[k] = g.get();
      const hs: Record<string, ReturnType<Histogram['snapshot']>> = {};
      for (const [k, h] of histograms) hs[k] = h.snapshot();
      return { counters: cs, gauges: gs, histograms: hs };
    },
  };
}
