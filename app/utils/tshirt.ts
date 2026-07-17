/** Minimum temperature (°C) considered warm enough for just a t-shirt. */
export const TSHIRT_MIN_TEMP = 20

/** Dry, fair WMO weather codes (clear → overcast). Precipitation, fog, snow, storms excluded. */
const FAIR_CODES = new Set([0, 1, 2, 3])

/** True when it's warm enough and dry enough to comfortably wear just a t-shirt. */
export function isTshirtWeather(temp: number, code: number): boolean {
  return temp >= TSHIRT_MIN_TEMP && FAIR_CODES.has(code)
}
