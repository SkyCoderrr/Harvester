# M-Team API Reference

> **Doc ID:** MTEAM_API.md
> **Derived from:** live probes against `https://api.m-team.cc` using a real API key, 2026-04-18. Complete captures in [`spike/captures/`](../spike/captures/).
> **Authoritative for:** Harvester's `src/mteam/client.ts` and anything in the codebase that touches raw M-Team bytes.
> **OpenAPI source:** `https://test2.m-team.cc/api/v3/api-docs` (mirror of the real API schema; note that `test2.m-team.cc` does NOT accept production API keys).

---

## 1. Connection

| Item | Value | Notes |
|------|-------|-------|
| **Base URL** | `https://api.m-team.cc/api` | Trailing `/api` is part of the base; individual paths start with `/torrent/…`, `/member/…`, etc. |
| **Protocol** | HTTPS only | HTTP/2 and HTTP/3 (`alt-svc: h3=":443"`) both advertised |
| **CDN / infra** | Cloudflare | `cf-ray` header on every response |
| **Auth header** | `x-api-key: <KEY>` | **Required.** `Authorization: Bearer` is NOT accepted. |
| **User-Agent** | **MUST be non-default** | **This is the single most important gotcha.** Default curl and bare node-fetch UAs get a `302` → `https://www.google.com/<same-path>`. Any custom UA (even `foo/0.1`) passes. qBittorrent's built-in URL fetcher hits the same trap — Harvester works around it by downloading `.torrent` bytes itself and using multipart upload. |
| **Content-Type** | `application/json` (on bodied calls) | `POST /torrent/search` takes a JSON body; most other routes take query-string params. |

### Canonical request header set

```http
POST /api/member/profile HTTP/1.1
Host: api.m-team.cc
x-api-key: 019xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
User-Agent: harvester/0.1
Accept: application/json
Content-Type: application/json        # only when sending a body
```

---

## 2. Response envelope

Every `/api/*` endpoint returns HTTP 200 (rarely 4xx/5xx from Cloudflare) with this JSON body:

```json
{ "code": "0", "message": "SUCCESS", "data": <any> }
```

| Field | Type | Meaning |
|-------|------|---------|
| `code` | **string** | `"0"` = success. Non-`"0"` is a domain error; the HTTP status stays `200`. **Note:** the OpenAPI schema claims `integer`, but production returns strings. Always coerce via `String(env.code) === '0'`. |
| `message` | string | Human text. Often in **Traditional Chinese** (e.g. `"key無效"`). See §9 for translations. |
| `data` | varies | Payload on success; usually `null` on error. |

### Known `code` values observed

| `code` | Meaning | HTTP shell | Message examples |
|--------|---------|------------|------------------|
| `"0"` | Success | 200 | `"SUCCESS"` |
| `"1"` | Generic failure | 200 | `"key無效"` (invalid key), `"連結不可用！ 超出有效期"` (link expired), `"簽名錯誤"` (signature wrong), `"系統忙碌中請重試"` (system busy) |
| `"401"` | Not authenticated | 200 | `"Full authentication is required to access this resource"` — only seen with **no** `x-api-key` header |

---

## 3. Wire conventions

### 3.1 Every numeric field is a string

Including IDs, sizes, timestamps, seeder/leecher counts, bonus points, ratios. The normalizer in [`src/util/normalize.ts`](../src/util/normalize.ts) is the single place that coerces; downstream code never sees strings for numeric fields.

Example:

```json
{
  "id": "1168978",
  "size": "4919742672",
  "status": { "seeders": "325", "leechers": "307", "timesCompleted": "344" }
}
```

### 3.2 Dates are formatted strings, not epochs

Format: `"YYYY-MM-DD HH:mm:ss"` (24-hour, no timezone suffix).

**Timezone is `Asia/Taipei` (UTC+8).** Confirmed by cross-referencing the response `Date` header with `memberStatus.lastModifiedDate` — a record modified "just before" the response with a timestamp exactly 8 hours ahead of the server's UTC.

Parse helper: [`parseMTeamDate`](../src/util/time.ts) calls `fromZonedTime(s.replace(' ', 'T'), 'Asia/Taipei')` and returns unix seconds.

### 3.3 Discount enum (authoritative)

