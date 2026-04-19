import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { extractInfohash } from './torrentInfohash.js';

// Build a minimal valid bencoded torrent in-memory and confirm we recover
// the canonical infohash. No network, no fixtures — the encoder is tiny.

function benc(v: unknown): Buffer {
  if (typeof v === 'number') return Buffer.from(`i${v}e`, 'utf-8');
  if (typeof v === 'string') {
    const b = Buffer.from(v, 'utf-8');
    return Buffer.concat([Buffer.from(`${b.length}:`, 'ascii'), b]);
  }
  if (Buffer.isBuffer(v)) {
    return Buffer.concat([Buffer.from(`${v.length}:`, 'ascii'), v]);
  }
  if (Array.isArray(v)) {
    return Buffer.concat([Buffer.from('l'), ...v.map(benc), Buffer.from('e')]);
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const pairs = entries.flatMap(([k, val]) => [benc(k), benc(val)]);
    return Buffer.concat([Buffer.from('d'), ...pairs, Buffer.from('e')]);
  }
  throw new Error('unsupported');
}

describe('extractInfohash', () => {
  it('recovers the SHA-1 of the info dict', () => {
    const info = { length: 12345, name: 'fixture.bin', 'piece length': 16384, pieces: Buffer.from('x'.repeat(20)) };
    const torrent = { announce: 'http://tracker.example/announce', info };
    const buf = benc(torrent);

    const expected = createHash('sha1').update(benc(info)).digest('hex');
    expect(extractInfohash(buf)).toBe(expected);
  });

  it('finds info even when it is not the first key', () => {
    const info = { length: 7, name: 'a', 'piece length': 1, pieces: Buffer.from('y'.repeat(20)) };
    const torrent = {
      announce: 'http://tracker.example/announce',
      'creation date': 1_700_000_000,
      info,
    };
    const expected = createHash('sha1').update(benc(info)).digest('hex');
    expect(extractInfohash(benc(torrent))).toBe(expected);
  });

  it('returns null for non-bencoded input', () => {
    expect(extractInfohash(Buffer.from('not a torrent'))).toBeNull();
  });

  it('returns null on truncated input', () => {
    const info = { length: 1, name: 'x', 'piece length': 1, pieces: Buffer.from('z'.repeat(20)) };
    const torrent = { info };
    const full = benc(torrent);
    expect(extractInfohash(full.subarray(0, full.length - 5))).toBeNull();
  });
});
