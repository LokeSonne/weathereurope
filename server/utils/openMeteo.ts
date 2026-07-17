export const FORECAST_DAYS = 8

export interface DailyTemps {
  /** Max temperature (°C) for day offsets 0 (today) .. 7. */
  tempMax: number[]
  tempMin: number[]
}

interface GridPoint {
  lat: number
  lng: number
}

const CACHE_TTL_SECONDS = 40 * 60
const USER_AGENT = 'weathereurope.app (weather-heatmap demo; contact: loke@resights.dk)'

function cacheKey(step: number, point: GridPoint): string {
  return `forecast:${step}:${point.lat}:${point.lng}`
}

/**
 * Resolves daily forecast temperatures for each point, using the cache where
 * possible and issuing a single bulk Open-Meteo request for the misses.
 */
export async function resolveForecasts(
  points: GridPoint[],
  step: number,
): Promise<Array<GridPoint & DailyTemps>> {
  const storage = useStorage('forecast-cache')
  const results = new Array<(GridPoint & DailyTemps) | undefined>(points.length)
  const misses: Array<{ index: number; point: GridPoint }> = []

  await Promise.all(
    points.map(async (point, index) => {
      const cached = await storage.getItem<DailyTemps>(cacheKey(step, point))
      if (cached) {
        results[index] = { ...point, ...cached }
      } else {
        misses.push({ index, point })
      }
    }),
  )

  if (misses.length > 0) {
    const fetched = await fetchBulkForecast(misses.map((m) => m.point))
    await Promise.all(
      misses.map(async (miss, i) => {
        const temps = fetched[i]!
        results[miss.index] = { ...miss.point, ...temps }
        await storage.setItem(cacheKey(step, miss.point), temps, { ttl: CACHE_TTL_SECONDS })
      }),
    )
  }

  return results.filter((r): r is GridPoint & DailyTemps => r !== undefined)
}

async function fetchBulkForecast(points: GridPoint[]): Promise<DailyTemps[]> {
  const latitude = points.map((p) => p.lat).join(',')
  const longitude = points.map((p) => p.lng).join(',')

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', latitude)
  url.searchParams.set('longitude', longitude)
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min')
  url.searchParams.set('forecast_days', String(FORECAST_DAYS))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('models', 'metno_seamless')

  const response = await $fetch<OpenMeteoResponse | OpenMeteoResponse[]>(url.toString(), {
    headers: { 'User-Agent': USER_AGENT },
  })

  // Open-Meteo returns a single object (not an array) when only one location was requested.
  const entries = Array.isArray(response) ? response : [response]

  return entries.map((entry) => ({
    tempMax: entry.daily.temperature_2m_max.slice(0, FORECAST_DAYS),
    tempMin: entry.daily.temperature_2m_min.slice(0, FORECAST_DAYS),
  }))
}

interface OpenMeteoResponse {
  daily: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
}
