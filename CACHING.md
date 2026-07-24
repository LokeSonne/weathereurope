# Caching strategy

T-Shirt Weather fetches 8-day forecasts for cities worldwide from [Open-Meteo](https://open-meteo.com/).
The dataset is large (tens of thousands of cities) but changes slowly, and Open-Meteo's free tier is
non-commercial and rate-limited — so the app is built to hit the upstream API as rarely as
possible while still feeling live. It does this with **three stacked caches** plus a request
design that makes them hit far more often than raw viewport requests would. Separately, the *city
metadata* itself is chunked and loaded on demand — see [City data chunking](#city-data-chunking).

```
┌─────────────┐   quantized URL      ┌─────────────┐   s-maxage        ┌──────────────┐   forecast:lat:lng
│   Browser   │ ───────────────────▶ │  CDN / edge │ ────────────────▶ │  Nitro fn    │ ──────────────────▶ Open-Meteo
│  HTTP cache │  max-age=300         │ (Vercel)    │  SWR=3600         │  + KV cache  │  40-min fresh /        (best_match)
└─────────────┘                      └─────────────┘                   └──────────────┘  24-h stale-on-error
   per-user, 5 min                      cross-user, 5 min                 shared, per-city, durable
```

Each layer is keyed differently and covers a different failure mode, so a request can be
satisfied at any level and only a genuine cold miss reaches Open-Meteo.

| Layer | Where | Key | Fresh window | Purpose |
| --- | --- | --- | --- | --- |
| 1. Browser HTTP cache | Client | Full request URL | `max-age=300` (5 min) | Repeat/nearby views with **no roundtrip** |
| 2. CDN / edge cache | Vercel edge | Full request URL | `s-maxage=300` + `stale-while-revalidate=3600` | Absorb **cross-user** traffic without re-invoking the function |
| 3. Forecast data cache | Nitro storage (Upstash Redis / in-memory) | `forecast:{lat}:{lng}` per city | 40 min fresh, 24 h stale-on-error | Reuse per-city data across viewports; survive Open-Meteo outages |

The layers are set in three places:

- HTTP/CDN headers — [server/api/city-forecast.get.ts:30](server/api/city-forecast.get.ts#L30)
- Request quantization (what makes layers 1 & 2 hit) — [app/components/WeatherMap.vue:298-345](app/components/WeatherMap.vue#L298-L345)
- Server data cache — [server/utils/openMeteo.ts](server/utils/openMeteo.ts)
- Storage backend wiring — [nuxt.config.ts:1-14,69-71](nuxt.config.ts#L1-L14)

---

## Layer 1 & 2 — HTTP caching (browser + edge)

The `/api/city-forecast` endpoint returns:

```
Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=3600
```

- **`max-age=300`** — the browser's own HTTP cache serves the same URL for 5 minutes with no
  network request at all.
- **`s-maxage=300`** — the CDN (Vercel's edge) caches the same URL for 5 minutes across *all*
  users, so a popular viewport is computed once and replayed to everyone.
- **`stale-while-revalidate=3600`** — for up to an hour past expiry the edge keeps serving the
  stale response instantly while it revalidates in the background, so users never wait on a
  refresh.

### Why quantization is the point

HTTP caches key on the exact URL. If every map pan sent its raw `bounds`/`zoom` (high-precision
floats), practically every request would be unique and layers 1 & 2 would almost never hit.

So before fetching, [`refreshData()`](app/components/WeatherMap.vue#L298) **snaps the request to a
grid** so nearby and repeat viewports collapse onto an identical URL:

- **Zoom** snaps to its selection tier with `Math.ceil(zoom)`. City selection
  (`minPopForZoom` in [server/utils/cities.ts](server/utils/cities.ts#L50)) is constant on each
  `(n-1, n]` interval, so rounding up to the tier reproduces the exact same city set the raw zoom
  would have selected — no visible change, many more collisions.
- **Bounding box** snaps *outward* to a zoom-scaled grid (`grid = 360 / 2^(zoomTier+1)`):
  `minLng/minLat` floor to the grid, `maxLng/maxLat` ceil to it. Small pans stay inside the same
  cell (cache hit), and because the box is padded slightly beyond the visible view, the extra
  cities are already loaded and appear instantly as you pan into them.

Trade-off: a coarser grid means more cache hits but more over-fetch (and, at the highest zooms, a
denser area that the server's `MAX_CITIES` cap may trim at the edges). The current `2^(zoomTier+1)`
grid is tuned to keep small pans within one cell.

### Cache busting at midnight

Forecasts are indexed by **offset from "today"** (index `0` = today … `7` = +7 days). A response
cached across the local date boundary would therefore show the wrong day at index 0. To prevent
that, the client appends a **`day` param** (`YYYY-M-D`, local calendar day — see
[`localDay()`](app/components/WeatherMap.vue#L293)). The server ignores it; it exists only to change
the URL, so at local midnight every cached URL is invalidated and the browser/edge re-request.

---

## Layer 3 — Server-side forecast data cache

Even with layers 1 & 2, cold misses and background revalidations still reach the serverless
function. Layer 3 keeps *those* from hammering Open-Meteo. It lives in
[`resolveForecasts()`](server/utils/openMeteo.ts#L36) and caches **per city**, keyed
`forecast:{lat}:{lng}` — not per viewport. This is the highest-leverage cache: overlapping
viewports, different zoom tiers, and even the favorites endpoint all share the same per-city
entries, so a city fetched once is reused everywhere it appears.

Two TTLs govern each entry:

- **`FRESH_TTL_MS` = 40 min** — within this window the cached entry is served directly, no upstream
  call. (Deliberately longer than the 5-min HTTP TTL, so the edge can expire and revalidate several
  times while the server still answers from cache — Open-Meteo sees at most ~1 fetch per city per
  40 min.)
- **`HARD_TTL_SECONDS` = 24 h** — how long entries are *retained* so they can be served **stale** if
  Open-Meteo is unavailable.

Resolution flow for a batch of points:

1. Read every point from cache. Points fresh (`< 40 min`) are served immediately.
2. Stale or absent points are collected and refetched in **one bulk Open-Meteo call**
   ([`fetchBulkForecast`](server/utils/openMeteo.ts#L82)) — many coordinates in a single request.
3. On success, results are written back with the 24-h TTL.
4. **On upstream failure**, stale cached data is served where it exists; points with no cached data
   at all are returned as `undefined` and simply omitted by the caller. A single flaky upstream call
   never fails the whole response — this is the **stale-while-error** guarantee.

### Storage backend

The cache uses Nitro's storage abstraction, so the backend is swappable via
[nuxt.config.ts](nuxt.config.ts#L69):

- **Production (recommended): Upstash Redis.** When `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN` (or Vercel-KV-style `KV_REST_API_URL` / `KV_REST_API_TOKEN`) are
  present at build time, both the `forecast-cache` and `ratelimit` mounts point at Upstash — a
  **shared, durable** store across all serverless instances.
- **Local dev / no credentials: in-memory.** Nitro falls back to per-instance memory. This works,
  but on serverless it's wiped on every cold start and not shared between instances, so hit rates
  collapse and each instance re-hits Open-Meteo. That's why Upstash is strongly recommended in prod.

> The credentials are read at **build time** (Vercel injects them then), so the driver is baked into
> the deployed bundle. If you add them after a deploy, **redeploy** for them to take effect.

---

## What is *not* cached

The favorites endpoint [`/api/favorites-forecast`](server/api/favorites-forecast.post.ts) is
**personalized** — the request body is the individual user's favorite city ids — so it must never be
shared across users. It:

- is a **POST** (not GET), so it's not URL-cacheable to begin with, and
- sends `Cache-Control: private, no-store`, so neither the browser nor the edge stores it.

It still benefits from **Layer 3**: the underlying per-city forecast entries are the same shared
`forecast:{lat}:{lng}` records, so a favorited city that also appears on the map is served from cache
without an extra Open-Meteo call. Only the *response assembly* is un-cached, not the data behind it.

---

## City data chunking

Everything above caches **forecasts** (volatile). The **city metadata** — names, coordinates,
population — is a separate concern: it's large (tens of thousands of cities worldwide) but
effectively immutable, changing only when the dataset is regenerated. So it's cached completely
differently, and it's split so the server never loads it all at once.

[`build-cities.mjs`](scripts/build-cities.mjs) emits three things:

- **`cities-prominent.json`** — capitals + every city with pop ≥ `PROMINENT_FLOOR` (100k), ~6k
  cities (~0.5 MB). Imported at boot; a fast in-memory scan serves every wide/mid-zoom view.
- **`cities/{cx}_{cy}.json`** — the long tail (smaller cities) bucketed into a `CELL_DEG`° (10°)
  spatial grid, ~260 files. **Not** in the JS bundle — declared as Nitro
  [`serverAssets`](nuxt.config.ts) and read via `useStorage('assets:cities')`.
- **`cities-manifest.json`** — grid config + the set of non-empty cells.

[`selectCities`](server/utils/cities.ts) uses the prominent index alone until the zoom threshold
drops below `PROMINENT_FLOOR` (zoom ≳ 8); only then does it load the handful of tail chunks the
(small, zoomed-in) viewport overlaps. Loaded chunks are held in a module-level **LRU**, so a warm
instance and small pans hit memory. Adjacency falls out for free: the client already pads its
request bbox outward ([quantization](#why-quantization-is-the-point)), so cells just beyond the
viewport are loaded before you pan into them.

**Caching angle:**

- **Boot cost is capped** at the ~0.5 MB prominent index regardless of how deep the tail goes —
  this is what let us use the full-detail global dataset instead of trading coverage for bundle size.
- **Tail chunks are immutable.** They change only on a data rebuild, so they can be cached far
  harder than forecasts — the LRU never needs invalidation within a deploy, and if a chunk is ever
  served over HTTP it can carry `immutable` / a content-hashed name.
- **Favorites resolve without a full scan.** A favorite id *is* `"lng,lat"`, so
  [`citiesByIds`](server/utils/cities.ts) derives each id's cell, groups ids by cell, and loads only
  those chunks (prominent favorites resolve straight from the in-memory index).

---

## Related: rate limiting

Not a cache, but it shares the same storage backend. [`enforceRateLimit`](server/utils/rateLimit.ts)
uses the `ratelimit` mount for a best-effort per-IP fixed-window limiter (currently **60 req/min**,
set in the endpoint handlers). Backed by Upstash it's shared across instances; in dev it's
per-instance. It's an abuse backstop, not a billing gate — the get/set isn't atomic, so it can
slightly undercount under bursts.

---

## Tuning knobs

| Knob | Location | Effect |
| --- | --- | --- |
| HTTP `max-age` / `s-maxage` / `stale-while-revalidate` | [city-forecast.get.ts:30](server/api/city-forecast.get.ts#L30) | Browser + edge freshness / stale-serve window |
| `FRESH_TTL_MS` (40 min) | [openMeteo.ts:21](server/utils/openMeteo.ts#L21) | How long a server entry counts as fresh before refetch |
| `HARD_TTL_SECONDS` (24 h) | [openMeteo.ts:23](server/utils/openMeteo.ts#L23) | How long entries are retained for stale-on-error serving |
| Quantization grid `2^(zoomTier+1)` | [WeatherMap.vue:330](app/components/WeatherMap.vue#L330) | Cache-hit rate vs over-fetch |
| Rate limit `60 / 60s` | [city-forecast.get.ts:7](server/api/city-forecast.get.ts#L7), [favorites-forecast.post.ts:12](server/api/favorites-forecast.post.ts#L12) | Per-IP request ceiling |
| Storage driver | [nuxt.config.ts](nuxt.config.ts) (`nitro.storage`) | Upstash / KV / in-memory / other Nitro driver |
| `MAX_CITIES` (250) | [cities.ts](server/utils/cities.ts) | Cities per response; bounds the Open-Meteo fan-out |
| `PROMINENT_FLOOR` (100k) / `CELL_DEG` (10°) | [build-cities.mjs](scripts/build-cities.mjs) | Bundled-index size vs on-demand tail; chunk granularity |
| Tail-chunk LRU size (64) | [cities.ts](server/utils/cities.ts) | How many tail cells stay hot in memory per instance |

## Known edges

- The server data cache is keyed by coordinates only (**not** by day). The client's `day` param
  busts the HTTP layers at the *viewer's* local midnight, but a server entry fetched shortly before
  midnight can still be within its 40-min fresh window just after, so for a brief window index 0 may
  reflect the previous day until the entry ages out. Now that coverage is worldwide, the `day` param
  is also just the viewer's local day, while each city's forecast is indexed by *its own* local day
  (`timezone=auto`) — a small pre-existing approximation that's more visible across far-apart
  timezones. Shorten `FRESH_TTL_MS` or key the cache by day if this matters for your deployment.
- Quantization pads the fetch beyond the visible viewport; at the highest zoom tiers a dense padded
  area can exceed `MAX_CITIES` ([cities.ts](server/utils/cities.ts)) and be trimmed at the edges.
