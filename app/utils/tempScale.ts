/**
 * Sun-faded, vintage-travel-poster diverging cold→hot scale (°C) for the temperature pills.
 * Muted teal-blue → cream → terracotta, to sit inside the warm poster palette.
 */
export const TEMP_STOPS: Array<[temp: number, color: string]> = [
  [-10, '#4a7c8c'], // dusty teal-blue
  [0, '#7ba9ac'], // faded teal
  [8, '#d9d3b0'], // pale cream-khaki
  [15, '#e6c88a'], // warm sand
  [22, '#e0996a'], // soft terracotta
  [30, '#cf6b4a'], // sunset rust
]

export const TEMP_MIN = -10
export const TEMP_MAX = 30

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Resolves the scale color for a temperature (°C) as an `rgb(...)` string, clamped to the domain. */
export function tempColor(temp: number): string {
  const t = Math.max(TEMP_MIN, Math.min(TEMP_MAX, temp))
  let lo = TEMP_STOPS[0]!
  let hi = TEMP_STOPS[TEMP_STOPS.length - 1]!
  for (let i = 0; i < TEMP_STOPS.length - 1; i++) {
    if (t >= TEMP_STOPS[i]![0] && t <= TEMP_STOPS[i + 1]![0]) {
      lo = TEMP_STOPS[i]!
      hi = TEMP_STOPS[i + 1]!
      break
    }
  }
  const span = hi[0] - lo[0]
  const f = span === 0 ? 0 : (t - lo[0]) / span
  const [r1, g1, b1] = hexToRgb(lo[1])
  const [r2, g2, b2] = hexToRgb(hi[1])
  const r = Math.round(r1 + (r2 - r1) * f)
  const g = Math.round(g1 + (g2 - g1) * f)
  const b = Math.round(b1 + (b2 - b1) * f)
  return `rgb(${r}, ${g}, ${b})`
}

/** Picks a legible text color (near-black or white) for a pill tinted with {@link tempColor}. */
export function contrastText(temp: number): string {
  const t = Math.max(TEMP_MIN, Math.min(TEMP_MAX, temp))
  let lo = TEMP_STOPS[0]!
  let hi = TEMP_STOPS[TEMP_STOPS.length - 1]!
  for (let i = 0; i < TEMP_STOPS.length - 1; i++) {
    if (t >= TEMP_STOPS[i]![0] && t <= TEMP_STOPS[i + 1]![0]) {
      lo = TEMP_STOPS[i]!
      hi = TEMP_STOPS[i + 1]!
      break
    }
  }
  const span = hi[0] - lo[0]
  const f = span === 0 ? 0 : (t - lo[0]) / span
  const [r1, g1, b1] = hexToRgb(lo[1])
  const [r2, g2, b2] = hexToRgb(hi[1])
  const r = r1 + (r2 - r1) * f
  const g = g1 + (g2 - g1) * f
  const b = b1 + (b2 - b1) * f
  // Perceived luminance (0..255); light pills get deep-teal ink, dark pills get warm cream.
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 150 ? '#1f4b4b' : '#f6efda'
}
