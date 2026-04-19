// Spike: probe M-Team API to capture real response shapes.
// Usage: MTEAM_KEY=... node spike/probe.mjs
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.MTEAM_KEY;
if (!KEY) { console.error('Set MTEAM_KEY'); process.exit(1); }
const BASE = 'https://api.m-team.cc/api';
const UA = 'harvester-spike/0.1 (+https://github.com/)';

async function call(method, urlPath, { query, body, raw } = {}) {
  const url = new URL(BASE + urlPath);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers = {
    'x-api-key': KEY,
    'User-Agent': UA,
    'Accept': 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t0 = Date.now();
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const elapsed = Date.now() - t0;
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, elapsed_ms: elapsed, headers: Object.fromEntries(res.headers), body: parsed, raw: raw ? text : undefined };
}

const OUT = path.resolve('spike/captures');
fs.mkdirSync(OUT, { recursive: true });
const redact = (s) => JSON.stringify(s, null, 2).replaceAll(KEY, '***REDACTED_KEY***');

async function save(name, obj) {
  fs.writeFileSync(path.join(OUT, name + '.json'), redact(obj));
  console.log(`saved ${name}.json — status ${obj.status}, ${obj.elapsed_ms}ms`);
}

(async () => {
  // 1) profile
  const profile = await call('POST', '/member/profile');
  await save('member-profile', profile);
  const uid = profile.body?.data?.id;
  console.log('  uid:', uid);

  // 2) search — 3 variants: normal, sorted by createdDate desc, filtered to FREE
  const searchNormal = await call('POST', '/torrent/search', {
    body: { mode: 'normal', pageSize: 10, pageNumber: 1, sortField: 'CREATED_DATE', sortDirection: 'DESC' }
  });
  await save('torrent-search-normal', searchNormal);

  const searchFree = await call('POST', '/torrent/search', {
    body: { mode: 'normal', pageSize: 5, pageNumber: 1, discount: 'FREE', sortField: 'CREATED_DATE', sortDirection: 'DESC' }
  });
  await save('torrent-search-free', searchFree);

  // Extract first torrent id for detail + genDlToken test
  const items = searchNormal.body?.data?.data || searchNormal.body?.data?.list || searchNormal.body?.data?.records || [];
  console.log('  first page items:', items.length);
  if (items.length > 0) console.log('  first item keys:', Object.keys(items[0]).slice(0, 30).join(', '));
  const tid = items[0]?.id;
  console.log('  sample torrent id:', tid);

  if (tid) {
    // 3) detail
    const detail = await call('POST', '/torrent/detail', { query: { id: tid, origin: 'web' } });
    await save('torrent-detail', detail);

    const detailNoOrigin = await call('POST', '/torrent/detail', { query: { id: tid } });
    await save('torrent-detail-no-origin', detailNoOrigin);

    // 4) genDlToken
    const token1 = await call('POST', '/torrent/genDlToken', { query: { id: tid } });
    await save('torrent-genDlToken-1', token1);

    // Immediately a 2nd call to check reusability
    const token2 = await call('POST', '/torrent/genDlToken', { query: { id: tid } });
    await save('torrent-genDlToken-2', token2);
  }

  // 5) system-wide — check /system/config, /ping etc.
  for (const p of ['/system/config', '/system/online', '/system/torrentCount', '/torrent/fav', '/rss/fetch']) {
    try {
      const r = await call('POST', p);
      await save('misc-' + p.replaceAll('/', '_').slice(1), r);
    } catch (e) { console.error('  ', p, 'error', e.message); }
  }
})().catch(e => { console.error(e); process.exit(1); });