There are **seven** values in the production OpenAPI spec. Listed highest-value-to-user first:

| Value | Meaning | User impact |
|-------|---------|-------------|
| `_2X_FREE` | Free download + upload counted at 2× | 🟢 Highest value category. Prioritize. |
| `FREE` | Free download | 🟢 No ratio hit; upload counted 1× |
| `_2X_PERCENT_50` | 50% off download + 2× upload | 🟡 Half-cost + bonus credit |
| `PERCENT_50` | 50% off download | 🟡 Half-cost |
| `PERCENT_70` | "Pay 70%", i.e. 30% off download | 🟠 Common sale |
| `_2X` | 2× upload, full-cost download | ⚪ Normal download with upload bonus |
| `NORMAL` | No promotion | ⚪ Pay-as-you-go |

Harvester's UI collapses these onto 4 buckets keyed by download cost (see [`STATUS.md §3.6`](STATUS.md)).

---

## 4. `POST /torrent/search`

Primary poll endpoint.

### Request body (all fields optional)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `mode` | `"normal"\|"adult"\|"movie"\|"music"\|"tvshow"\|"waterfall"\|"rss"\|"rankings"\|"all"` | absent ≈ normal | Section filter |
| `pageNumber` | int 1..1000 | 1 | |
| `pageSize` | int 1..200 | 20 | Harvester uses 50 |
| `sortField` | `"CREATED_DATE"\|"SIZE"\|"SEEDERS"\|"LEECHERS"\|"TIMES_COMPLETED"\|"NAME"` | server default | |
| `sortDirection` | `"ASC"\|"DESC"` | server default | **Note:** IMPLEMENTATION.md originally spec'd `sortBy` as a single field; the real API splits it. |
| `discount` | one of §3.3 | — | Filter to a single discount |
| `keyword` | string, max 100 chars | — | Full-text over name / smallDescr |
| `categories` | int[] | — | Category IDs — numeric. Harvester doesn't map to human names (server-side responsibility). |
| `visible` | int | — | |
| `onlyFav`, `hot`, `offer` | bool | — | |
| `labelsNew` | string[] | — | Human tags like `"中配"`, `"IMAX"` |
| `lastId` | int64 | — | Cursor — fetch items with id < lastId |

Full schema: see `spike/openapi.json` under `#/components/schemas/TorrentSearch`.

### Response `data` shape (Spring Data page)

```ts
{
  pageNumber: string,       // int
  pageSize:   string,       // int
  total:      string,       // capped at 10000 regardless of true count
  totalPages: string,
  data:       Torrent[]     // the rows — note the nested `.data` inside the envelope's `data`
}
```

### `Torrent` row (search + detail share a base)

Observed keys from a live sample (see [`spike/captures/torrent-search-normal.json`](../spike/captures/torrent-search-normal.json) for the full object):

```ts
interface Torrent {
  id: string;                      // int64
  createdDate: string;             // "YYYY-MM-DD HH:mm:ss" Asia/Taipei
  lastModifiedDate: string;
  name: string;
  smallDescr: string;
  imdb: string;                    // empty string, not null, when absent
  imdbRating: string | null;
  douban: string;
  doubanRating: string | null;
  dmmCode: string;
  author: string | null;
  category: string;                // int id
  source: string | null;           // int id
  medium: string | null;           // int id
  standard: string | null;         // int id
  videoCodec: string | null;       // int id
  audioCodec: string | null;       // int id
  team: string | null;             // int id
  processing: string | null;       // int id
  countries: string[];             // int ids
  numfiles: string;
  size: string;                    // bytes
  labels: string;
  labelsNew: string[];              // human tags
  msUp: string;
  anonymous: boolean;
  infoHash: string | null;         // ⚠ Almost always null in search; see §4.1
  status: {
    id: string;
    createdDate: string;
    lastModifiedDate: string;
    pickType: "normal" | string;
    toppingLevel: string;
    toppingEndTime: string | null;
    discount: Discount;
    discountEndTime: string | null;   // null when discount == NORMAL
    timesCompleted: string;
    comments: string;
    lastAction: string;
    lastSeederAction: string;
    views: string;
    hits: string;
    support: string;
    oppose: string;
    status: "NORMAL" | string;
    seeders: string;
    leechers: string;
    banned: boolean;
    visible: boolean;
    promotionRule: unknown | null;
    mallSingleFree: unknown | null;
  };
  dmmInfo: unknown | null;
  editedBy: string | null;
  editDate: string | null;
  collection: boolean;
  inRss: boolean;
  canVote: boolean;
  imageList: string[];
  resetBox: unknown | null;
}
```

