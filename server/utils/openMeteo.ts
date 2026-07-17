export const FORECAST_DAYS = 8

export interface CityForecast {
  /** Display temperature (°C) per day offset 0..7. Day 0 is the live/current temperature; 1..7 are daily highs. */
  temps: number[]
  /** WMO weather code per day offset 0..7. Day 0 is the current condition; 1..7 are the daily code. */
  codes: number[]
}

interface Point {
  lat: number
  lng: number
}

const CACHE_TTL_SECONDS = 40 * 60
const USER_AGENT = 'weathereurope.app (city weather map demo; contact: loke@resights.dk)'

function cacheKey(point: Point): string {
  return `forecast:${point.lat}:${point.lng}`
}

/**
 * Resolves the per-day forecast for each point, serving cache hits directly and
 * issuing a single bulk Open-Meteo request for the misses.
 */
export async function resolveForecasts(points: Point[]): Promise<Array<CityForecast | undefined>> {
  const storage = useStorage('forecast-cache')
  const results = new Array<CityForecast | undefined>(points.length)
  const misses: Array<{ index: number; point: Point }> = []

  await Promise.all(
    points.map(async (point, index) => {
      const cached = await storage.getItem<CityForecast>(cacheKey(point))
      if (cached) {
        results[index] = cached
      } else {
        misses.push({ index, point })
      }
    }),
  )

  if (misses.length > 0) {
    const fetched = await fetchBulkForecast(misses.map((m) => m.point))
    await Promise.all(
      misses.map(async (miss, i) => {
        const forecast = fetched[i]
        if (!forecast) return
        results[miss.index] = forecast
        await storage.setItem(cacheKey(miss.point), forecast, { ttl: CACHE_TTL_SECONDS })
      }),
    )
  }

  return results
}

async function fetchBulkForecast(points: Point[]): Promise<Array<CityForecast | undefined>> {
  const latitude = points.map((p) => p.lat).join(',')
  const longitude = points.map((p) => p.lng).join(',')

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', latitude)
  url.searchParams.set('longitude', longitude)
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code')
  url.searchParams.set('current', 'temperature_2m,weather_code')
  url.searchParams.set('forecast_days', String(FORECAST_DAYS))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('models', 'metno_seamless')

  const response = await $fetch<OpenMeteoResponse | OpenMeteoResponse[]>(url.toString(), {
    headers: { 'User-Agent': USER_AGENT },
  })

  // Open-Meteo returns a single object (not an array) when only one location was requested.
  const entries = Array.isArray(response) ? response : [response]

  return entries.map((entry) => {
    if (!entry?.daily || !entry.current) return undefined

    const temps: number[] = new Array(FORECAST_DAYS)
    const codes: number[] = new Array(FORECAST_DAYS)

    // Day 0 shows the live conditions; later days show the daily high + dominant code.
    temps[0] = Math.round(entry.current.temperature_2m)
    codes[0] = entry.current.weather_code
    for (let day = 1; day < FORECAST_DAYS; day++) {
      temps[day] = Math.round(entry.daily.temperature_2m_max[day]!)
      codes[day] = entry.daily.weather_code[day]!
    }

    return { temps, codes }
  })
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number
    weather_code: number
  }
  daily: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    weather_code: number[]
  }
}
