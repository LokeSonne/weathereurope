import { resolveForecasts } from '../utils/openMeteo'
import { selectCities, type BBox } from '../utils/cities'
import { toForecastFeatures } from '../utils/features'
import { enforceRateLimit } from '../utils/rateLimit'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, { limit: 60, windowSeconds: 60 })

  const query = getQuery(event)

  const bbox: BBox = {
    minLng: Number(query.minLng),
    minLat: Number(query.minLat),
    maxLng: Number(query.maxLng),
    maxLat: Number(query.maxLat),
  }
  const zoom = Number(query.zoom)

  if (Object.values(bbox).some(Number.isNaN) || Number.isNaN(zoom)) {
    throw createError({ statusCode: 400, statusMessage: 'minLng, minLat, maxLng, maxLat and zoom are required numeric query params' })
  }

  const cities = await selectCities(bbox, zoom)
  const forecasts = await resolveForecasts(cities.map((c) => ({ lat: c.lat, lng: c.lng })))

  // Quantized requests (see WeatherMap.refreshData) make identical viewports share a URL, so the
  // browser max-age lets the client's own HTTP cache serve repeat/nearby views with no roundtrip.
  // s-maxage keeps the CDN (e.g. Vercel's edge) absorbing cross-user traffic without re-invoking
  // the function, and stale-while-revalidate keeps serving slightly stale data while it refreshes.
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600')

  return { type: 'FeatureCollection' as const, features: toForecastFeatures(cities, forecasts) }
})
