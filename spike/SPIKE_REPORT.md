# M-Team API Spike Report

**Date:** 2026-04-18
**Method:** live probes with a real API key (`spike/probe.mjs`)
**Captures:** `spike/captures/*.json` (API key redacted)
**Purpose:** resolve PRD OQ-1..4, populate `IMPLEMENTATION.md §4.8` with real shapes.

---

## 1. Connection

| Item | Value |
|------|-------|
| **Base URL** | `https://api.m-team.cc/api` |
| **Auth header** | `x-api-key: <KEY>` |
| **Other auth?** | `Authorization: Bearer` NOT accepted. Only `x-api-key`. |
| **User-Agent** | REQUIRED to be non-default. Default curl UA → 302 to `https://www.google.com/...`. Any non-empty custom UA works. |
| **Content-Type** | `application/json` on bodied requests |
| **CDN / infra** | Cloudflare. `cf-ray` visible. `alt-svc: h3=":443"` (HTTP/3 available). |
| **Swagger** | `https://test2.m-team.cc/api/v3/api-docs` (OpenAPI 3.1; test2 host does NOT accept production keys — returns `{code:1, message:"key無效"}`) |

### ADR-007 amendment (was: "yeast.js first, raw-HTTP fallback")

**yeast.js is NOT needed.** The API is a flat JSON Swagger service. Use raw `fetch` with these rules:
- Always send `User-Agent: harvester/<version>`.
- Always send `x-api-key`.
- Wrap `{code,message,data}` envelope parsing in one helper.
- Honor `code !== "0"` as domain error (throw `HarvesterError` mapped per table in §5).

`src/mteam/forbidden.ts` is **empty** — no yeast-specific unimplemented methods, because no yeast.

---

## 2. Response envelope

Every `/api/*` endpoint returns HTTP 200 with JSON:

```json
{ "code": "0" | "1" | "401" | ..., "message": "SUCCESS" | "<reason>", "data": <any> | null }
```

**Note the codes are STRINGS not ints** (OpenAPI spec says `integer`; production returns `"0"`). A client must coerce.

| `code` | Meaning | HTTP | Example `message` |
|--------|---------|------|-------------------|
| `"0"` | Success | 200 | `"SUCCESS"` |
| `"1"` | Generic failure | 200 | `"key無效"`, `"連結不可用！ 超出有效期"`, `"簽名錯誤"` |
| `"401"` | Not authenticated | 200 | `"Full authentication is required to access this resource"` |

Messages may be in traditional Chinese. For user-facing toasts, translate the common ones:
- `"key無效"` → "Invalid M-Team API key"
- `"連結不可用！ 超出有效期"` → "Download link expired"
- `"簽名錯誤"` → "Download link signature invalid"

---

## 3. Numeric string convention

**Every numeric field on the wire is a string.** This includes IDs, sizes, seeders, leechers, ratios, timestamps, and discount windows. The normalizer must `parseInt`/`parseFloat`. Examples from `torrent-search-normal.json`:

```json
{
  "id": "1168978",
  "size": "4919742672",          // bytes as string
  "status": {
    "seeders": "325",
    "leechers": "307",
    "timesCompleted": "344",
    "discount": "FREE",
    "discountEndTime": "2026-04-19 21:00:46"
  }
}
```

---

## 4. Date convention

Timestamps are **formatted strings**, not unix epochs:

```
"createdDate": "2026-04-19 09:00:46"
"discountEndTime": "2026-04-19 21:00:46"
"lastAction": "2026-04-19 09:25:46"
```

- Format: `"YYYY-MM-DD HH:mm:ss"` (24h, no timezone suffix).
- The **server timezone is `Asia/Taipei` (UTC+8)**. Confirmed by cross-referencing response `Date:` header (01:31:16Z) with `memberStatus.lastModifiedDate: "2026-04-19 09:30:57"` from the same response — that is 09:30:57 in UTC+8 = 01:30:57Z (~20s before the envelope date), consistent with Taipei time.
- **Rule for the normalizer:** `new Date(s.replace(' ', 'T') + '+08:00')`.

