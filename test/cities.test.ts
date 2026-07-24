import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { selectCities, citiesByIds, type BBox } from '../server/utils/cities'
import prominent from '../server/data/cities-prominent.json'

const CHUNK_DIR = join(process.cwd(), 'server', 'data', 'cities')

// The whole world (clamped to the Web Mercator latitude limit), matching the map's maxBounds.
const WORLD: BBox = { minLng: -180, minLat: -85, maxLng: 180, maxLat: 85 }
// A regional viewport that stays under the MAX_CITIES cap at low zoom.
const FRANCE: BBox = { minLng: -5, minLat: 42, maxLng: 9, maxLat: 51 }

beforeEach(() => {
  // Tail chunks are read via Nitro server assets (useStorage('assets:cities')); back that mount
  // with the real generated chunk files on disk so the tests exercise the actual dataset.
  vi.stubGlobal('useStorage', () => ({
    getItem: async (key: string) => {
      try {
        return JSON.parse(readFileSync(join(CHUNK_DIR, key), 'utf8'))
      } catch {
        return null
      }
    },
  }))
})

afterEach(() => vi.unstubAllGlobals())

describe('selectCities', () => {
  it('shows only capitals and megacities at low zoom', async () => {
    const result = await selectCities(WORLD, 3)
    expect(result.length).toBeGreaterThan(0)
    // At the whole-world view, every non-capital shown is a megacity (>= 3M).
    expect(result.filter((c) => !c.capital).every((c) => c.pop >= 3_000_000)).toBe(true)
    expect(result.some((c) => c.capital)).toBe(true)
  })

  it('reveals larger cities as zoom increases, respecting the population threshold', async () => {
    const lowZoom = await selectCities(FRANCE, 3)
    const withCities = await selectCities(FRANCE, 6)
    // More places appear once we zoom in.
    expect(withCities.length).toBeGreaterThan(lowZoom.length)
    // Every non-capital shown at zoom 6 clears the 300k threshold for that tier.
    expect(withCities.filter((c) => !c.capital).every((c) => c.pop >= 300_000)).toBe(true)
  })

  it('always includes capitals even when below the zoom population threshold', async () => {
    const result = await selectCities(WORLD, 6) // threshold 300k
    expect(result.some((c) => c.capital && c.pop < 300_000)).toBe(true)
  })

  it('caps the result and orders capitals first, then by population', async () => {
    // zoom 7 (threshold 100k) is served entirely from the prominent index — no tail loaded.
    const result = await selectCities(WORLD, 7)
    expect(result.length).toBe(250)

    const capitalCount = result.filter((c) => c.capital).length
    // Capitals lead the list; no capital appears after the block of non-capitals.
    expect(result.slice(0, capitalCount).every((c) => c.capital)).toBe(true)
    expect(result.slice(capitalCount).some((c) => c.capital)).toBe(false)
    // Highest-population capital comes first.
    expect(result[0]!.name).toBe(prominent[0]!.name)
  })

  it('loads on-demand tail chunks at high zoom and clips to the viewport', async () => {
    // A small viewport over Puglia, Italy — deep zoom pulls in sub-100k towns from a tail chunk.
    const puglia: BBox = { minLng: 15.5, minLat: 40.5, maxLng: 17.5, maxLat: 42 }
    const result = await selectCities(puglia, 12)

    expect(result.length).toBeGreaterThan(0)
    // Proof the tail loaded: at least one non-capital town below the prominent floor is present.
    expect(result.some((c) => !c.capital && c.pop < 100_000)).toBe(true)
    // Everything is inside the requested viewport.
    expect(
      result.every(
        (c) =>
          c.lng >= puglia.minLng && c.lng <= puglia.maxLng && c.lat >= puglia.minLat && c.lat <= puglia.maxLat,
      ),
    ).toBe(true)
  })

  it('warns (not silently drops) when a manifest cell reads empty — e.g. serverAssets unbundled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Simulate the 'cities' asset bundle being unreachable: every chunk read returns null.
    vi.stubGlobal('useStorage', () => ({ getItem: async () => null }))
    // Deep zoom over a cell no other test loads (central France, cell 18_13), so it isn't served
    // from the module LRU.
    await selectCities({ minLng: 2, minLat: 46, maxLng: 4, maxLat: 47.5 }, 12)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('citiesByIds', () => {
  it('resolves a prominent city id from the in-memory index', async () => {
    const beijing = prominent[0]!
    const id = `${beijing.lng},${beijing.lat}`
    const result = await citiesByIds([id])
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe(beijing.name)
  })

  it('resolves a tail city id by loading only its cell chunk', async () => {
    // Take a real tail city and round-trip its id (build uses the same lng,lat cell scheme).
    const chunk = JSON.parse(readFileSync(join(CHUNK_DIR, '19_13.json'), 'utf8')) as Array<{
      name: string
      lng: number
      lat: number
    }>
    const town = chunk[0]!
    const result = await citiesByIds([`${town.lng},${town.lat}`])
    expect(result.some((c) => c.name === town.name)).toBe(true)
  })

  it('skips unknown/stale ids', async () => {
    const result = await citiesByIds(['999,999', 'not-an-id'])
    expect(result).toHaveLength(0)
  })
})
