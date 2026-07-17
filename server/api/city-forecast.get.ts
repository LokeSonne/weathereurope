import { resolveForecasts } from '../utils/openMeteo'
import { selectCities, type BBox } from '../utils/cities'

export default defineEventHandler(async (event) => {
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

  const cities = selectCities(bbox, zoom)
  const forecasts = await resolveForecasts(cities.map((c) => ({ lat: c.lat, lng: c.lng })))

  const features = cities.flatMap((city, i) => {
    const forecast = forecasts[i]
    if (!forecast) return []
    return [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [city.lng, city.lat] },
      properties: {
        name: city.name,
        country: city.country,
        capital: city.capital,
        temps: forecast.temps,
        codes: forecast.codes,
      },
    }]
  })

  return { type: 'FeatureCollection' as const, features }
})
