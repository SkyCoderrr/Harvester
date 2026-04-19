import { createHash } from 'node:crypto';

// Extract the infohash from a bencoded .torrent file. The infohash is the
// SHA-1 of the `info` dict's bencoded bytes. We parse just enough bencode
// to find the range of the info value; no general-purpose bencode library
// needed, and we avoid allocating decoded structures.
//
// Bencode value kinds:
//   integer  i<digits>e
//   string   <length>:<bytes>
//   list     l<items>e
//   dict     d(<key_string><value>)*e
//
// A valid .torrent file is a top-level dict whose keys are sorted
// lexicographically; `info` (4 bytes) sits between keys beginning with
// codepoints ≤ 'h' ("creation date", "created by", "comment", "announce"
// etc.) and ≥ 'j' (rare). We can't rely on position; we parse keys/values
// pair by pair until we hit "info".

export function extractInfohash(buf: Buffer): string | null {
  try {
    if (buf[0] !== 0x64 /* 'd' */) return null; // not a top-level dict
    let pos = 1;
    while (pos < buf.length && buf[pos] !== 0x65 /* 'e' */) {
      // Each pair: string key, then value.
      const keyRange = readValue(buf, pos);
      if (!keyRange || keyRange.kind !== 'string') return null;
      const keyBytes = buf.subarray(keyRange.contentStart, keyRange.contentEnd);
      const valueStart = keyRange.end;
      const valueRange = readValue(buf, valueStart);
      if (!valueRange) return null;

      if (keyBytes.equals(Buffer.from('info'))) {
        // SHA-1 over the bencoded info dict, NOT its decoded content.
        return createHash('sha1')
          .update(buf.subarray(valueStart, valueRange.end))
          .digest('hex');
      }
      pos = valueRange.end;
    }
    return null;
  } catch {
    return null;
  }
}

type Range =
  | { kind: 'string'; contentStart: number; contentEnd: number; end: number }
  | { kind: 'other'; end: number };

function readValue(buf: Buffer, start: number): Range | null {
  if (start >= buf.length) return null;
  const c = buf[start];
  if (c === undefined) return null;
  // Integer
  if (c === 0x69 /* 'i' */) {
    const e = buf.indexOf(0x65, start + 1);
    if (e === -1) return null;
    return { kind: 'other', end: e + 1 };
  }
  // List
  if (c === 0x6c /* 'l' */) {
    let pos = start + 1;
    while (pos < buf.length && buf[pos] !== 0x65) {
      const r = readValue(buf, pos);
      if (!r) return null;
      pos = r.end;
    }
    return { kind: 'other', end: pos + 1 };
  }
  // Dict
  if (c === 0x64 /* 'd' */) {
    let pos = start + 1;
    while (pos < buf.length && buf[pos] !== 0x65) {
      const k = readValue(buf, pos);
      if (!k) return null;
      const v = readValue(buf, k.end);
      if (!v) return null;
      pos = v.end;
    }
    return { kind: 'other', end: pos + 1 };
  }
  // String
  if (c >= 0x30 && c <= 0x39 /* '0'-'9' */) {
    const colon = buf.indexOf(0x3a /* ':' */, start);
    if (colon === -1) return null;
    const length = parseInt(buf.subarray(start, colon).toString('ascii'), 10);
    if (!Number.isFinite(length) || length < 0) return null;
    const contentStart = colon + 1;
    const contentEnd = contentStart + length;
    if (contentEnd > buf.length) return null;
    return { kind: 'string', contentStart, contentEnd, end: contentEnd };
  }
  return null;
}
