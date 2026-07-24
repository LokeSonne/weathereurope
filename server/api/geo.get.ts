/**
 * Coarse IP geolocation for the initial map view, from Vercel's edge headers (city-level, no client
 * permission prompt, no external service). Returns the approximate {lat, lng} + a regional open zoom,
 * or an empty object when unavailable (off-Vercel — e.g. local dev — the headers are absent), so the
 * client falls back to the world overview. Personalized, so it must never be cached at the edge.
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const lat = Number(getHeader(event, 'x-vercel-ip-latitude'))
  const lng = Number(getHeader(event, 'x-vercel-ip-longitude'))

  const valid =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -85 &&
    lat <= 85 &&
    lng >= -180 &&
    lng <= 180 &&
    // (0, 0) is the "unknown location" null island, not a real visitor.
    !(lat === 0 && lng === 0)

  if (!valid) return {}

  // Regional zoom — opens on the visitor's country/area rather than a single city or the whole world.
  return { lat, lng, zoom: 5 }
})