---

## 5. `POST /torrent/search`

### Request body (all optional)

| Field | Type | Notes |
|-------|------|-------|
| `mode` | enum | `normal`, `adult`, `movie`, `music`, `tvshow`, `waterfall`, `rss`, `rankings`, `all`. Default (absent) ≈ `normal`. |
| `pageNumber` | 1..1000 | Default 1. |
| `pageSize` | 1..200 | Default 20. We use 50. |
| `sortField` | enum | `CREATED_DATE`, `SIZE`, `SEEDERS`, `LEECHERS`, `TIMES_COMPLETED`, `NAME`. |
| `sortDirection` | `ASC`\|`DESC` | |
| `discount` | enum | Filter to one discount (see §6). |
| `keyword` | string | |
| `categories` | int[] | IDs (Swagger enum not exposed here). |
| `visible` | int | |
| `onlyFav` | bool | |
| `hot`/`offer` | bool | |
| `labelsNew` | string[] | Human tags like `"中配"`. |

**Correction to IMPLEMENTATION.md §4.8 / PRD FR-PO-01:** the spec said `sortBy: "createdDate desc"`. The real wire contract is `sortField: "CREATED_DATE"` + `sortDirection: "DESC"`. Two separate fields. `sortBy` is ignored.

### Response `data`

Spring-Data page shape:

```ts
{
  pageNumber: "1",
  pageSize: "50",
  total:     "10000",         // capped at 10000 regardless of true count
  totalPages: "200",
  data: Torrent[]              // rows
}
```

### `Torrent` row (search + detail share base fields)

Observed keys (see `spike/captures/torrent-search-normal.json` for a live sample):

```ts
{
  id: string,                    // int64
  createdDate: string,           // "YYYY-MM-DD HH:mm:ss" Asia/Taipei
  lastModifiedDate: string,
  name: string,
  smallDescr: string,
  imdb: string,                  // may be empty string
  imdbRating: string | null,
  douban: string,
  doubanRating: string | null,
  dmmCode: string,
  author: string | null,
  category: string,              // int id; mapping is server-side
  source: string | null,
  medium: string | null,
  standard: string | null,
  videoCodec: string | null,
  audioCodec: string | null,
  team: string | null,
  processing: string | null,
  countries: string[],           // int ids
  numfiles: string,
  size: string,                  // bytes
  labels: string,
  labelsNew: string[],
  msUp: string,
  anonymous: boolean,
  infoHash: string | null,       // almost always null in search (see §8)
  status: {
    id: string,
    createdDate: string,
    lastModifiedDate: string,
    pickType: "normal" | string,
    toppingLevel: string,
    toppingEndTime: string | null,
    discount: Discount,          // see §6
    discountEndTime: string | null,  // null when discount == NORMAL
    timesCompleted: string,
    comments: string,
    lastAction: string,
    lastSeederAction: string,
    views: string,
    hits: string,
    support: string,
    oppose: string,
    status: "NORMAL" | string,
    seeders: string,
    leechers: string,
    banned: boolean,
    visible: boolean,
    promotionRule: unknown | null,
    mallSingleFree: unknown | null
  },
  dmmInfo: unknown | null,
  editedBy: string | null,
  editDate: string | null,
  collection: boolean,
  inRss: boolean,
  canVote: boolean,
  imageList: string[],
  resetBox: unknown | null
}
```

`/torrent/detail` adds: `descr` (BBCode/markdown), `nfo`, `mediainfo`, `originFileName`, `cids`, `aids`, `scope`, `scopeTeams`, `thanked`, `rewarded`, `albumList`.

---

## 6. Discount enum — CORRECTION

**IMPLEMENTATION.md §3.1 is missing two values.** The authoritative list from OpenAPI and confirmed via `/torrent/search`:

```ts
export const DISCOUNT = [
  'NORMAL', 'PERCENT_70', 'PERCENT_50', 'FREE',
  '_2X_FREE', '_2X', '_2X_PERCENT_50'
] as const;
```

