import { FORECAST_DAYS, resolveForecasts } from '../utils/openMeteo'
import { latticePoints, tierForZoom, type BBox } from '../utils/grid'

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

  const tier = tierForZoom(zoom)
  const points = latticePoints(bbox, tier)
  const forecasts = await resolveForecasts(points, tier.step)

  return {
    type: 'FeatureCollection',
    features: forecasts.map((f) => {
      const properties: Record<string, number> = {}
      for (let day = 0; day < FORECAST_DAYS; day++) {
        properties[`temp_d${day}`] = round1((f.tempMax[day]! + f.tempMin[day]!) / 2)
      }
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
        properties,
      }
    }),
  }
})

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
