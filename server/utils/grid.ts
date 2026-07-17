// Europe bounding box: Iceland/Canaries to the Urals/Cyprus.
export const EUROPE_BOUNDS = {
  minLng: -25,
  minLat: 34,
  maxLng: 45,
  maxLat: 72,
}

export interface GridTier {
  /** Lattice step in degrees. */
  step: number
  /** Whether the whole Europe bbox is used instead of the requested viewport. */
  wholeContinent: boolean
}

export function tierForZoom(zoom: number): GridTier {
  if (zoom <= 5) return { step: 2, wholeContinent: true }
  if (zoom <= 8) return { step: 0.5, wholeContinent: false }
  return { step: 0.15, wholeContinent: false }
}

export interface BBox {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

const MAX_POINTS = 400

/**
 * Generates lattice points snapped to a fixed global grid (multiples of `step`),
 * clipped to `bbox`. Snapping to a fixed lattice (rather than centering on the
 * viewport) is what makes the per-point cache reusable across overlapping
 * viewports and different users.
 */
export function latticePoints(bbox: BBox, tier: GridTier): Array<{ lat: number; lng: number }> {
  const clipped: BBox = tier.wholeContinent
    ? EUROPE_BOUNDS
    : {
        minLng: Math.max(bbox.minLng, EUROPE_BOUNDS.minLng),
        minLat: Math.max(bbox.minLat, EUROPE_BOUNDS.minLat),
        maxLng: Math.min(bbox.maxLng, EUROPE_BOUNDS.maxLng),
        maxLat: Math.min(bbox.maxLat, EUROPE_BOUNDS.maxLat),
      }

  const { step } = tier
  const startLng = Math.floor(clipped.minLng / step) * step
  const startLat = Math.floor(clipped.minLat / step) * step

  const points: Array<{ lat: number; lng: number }> = []
  for (let lat = startLat; lat <= clipped.maxLat; lat += step) {
    for (let lng = startLng; lng <= clipped.maxLng; lng += step) {
      points.push({ lat: round(lat), lng: round(lng) })
      if (points.length >= MAX_POINTS) return points
    }
  }
  return points
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
