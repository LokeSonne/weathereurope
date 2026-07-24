import prominentData from '../data/cities-prominent.json'
import manifest from '../data/cities-manifest.json'

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

// Capitals + big cities (pop >= manifest.prominentFloor), pre-sorted (capitals first, then
// population desc) at build time — see scripts/build-cities.mjs. Small enough to import at boot;
// covers every wide/mid-zoom view on its own so the tail is only loaded when zoomed in.
const PROMINENT = prominentData as City[]

/** Grid config + the set of non-empty tail cells, from the build. */
const CELL_DEG = manifest.cellDeg
const PROMINENT_FLOOR = manifest.prominentFloor
const CELLS = new Set(manifest.cells)

// Lookup by favorite id ("lng,lat", matching the client's cityId()) for prominent cities. Tail
// favorites are resolved by deriving their cell from the id and loading just that chunk.
const PROMINENT_BY_ID = new Map<string, City>(PROMINENT.map((c) => [`${c.lng},${c.lat}`, c]))

/** Hard cap on cities per response — bounds the Open-Meteo fan-out. The dot fallback keeps a
 *  higher count legible, so this can be generous; at world zoom it must clear the ~241 capitals. */
const MAX_CITIES = 250

/** Hard cap on favorite ids honored per request (bounds the Open-Meteo fan-out). */
const MAX_FAVORITES = 200

/**
 * Hard cap on tail chunks loaded for a single viewport. A legitimate zoom (tail loading only starts
 * at zoom ≳ 8, where the visible area is small) spans a handful of 10° cells; this ceiling is far
 * above that. It exists to defang a pathological request — a very high zoom over a world-sized bbox —
 * that would otherwise load every tail chunk on earth, thrash the LRU, and parse the entire long
 * tail per request (a cheap-request → heavy-compute amplifier).
 */
const MAX_TAIL_CELLS = 16

