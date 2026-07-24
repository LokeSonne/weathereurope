import { resolveForecasts } from '../utils/openMeteo'
import { citiesByIds } from '../utils/cities'
import { toForecastFeatures } from '../utils/features'
import { enforceRateLimit } from '../utils/rateLimit'

/**
 * Forecasts for a set of favorite city ids, independent of the zoom tier — so favorites
 * are always shown when the favorites filter is on. Personalized (the ids are the user's
 * favorites), so the response is never cached at the edge.
 */
export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, { limit: 60, windowSeconds: 60 })

  const body = await readBody<{ ids?: unknown }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : []

  const cities = await citiesByIds(ids)
  const forecasts = await resolveForecasts(cities.map((c) => ({ lat: c.lat, lng: c.lng })))

  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  return { type: 'FeatureCollection' as const, features: toForecastFeatures(cities, forecasts) }
})