- `PERCENT_70` = 30% discount on download (most common non-NORMAL in the last 50 rows).
- `_2X_PERCENT_50` = upload counted 2×, download 50% discounted.
- Factory-default rule-set (§4.10) whitelist stays `['FREE', '_2X_FREE']` — those are the highest-value.

---

## 7. `POST /torrent/genDlToken?id=<int64>` — CORRECTION TO PRD OQ-3

### Response

```json
{ "code": "0", "message": "SUCCESS",
  "data": "https://api.m-team.cc/api/rss/dlv2?sign=<hex32>&t=<unix_sec>&tid=<id>&uid=<user>" }
```

### TTL / reusability — PRD assumption was wrong

PRD §7.3 FR-DL-02 said *"single-use with unknown TTL; consume immediately"*. Actual behavior from probes:

1. **Not single-use.** Calling genDlToken twice on the same torrent within seconds returns IDENTICAL signed URLs (`sign` + `t` both same if clock second unchanged). After a second rolls over, `t` and `sign` update but both the old and new URL are valid simultaneously.
2. **Time-bounded, not consumption-bounded.** Fetching the URL yields `302 → <CDN>/<torrent file>`. Re-fetching works multiple times within the validity window.
3. **Validity window bounded:**
   - `t` 1 day old → `{code:"1", message:"連結不可用！ 超出有效期"}` (link expired).
   - `t` in the future → `{code:"1", message:"簽名錯誤"}` (sign tampered).
   - Exact TTL boundary not measured (binary search would cost probe budget); **operate as if TTL ≤ 10 minutes** — fetch fresh token immediately before the `qbt torrents/add` call, as FR-DL-04 already requires.

### Behavior adjustments

- `GRAB_TOKEN_EXPIRED` error code still valid, but triggers on `code:"1" + message:"連結不可用！..."` not on "consumed".
- Retry-once logic on expired is simpler: just call `genDlToken` again with current clock.
- The CDN endpoint (`Location: https://fr1.halomt.com?...`) is hit by qBt when it fetches the URL; Harvester does not need to follow the redirect itself.

---

## 8. PRD OQ-2 — `infoHash` in search response

**Resolution: infoHash is essentially never populated in search.** Out of 50 rows sampled, 0 had `infoHash`. Detail endpoint also returned `infoHash: null`. Therefore:

- Do NOT use `infoHash` from M-Team for dedup pre-add.
- The post-add hash comes from `qbt.listTorrents` after the add completes (already matches FR-DL-01 step 4).
- `torrent_events.infohash` stays nullable at insert-time, filled on verify.

---

## 9. `POST /member/profile` — OQ-4 resolution

- **Works without a `uid` query param** (despite OpenAPI marking `uid` required). Empty body, no query — returns the authenticated user's profile. Passing any other user's `uid` returns that user's public fields. We use the empty form.
- **No `UnimplementedMethodError` equivalent** (again — there is no yeast wrapper). OQ-4 answered: profile is directly available.

### Harvester-relevant fields

```ts
{
  id: string,                         // our user's uid
  username: string,
  email: string,
  status: "CONFIRMED" | ...,
  enabled: boolean,
  allowDownload: boolean,             // if false → HARD preflight fail
  memberStatus: {
    vip: boolean, vipUntil: string|null,
    donor: boolean, donorUntil: string|null,
    warned: boolean, warnedUntil: string|null,
    leechWarn: boolean, leechWarnUntil: string|null,
    lastLogin: string, lastBrowse: string
  },
  memberCount: {
    bonus: string,                    // BP / karma
    uploaded: string,                 // total bytes
    downloaded: string,               // total bytes
    shareRate: string,                // ratio as string (Infinity -> "0" if no download, check!)
    charity: string,
    uploadReset: string
  },
  seedtime: string,                   // total seed seconds
  leechtime: string,                  // total leech seconds
  authorities: string[],              // e.g. ["USER_TORRENT","USER_FUN_POST","USER","USER_STORE","USER_OFFER_PUBLISH"]
  releaseCode: string,
  parked: boolean,                    // if true → account in park, abstain
  parentId: string | null,
  role: string                        // numeric role id
}
```

