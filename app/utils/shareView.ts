export interface MapView {
  lng: number
  lat: number
  zoom: number
}

export interface ShareState {
  view: MapView
  from: number
  to: number
  tshirt: boolean
}

export interface ParsedShare {
  view?: MapView
  range?: { from: number; to: number }
  tshirt?: boolean
}

/** Highest selectable day offset (today + 7). */
const DAY_MAX = 7

/** Serializes the current map/UI state into a URL query string (no leading `?`). */
export function buildShareQuery(state: ShareState): string {
  const params = new URLSearchParams()
  params.set('lat', state.view.lat.toFixed(3))
  params.set('lng', state.view.lng.toFixed(3))
  params.set('z', state.view.zoom.toFixed(2))
  params.set('from', String(state.from))
  params.set('to', String(state.to))
  if (state.tshirt) params.set('tshirt', '1')
  return params.toString()
}

/**
 * Parses share params back into state, ignoring anything missing or invalid so a
 * hand-edited or partial URL degrades gracefully to defaults.
 */
export function parseShareQuery(query: Record<string, unknown>): ParsedShare {
  const out: ParsedShare = {}

  const lat = toNum(query.lat)
  const lng = toNum(query.lng)
  const zoom = toNum(query.z)
  if (
    lat !== undefined && lng !== undefined && zoom !== undefined &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && zoom >= 0 && zoom <= 22
  ) {
    out.view = { lat, lng, zoom }
  }

  const from = toInt(query.from)
  const to = toInt(query.to)
  if (from !== undefined && to !== undefined) {
    out.range = {
      from: clamp(Math.min(from, to), 0, DAY_MAX),
      to: clamp(Math.max(from, to), 0, DAY_MAX),
    }
  }

  const tshirt = first(query.tshirt)
  if (tshirt !== undefined) out.tshirt = tshirt === '1' || tshirt === 'true'

  return out
}

function first(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' ? v : undefined
}

function toNum(value: unknown): number | undefined {
  const s = first(value)
  if (s === undefined || s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function toInt(value: unknown): number | undefined {
  const n = toNum(value)
  return n === undefined ? undefined : Math.trunc(n)
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