### 4.1 `infoHash` is effectively never populated

Out of 50 probed rows, **0** had `infoHash` set. PRD OQ-2 is closed: do not rely on M-Team for the hash. Post-add qBt enumeration is the source of truth (see [`downloader.ts`](../src/workers/downloader.ts) — the verify step matches added torrent to `name + size_bytes`).

### 4.2 Recommended poll request

What the Harvester poller sends:

```json
{
  "mode": "normal",
  "pageNumber": 1,
  "pageSize": 50,
  "sortField": "CREATED_DATE",
  "sortDirection": "DESC"
}
```

---

## 5. `POST /torrent/detail`

Fetch one torrent with extras.

### Query params

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | int64 | ✅ | Torrent id |
| `origin` | string | spec says ✅, reality says ❌ | `"web"` works. Calls with `origin` omitted also succeed in practice. |

### Response `data`

Same `Torrent` shape as search, plus:

- `descr: string` — BBCode / markdown body
- `nfo: string | null`
- `mediainfo: string` — full `mediainfo -e` output
- `originFileName: string` — the server's `.torrent` filename
- `cids: unknown | null`, `aids: unknown | null`
- `scope: "NORMAL" | ...`, `scopeTeams: unknown | null`
- `thanked: boolean`, `rewarded: boolean`
- `albumList: unknown | null`

Full sample: [`spike/captures/torrent-detail.json`](../spike/captures/torrent-detail.json).

---

## 6. `POST /torrent/genDlToken`

Request a signed URL that yields the `.torrent` file.

### Query params

| Field | Type | Required |
|-------|------|----------|
| `id` | int64 | ✅ |

No body.

### Response `data` — a string URL

```json
{
  "code": "0",
  "message": "SUCCESS",
  "data": "https://api.m-team.cc/api/rss/dlv2?sign=<32hex>&t=<unix_sec>&tid=<id>&uid=<user>"
}
```

URL components:
- `sign` — HMAC of `(tid, t, uid, secret)` — **deterministic within the same clock-second.**
- `t` — unix seconds at the moment the server generated the URL.
- `tid` — torrent id.
- `uid` — authenticated user's id.

### 6.1 Reusability and TTL — PRD OQ-3 resolved

**The URL is NOT single-use.** It's a time-bounded signed URL. Behavior:

| Scenario | Result |
|----------|--------|
| Call `genDlToken` twice in the same second | Identical `t` + `sign` returned |
| Call again the next second | New `t`, new `sign` — both old and new URLs valid simultaneously |
| Fetch the URL multiple times | Works every time within the validity window |
| Fetch with a far-past `t` (1 day old) | `{code:"1", message:"連結不可用！ 超出有效期"}` = link expired |
| Fetch with a far-future `t` | `{code:"1", message:"簽名錯誤"}` = signature wrong |
| Fetch with a tampered `sign` | Same — signature wrong |

**Practical TTL:** not measured precisely, but at least minutes and less than a day. Harvester treats this as **≤ 10 minutes safe** ([`GENDL_TOKEN_TTL_SEC`](../shared/constants.ts)) and always generates a fresh token immediately before adding to qBt.

### 6.2 Downloading the `.torrent` from the signed URL

The URL responds with a **302** to a CDN edge (`fr1.halomt.com?app_id=1&playload=…`). The final response is a valid bencoded `.torrent` file (starts with `d`).

**The UA check from §1 applies to this URL as well.** A default User-Agent gets `302` → `https://www.google.com/api/rss/dlv2?…` which returns 404. That's why Harvester fetches the `.torrent` itself with the configured UA and passes the bytes to qBt:

```ts
const res = await fetch(tokenUrl, {
  headers: { 'User-Agent': config.mteam.user_agent, Accept: 'application/x-bittorrent, */*' },
  redirect: 'follow',
});
const buf = Buffer.from(await res.arrayBuffer());
// validate: buf[0] === 0x64 /* 'd' */ && buf.length >= 64
await qbt.addTorrent({ torrentFile: buf, tags, savepath, paused: false });
```

