import type { ExpressionSpecification } from 'maplibre-gl'

/** Diverging cold→hot color scale, in °C, shared between the map layer and the legend. */
export const TEMP_STOPS: Array<[temp: number, color: string]> = [
  [-10, '#2166ac'],
  [0, '#67a9cf'],
  [8, '#d1e5f0'],
  [15, '#fddbc7'],
  [22, '#ef8a62'],
  [30, '#b2182b'],
]

export const TEMP_MIN = -10
export const TEMP_MAX = 30

/** Builds a MapLibre `interpolate` color expression for the given feature property, clamped to the scale's domain. */
export function tempColorExpression(propertyName: string): ExpressionSpecification {
  const clamped: ExpressionSpecification = ['max', TEMP_MIN, ['min', TEMP_MAX, ['get', propertyName]]]
  const stops = TEMP_STOPS.flatMap(([temp, color]) => [temp, color])
  return ['interpolate', ['linear'], clamped, ...stops] as unknown as ExpressionSpecification
}