**Tier detection:** there is no explicit "tier" field. The PRD §7.6 emergency-monitor design assumes tier→min_ratio thresholds. **We must derive tier from account age** (`memberStatus.createdDate` → weeks since) or leave the "tier" column empty and rely only on `config.emergency.tier_thresholds` + `memberCount.shareRate`. Recommend: compute `weeks_since_signup = (now - createdDate) / (7*86400)` and pick the highest `tier_thresholds` row with `min_weeks <= weeks`.

(On the probed account, `createdDate = "2026-04-19 06:55:21"` ≈ minutes ago — tier 0, min_ratio 0.0.)

---

## 10. Misc endpoints probed

All captured in `spike/captures/misc-*.json`.

| Endpoint | Status | Use case |
|----------|--------|----------|
| `POST /system/config` | 200 but `code: 1, message: "系統忙碌中請重試..."` | Likely rate-limited / needs params. Don't use. |
| `POST /system/online` | 200 SUCCESS, data = online-user KPI | Optional — not needed for MVP. |
| `POST /system/torrentCount` | 200 SUCCESS, data = `{total, todayAdded, ...}` | Could back a dashboard widget; skip for MVP. |
| `POST /torrent/fav` | 200 SUCCESS with pagination | Not needed for MVP. |
| `POST /rss/fetch` | 200 SUCCESS | Not needed. |

---

## 11. Impact on IMPLEMENTATION.md

### Must change

1. **§3.1 `DISCOUNT` enum** — add `PERCENT_70`, `_2X_PERCENT_50`.
2. **§4.8 MTeamClient** — drop yeast.js code path; raw fetch only. Remove the `forbidden.ts` layer (keep the file as an empty-list sentinel for PRD FR-CP-03 compliance, but it is permanently empty).
3. **§4.8 — `search()` signature** — change `sortBy` to `{ sortField, sortDirection }`.
4. **§4.15 `util/normalize.ts`** — document string-to-number coercion + date parse.
5. **PRD §7.1 FR-PO-01** — correct `sortBy` → `sortField`/`sortDirection`.
6. **PRD §7.3 FR-DL-02** — soften "single-use" to "time-bounded (≤ TTL); refetch on expiry".
7. **PRD §14 OQ table** — close OQ-2 (no infohash), OQ-3 (TTL ≥ seconds, safely ≤ 10 min), OQ-4 (profile works without uid).
8. **IMPLEMENTATION.md §3.1 `MTeamProfile` interface** — replace stub with concrete shape (§9 above).

### Keep as-is

- `NormalizedTorrent` structure is correct; just ensure `normalize()` converts strings + dates.
- `ApiResponse<T>` envelope (Harvester's own, not M-Team's) stays.
- Error codes `MTEAM_AUTH_FAILED`, `MTEAM_RATE_LIMITED`, `MTEAM_UNAVAILABLE` still valid. Map: `code "1"+"key無效"` → `MTEAM_AUTH_FAILED`; `code "401"` → `MTEAM_AUTH_FAILED`; HTTP 5xx → `MTEAM_UNAVAILABLE`; 429 → `MTEAM_RATE_LIMITED`.
- `FORBIDDEN_METHODS` stays empty; `MTEAM_FORBIDDEN_METHOD` remains in enum but should never be thrown in practice.

---

## 12. Close-out checklist

- [x] OQ-1 (tier ratios) — NO tier in profile; compute from `createdDate` + config thresholds. Default thresholds from IMPLEMENTATION.md §4.3 config schema are used as-is.
- [x] OQ-2 (infoHash in search) — confirmed absent. Rely on qBt post-add.
- [x] OQ-3 (genDlToken TTL) — time-bounded URL, idempotent within TTL, old `t` → expired message. Treat as ≤ 10 min.
- [x] OQ-4 (profile accessibility) — direct endpoint; no `UnimplementedMethodError` (no yeast).
- [x] Base URL / auth format / UA gotcha documented.
- [x] Discount enum corrected.

*End of SPIKE_REPORT.md.*