---

## 7. `POST /member/profile`

### Query params

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `uid` | int64 | spec says ✅, reality says ❌ | **Omit to get the authenticated user's own profile.** Pass another user's id to read their public fields. |

No body.

### Response `data` — authenticated-user profile

Harvester-relevant fields from the live probe:

```ts
interface MTeamProfile {
  id: string;                          // our user's uid
  createdDate: string;                 // signup time — used to derive account-age tier
  lastModifiedDate: string;
  username: string;
  email: string;
  status: "CONFIRMED" | string;
  enabled: boolean;
  ip: string;                          // user's current IP per M-Team
  country: string;                     // int id
  gender: "MALE" | "FEMALE" | string;
  privacy: "NORMAL" | string;
  language: string | null;
  allowDownload: boolean;              // ⚠ if false, grabs will be rejected server-side
  parked: boolean;                     // if true, account is in "park" — abstain from grabs
  parentId: string | null;             // invite chain
  role: string;                        // numeric role id
  authorities: string[];               // e.g. ["USER_TORRENT", "USER", "USER_STORE", "USER_OFFER_PUBLISH"]
  releaseCode: string;
  anonymous: boolean;
  enabledTfa: boolean;
  seedtime: string;                    // total seconds seeding
  leechtime: string;                   // total seconds leeching
  torrentCommentCount: string;
  seekCommentCount: string;
  forumCommentCount: string;
  ipCount: string;

  memberStatus: {
    createdDate: string;
    lastModifiedDate: string;
    id: string;
    vip: boolean;
    vipUntil: string | null;
    vipAdded: string | null;
    vipDuties: string | null;
    donor: boolean;
    donorUntil: string | null;
    noad: boolean;
    noadUntil: string | null;
    warned: boolean;
    warnedUntil: string | null;
    leechWarn: boolean;
    leechWarnUntil: string | null;
    lastLogin: string;
    lastBrowse: string;
    lastTracker: string | null;
    lastChangePwd: string | null;
  };

  memberCount: {
    createdDate: string;
    lastModifiedDate: string;
    id: string;
    bonus: string;                     // BP / karma points
    uploaded: string;                  // total bytes
    downloaded: string;                // total bytes
    shareRate: string;                 // ratio as decimal string ("85.896")
    charity: string;
    uploadReset: string;
  };

  config: {
    trackerDomain: string;
    downloadDomain: string;
    rssDomain: string;
    blockCategories: string[];
    hideFun: boolean;
    showThumbnail: boolean;
    timeType: "timeAlive" | string;
    anonymous: boolean;
    trackerDisableSeedbox: boolean;
  };

  // Not typically needed
  avatarUrl: string | null;
  title: string | null;
  info: string | null;
  invites: string;
  limitInvites: string;
  staffPosition: string | null;
  staffDuties: string | null;
  roles: unknown | null;
  telegramUserName: string | null;
  telegramChatId: string | null;
  acceptpms: "yes" | "no";
  deletepms: boolean;
  savepms: boolean;
  commentpm: boolean;
  magicgivingpm: boolean;
  downloadSpeed: string;
  uploadSpeed: string;
  isp: string;
  friend: boolean;
  block: boolean;
}
```

### 7.1 Tier derivation

M-Team doesn't return a tier directly. Harvester derives it from account age:

```ts
weeks = (now - parseMTeamDate(profile.createdDate)) / (7 * 86400);
// Pick the highest tier threshold where weeks >= min_weeks.
```

Default thresholds from [`src/config/schema.ts`](../src/config/schema.ts):

| `min_weeks` | `min_ratio` |
|-------------|-------------|
| 0 | 0.0 |
| 4 | 1.0 |
| 8 | 2.0 |
| 12 | 3.0 |
| 16 | 4.0 |

Tier label surfaces as `"T+{min_weeks}w"` (e.g. `T+8w` for 8+ weeks).

---

## 8. Other endpoints probed (not used by Harvester)

