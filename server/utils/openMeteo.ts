export const FORECAST_DAYS = 8

export interface CityForecast {
  /** Daily high (°C) per day offset 0..7 (0 = today), so it reads as a forecast for planning. */
  temps: number[]
  /** Daily WMO weather code per day offset 0..7 (0 = today). */
  codes: number[]
}

interface CachedForecast extends CityForecast {
  /** Epoch ms the data was fetched — used to distinguish fresh from stale entries. */
  fetchedAt: number
}

interface Point {
  lat: number
  lng: number
}

/** How long a cached entry counts as fresh before we try to refresh it. */
const FRESH_TTL_MS = 40 * 60 * 1000
/** How long entries are retained overall, so we can serve them stale if Open-Meteo is down. */
const HARD_TTL_SECONDS = 24 * 60 * 60
/** Max coordinates per Open-Meteo call; larger fan-outs are split across several calls. */
const BULK_BATCH_SIZE = 100

// Bump the version segment whenever the upstream data or cached shape changes, so a deploy starts
// from a clean cache instead of serving entries fetched under the old assumptions. v2: switched the
// Open-Meteo model from `metno_seamless` (Europe-only) to `best_match` for worldwide coverage.
function cacheKey(point: Point): string {
  return `forecast:v2:${point.lat}:${point.lng}`
}

/**
 * Resolves the per-day forecast for each point. Fresh cache hits are served directly;
 * stale/absent points are refetched in one bulk Open-Meteo call. If that call fails,
 * stale cached data is served as a fallback (points with no cached data at all are
 * returned as `undefined` so the caller can simply omit them) — a single flaky upstream
 * never fails the whole response.
 */
export async function resolveForecasts(points: Point[]): Promise<Array<CityForecast | undefined>> {
  const storage = useStorage('forecast-cache')
  const now = Date.now()
  const results = new Array<CityForecast | undefined>(points.length)
  const misses: Array<{ index: number; point: Point; stale?: CachedForecast }> = []

  // One batched read (a single Redis MGET on the Upstash backend) instead of one GET per point.
  // A cold viewport — or a request engineered to miss the HTTP/edge caches (unique URL each time) —
  // then costs one storage round-trip, not up to MAX_CITIES of them, so cache-busting can't fan a
  // single request out into hundreds of storage commands. Results come back in input order.
  const entries = await storage.getItems(points.map((point) => cacheKey(point)))

  points.forEach((point, index) => {
    const cached = entries[index]?.value as CachedForecast | null | undefined
    if (cached && now - cached.fetchedAt < FRESH_TTL_MS) {
      results[index] = { temps: cached.temps, codes: cached.codes }
    } else {
      misses.push({ index, point, stale: cached ?? undefined })
    }
  })

  if (misses.length === 0) return results

  let fetched: Array<CityForecast | undefined> = []
  try {
    fetched = await fetchBulkForecast(misses.map((m) => m.point))
  } catch (error) {
    // Upstream failed — fall back to stale data where we have it.
    console.error('Open-Meteo request failed; serving stale forecasts where available', error)
  }

  await Promise.all(
    misses.map(async (miss, i) => {
      const fresh = fetched[i]
      if (fresh) {
        results[miss.index] = fresh
        await storage.setItem(
          cacheKey(miss.point),
          { ...fresh, fetchedAt: now } satisfies CachedForecast,
          { ttl: HARD_TTL_SECONDS },
        )
      } else if (miss.stale) {
        results[miss.index] = { temps: miss.stale.temps, codes: miss.stale.codes }
      }
    }),
  )

  return results
}

/**
 * Bulk-fetches forecasts, batching large fan-outs into several Open-Meteo calls so no single URL
 * grows too long and a partial upstream failure only drops its own batch — those points fall back
 * to stale/omit in resolveForecasts rather than failing the whole response.
 */
async function fetchBulkForecast(points: Point[]): Promise<Array<CityForecast | undefined>> {
  const results = new Array<CityForecast | undefined>(points.length)
  const batchCount = Math.ceil(points.length / BULK_BATCH_SIZE)

  await Promise.all(
    Array.from({ length: batchCount }, async (_, b) => {
      const start = b * BULK_BATCH_SIZE
      const batch = points.slice(start, start + BULK_BATCH_SIZE)
      try {
        const fetched = await fetchForecastBatch(batch)
        for (let j = 0; j < fetched.length; j++) results[start + j] = fetched[j]
      } catch (error) {
        console.error('Open-Meteo batch failed; its points fall back to stale/omit', error)
      }
    }),
  )

  return results
}

async function fetchForecastBatch(points: Point[]): Promise<Array<CityForecast | undefined>> {
  const latitude = points.map((p) => p.lat).join(',')
  const longitude = points.map((p) => p.lng).join(',')
  const { openMeteoContact, openMeteoApiKey, openMeteoBaseUrl } = useRuntimeConfig()

  // Endpoint precedence: explicit base URL (self-host) → commercial customer endpoint
  // when an API key is set → free non-commercial API.
  const baseUrl =
    openMeteoBaseUrl ||
    (openMeteoApiKey ? 'https://customer-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast')

  const url = new URL(baseUrl)
  url.searchParams.set('latitude', latitude)
  url.searchParams.set('longitude', longitude)
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code')
  url.searchParams.set('forecast_days', String(FORECAST_DAYS))
  url.searchParams.set('timezone', 'auto')
  // best_match lets Open-Meteo pick the best regional model per coordinate — required for
  // worldwide coverage (the old metno_seamless is a Europe/Nordic-only model).
  url.searchParams.set('models', 'best_match')
  if (openMeteoApiKey) url.searchParams.set('apikey', openMeteoApiKey)

  const response = await $fetch<OpenMeteoResponse | OpenMeteoResponse[]>(url.toString(), {
    headers: { 'User-Agent': `weathereurope.app (contact: ${openMeteoContact})` },
    retry: 1,
    timeout: 10_000,
  })

  // Open-Meteo returns a single object (not an array) when only one location was requested.
  const entries = Array.isArray(response) ? response : [response]

  return entries.map((entry) => {
    if (!entry?.daily) return undefined

    const temps: number[] = new Array(FORECAST_DAYS)
    const codes: number[] = new Array(FORECAST_DAYS)

    // Daily high + dominant code for every day, including today, so it's a forecast.
    for (let day = 0; day < FORECAST_DAYS; day++) {
      temps[day] = Math.round(entry.daily.temperature_2m_max[day]!)
      codes[day] = entry.daily.weather_code[day]!
    }

    return { temps, codes }
  })
}

interface OpenMeteoResponse {
  daily: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    weather_code: number[]
  }
}