export interface BBox {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

// --- Tail chunk loading (on demand, LRU-cached) ---------------------------------------------

/** Most-recently-used tail chunks, kept hot across requests on a warm instance. */
const tailCache = new Map<string, City[]>()
const TAIL_CACHE_MAX = 64

const clampLng = (v: number) => Math.min(180, Math.max(-180, v))
const clampLat = (v: number) => Math.min(90, Math.max(-90, v))

/** Non-negative grid indices — must match scripts/build-cities.mjs cellKey(). */
function cellKey(lng: number, lat: number): string {
  const cx = Math.floor((clampLng(lng) + 180) / CELL_DEG)
  const cy = Math.floor((clampLat(lat) + 90) / CELL_DEG)
  return `${cx}_${cy}`
}

/** Non-empty tail cells overlapping the bbox (adjacency falls out of the padded viewport bbox). */
function cellsForBBox(bbox: BBox): string[] {
  const cxMin = Math.floor((clampLng(bbox.minLng) + 180) / CELL_DEG)
  const cxMax = Math.floor((clampLng(bbox.maxLng) + 180) / CELL_DEG)
  const cyMin = Math.floor((clampLat(bbox.minLat) + 90) / CELL_DEG)
  const cyMax = Math.floor((clampLat(bbox.maxLat) + 90) / CELL_DEG)

  const keys: string[] = []
  for (let cx = cxMin; cx <= cxMax; cx++) {
    for (let cy = cyMin; cy <= cyMax; cy++) {
      const key = `${cx}_${cy}`
      if (CELLS.has(key)) keys.push(key)
    }
  }
  return keys
}

/** Loads one tail chunk (via bundled server assets), caching it in the LRU. Empty for unknown cells. */
async function loadTailChunk(key: string): Promise<City[]> {
  const hit = tailCache.get(key)
  if (hit) {
    // Refresh recency.
    tailCache.delete(key)
    tailCache.set(key, hit)
    return hit
  }

  let chunk: City[] = []
  if (CELLS.has(key)) {
    const raw = await useStorage('assets:cities').getItem(`${key}.json`)
    chunk = (typeof raw === 'string' ? JSON.parse(raw) : (raw ?? [])) as City[]
    if (chunk.length === 0) {
      // The manifest lists this cell as non-empty, so an empty read means the 'cities' server-asset
      // bundle isn't reachable in this deployment (e.g. serverAssets not packaged) — tail cities
      // would silently disappear at high zoom. Surface it in logs instead of failing invisibly.
      console.warn(
        `[cities] tail chunk "${key}" is in the manifest but read empty — check nitro.serverAssets ('cities') is bundled; tail cities will be missing.`,
      )
    }
  }

  tailCache.set(key, chunk)
  if (tailCache.size > TAIL_CACHE_MAX) {
    const oldest = tailCache.keys().next().value
    if (oldest !== undefined) tailCache.delete(oldest)
  }
  return chunk
}

// --- Selection ------------------------------------------------------------------------------

/**
 * Minimum population a (non-capital) city must have to appear at a given zoom.
 * Capitals ignore this and are always shown, so the map reveals detail from the
 * top down: capitals first, then progressively smaller cities as you zoom in.
 */
function minPopForZoom(zoom: number): number {
  if (zoom <= 4) return 3_000_000 // capitals + a few megacities
  if (zoom <= 5) return 1_000_000
  if (zoom <= 6) return 300_000
  if (zoom <= 7) return 100_000
  if (zoom <= 8) return 40_000
  return 0 // everything in the dataset (>= ~5k)
}

/**
 * Selects the cities to show for a viewport + zoom: those inside `bbox` that are either a capital
 * or above the zoom's population threshold, ordered by importance (capitals first, then
 * population), capped to {@link MAX_CITIES}. The prominent index (capitals + pop >= PROMINENT_FLOOR)
 * is scanned in memory; only when the threshold drops below that floor are the viewport's tail
 * chunks loaded on demand — so wide/mid-zoom views do no I/O.
 */
export async function selectCities(bbox: BBox, zoom: number): Promise<City[]> {
  const minPop = minPopForZoom(zoom)
  const inBox = (c: City) =>
    c.lng >= bbox.minLng && c.lng <= bbox.maxLng && c.lat >= bbox.minLat && c.lat <= bbox.maxLat

  // 1) Prominent cities (already importance-sorted). Capitals always qualify.
  const selected: City[] = []
  for (const city of PROMINENT) {
    if (!inBox(city)) continue
    if (!city.capital && city.pop < minPop) continue
    selected.push(city)
  }

  // 2) Long tail — only when the zoom threshold reaches below the prominent floor, and only for
  //    the viewport's cells. Merged by population so the cap keeps the most significant towns.
  if (minPop < PROMINENT_FLOOR && selected.length < MAX_CITIES) {
    const cells = cellsForBBox(bbox)
    // Cap the tail fan-out. A real high-zoom viewport touches only a few cells; more than
    // MAX_TAIL_CELLS means an abnormally wide high-zoom request (only reachable by calling the API
    // directly, not via the map), so trim it instead of loading/parsing the whole long tail.
    if (cells.length > MAX_TAIL_CELLS) {
      console.warn(
        `[cities] viewport spans ${cells.length} tail cells (cap ${MAX_TAIL_CELLS}); trimming. Expected only for abnormally wide high-zoom requests.`,
      )
      cells.length = MAX_TAIL_CELLS
    }
    const tailMatches: City[] = []
    for (const key of cells) {
      const chunk = await loadTailChunk(key)
      for (const city of chunk) {
        if (city.pop < minPop) break // chunk is population-desc → nothing smaller qualifies
        if (inBox(city)) tailMatches.push(city)
      }
    }
    tailMatches.sort((a, b) => b.pop - a.pop)
    for (const city of tailMatches) {
      if (selected.length >= MAX_CITIES) break
      selected.push(city)
    }
  }

  return selected.slice(0, MAX_CITIES)
}

/**
 * Resolves favorite ids ("lng,lat") to their cities regardless of zoom tier, skipping unknown/stale
 * ids and capping the count. Prominent favorites resolve from the in-memory index; the rest load
 * only the tail chunks their coordinates fall in (grouped so each chunk loads at most once).
 */
export async function citiesByIds(ids: string[]): Promise<City[]> {
  const out: City[] = []
  const missesByCell = new Map<string, Set<string>>()

  for (const id of ids.slice(0, MAX_FAVORITES)) {
    const prominent = PROMINENT_BY_ID.get(id)
    if (prominent) {
      out.push(prominent)
      continue
    }
    const comma = id.indexOf(',')
    if (comma < 0) continue
    const lng = Number(id.slice(0, comma))
    const lat = Number(id.slice(comma + 1))
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const key = cellKey(lng, lat)
    if (!CELLS.has(key)) continue
    let wanted = missesByCell.get(key)
    if (!wanted) missesByCell.set(key, (wanted = new Set()))
    wanted.add(id)
  }

  for (const [key, wanted] of missesByCell) {
    const chunk = await loadTailChunk(key)
    for (const city of chunk) {
      if (wanted.has(`${city.lng},${city.lat}`)) out.push(city)
    }
  }

  return out
}
