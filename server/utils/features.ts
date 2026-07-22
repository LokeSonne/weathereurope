import type { City } from './cities'
import type { CityForecast } from './openMeteo'

/** Builds the GeoJSON features for a set of cities + their (possibly missing) forecasts. */
export function toForecastFeatures(cities: City[], forecasts: Array<CityForecast | undefined>) {
  return cities.flatMap((city, i) => {
    const forecast = forecasts[i]
    if (!forecast) return []
    return [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [city.lng, city.lat] as [number, number] },
        properties: {
          name: city.name,
          country: city.country,
          capital: city.capital,
          temps: forecast.temps,
          codes: forecast.codes,
        },
      },
    ]
  })
}