| Endpoint | Status | Payload | Notes |
|----------|--------|---------|-------|
| `POST /system/config` | 200 `{code:"1"}` | — | Returned `"系統忙碌中請重試..."` (system busy). Avoid. |
| `POST /system/online` | 200 SUCCESS | `{totalOnline, signInOnline, …}` | Online-user KPI |
| `POST /system/torrentCount` | 200 SUCCESS | `{total, todayAdded, …}` | Could back a dashboard widget; unused |
| `POST /torrent/fav` | 200 SUCCESS | Paginated | User's favorited torrents |
| `POST /rss/fetch` | 200 SUCCESS | — | RSS pull |

Full captures in `spike/captures/misc-*.json`.

### Forbidden methods

PRD FR-CP-03 requires avoiding any method the sanctioned SDK flagged as `UnimplementedMethodError`. Because Harvester uses **raw fetch** (not yeast.js or any SDK), there is nothing gated behind a forbidden flag. [`src/mteam/forbidden.ts`](../src/mteam/forbidden.ts) exports a permanently empty list as an audit-trail sentinel.

---

## 9. Error message catalog

Production error messages are in Traditional Chinese. Harvester's client maps them to `HarvesterError` codes; the UI displays user-friendly English equivalents.

| M-Team message | English | HarvesterError code |
|----------------|---------|----------------------|
| `key無效` | "Invalid API key" | `MTEAM_AUTH_FAILED` |
| `Full authentication is required to access this resource` | No API key sent | `MTEAM_AUTH_FAILED` |
| `連結不可用！ 超出有效期` | "Link unavailable — expired" | `GRAB_TOKEN_EXPIRED` |
| `簽名錯誤` | "Signature error" | `MTEAM_BAD_RESPONSE` |
| `系統忙碌中請重試` | "System busy, retry" | `MTEAM_UNAVAILABLE` (retryable) |
| any HTTP 429 | Cloudflare rate limit | `MTEAM_RATE_LIMITED` (retryable) |
| any HTTP 5xx | Gateway issue | `MTEAM_UNAVAILABLE` (retryable) |
| any other `code !== "0"` | Domain error | `MTEAM_BAD_RESPONSE` |

Mapping is in [`src/mteam/client.ts`](../src/mteam/client.ts) — search for `codeStr`.

---

## 10. Rate-limiting and etiquette

| Policy | Value |
|--------|-------|
| Poll interval (Harvester default) | 90 s (hard floor 60 s in config loader) |
| Retry strategy | 3 attempts, 1 s / 2 s / 4 s backoff, only when `retryable: true` |
| Request timeout | 15 s total (5 s connect, 10 s read) via `AbortController` |
| Concurrency | 1 in-flight poll at a time (enforced by `loopWorker`'s running-flag guard) |
| Per-call metrics | `mteam.calls.total`, `mteam.calls.errors`, `mteam.calls.duration_ms` histogram |

Harvester is a single-user tool; one instance ≈ one slow curl loop. Rate limits have never been hit in testing.

---

## 11. Deployment checklist

If you're integrating the M-Team API into anything downstream of Harvester:

- [ ] Set a custom, identifiable `User-Agent` — not the default your HTTP lib ships with.
- [ ] Coerce every numeric field with `parseInt`/`parseFloat`; don't `JSON.parse` and trust the types.
- [ ] Parse dates with `Asia/Taipei` as the source timezone.
- [ ] Check `String(env.code) === '0'` before trusting `env.data`.
- [ ] For `genDlToken` URLs: fetch with your own UA; the CDN follow-redirect also needs it.
- [ ] Handle the 7-value `Discount` enum; don't truncate to the 6 values the original spec listed.
- [ ] Don't expect `infoHash` in `/torrent/search` responses — look it up from qBt post-add.
- [ ] Don't assume `genDlToken` is single-use; it's time-bounded (safe ≤ 10 min).

---

## 12. Source of truth

- This doc + [`spike/SPIKE_REPORT.md`](../spike/SPIKE_REPORT.md) for behavior.
- [`spike/openapi.json`](../spike/openapi.json) for the raw server-side Swagger.
- [`spike/captures/`](../spike/captures/) for annotated live responses.
- [`src/mteam/client.ts`](../src/mteam/client.ts) for the canonical client implementation.
- [`src/util/normalize.ts`](../src/util/normalize.ts) for the wire → domain translator.

*End of MTEAM_API.md.*
