import citiesData from '../data/cities.json'

export interface City {
  name: string
  /** ISO-3166 alpha-2 country code. */
  country: string
  lat: number
  lng: number
  /** Population. */
  pop: number
  capital: boolean
}

// Pre-sorted (capitals first, then population desc) at build time — see scripts that generate cities.json.
const CITIES = citiesData as City[]

export interface BBox {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

/** Hard cap on cities per response — bounds the Open-Meteo fan-out. The dot fallback keeps
 *  a higher count legible, so this can be generous. */
const MAX_CITIES = 160

/**
 * Minimum population a (non-capital) city must have to appear at a given zoom.
 * Capitals ignore this and are always shown, so the map reveals detail from the
 * top down: capitals first, then progressively smaller cities as you zoom in.
 */
function minPopForZoom(zoom: number): number {
  if (zoom <= 4) return 3_000_000 // capitals + a few megacities (Istanbul, St Petersburg)
  if (zoom <= 5) return 1_000_000
  if (zoom <= 6) return 300_000
  if (zoom <= 7) return 100_000
  if (zoom <= 8) return 40_000
  return 0 // everything in the dataset (>= 15k)
}

/**
 * Selects the cities to show for a viewport + zoom: those inside `bbox` that are
 * either a capital or above the zoom's population threshold, ordered by importance
 * (capitals first, then population), capped to {@link MAX_CITIES}.
 */
export function selectCities(bbox: BBox, zoom: number): City[] {
  const minPop = minPopForZoom(zoom)
  const selected: City[] = []

  // CITIES is already importance-sorted, so slicing the first matches gives the
  // most important cities and lets us stop early once the cap is reached.
  for (const city of CITIES) {
    if (city.lng < bbox.minLng || city.lng > bbox.maxLng) continue
    if (city.lat < bbox.minLat || city.lat > bbox.maxLat) continue
    if (!city.capital && city.pop < minPop) continue

    selected.push(city)
    if (selected.length >= MAX_CITIES) break
  }

  return selected
}
