import { resolveForecasts } from '../utils/openMeteo'
import { citiesByIds } from '../utils/cities'
import { toForecastFeatures } from '../utils/features'
import { enforceRateLimit } from '../utils/rateLimit'

/**
 * Forecasts for a set of favorite city ids, independent of the zoom tier — so favorites
 * are always shown when the favorites filter is on. Personalized (the ids are the user's
 * favorites), so the response is never cached at the edge.
 */
/** Reject oversized bodies before parsing. ~200 ids × ~30 chars ≈ 6 KB; 32 KB is generous headroom. */
const MAX_BODY_BYTES = 32 * 1024

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, { limit: 60, windowSeconds: 60 })

  // Cheap early reject so a huge payload isn't parsed into memory first (ids are capped to
  // MAX_FAVORITES downstream regardless). Streamed bodies without Content-Length still hit
  // Vercel's platform body-size limit.
  if (Number(getHeader(event, 'content-length') ?? 0) > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Payload too large' })
  }

  const body = await readBody<{ ids?: unknown }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : []

  const cities = await citiesByIds(ids)
  const forecasts = await resolveForecasts(cities.map((c) => ({ lat: c.lat, lng: c.lng })))

  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  return { type: 'FeatureCollection' as const, features: toForecastFeatures(cities, forecasts) }
})
