import { describe, it, expect } from 'vitest'
import { selectCities, type BBox } from '../server/utils/cities'

// Whole-Europe viewport — matches the dataset's bounding box.
const EUROPE: BBox = { minLng: -25, minLat: 34, maxLng: 45, maxLat: 72 }

describe('selectCities', () => {
  it('shows only capitals and megacities at low zoom', () => {
    const result = selectCities(EUROPE, 3)
    expect(result.length).toBeGreaterThan(0)
    // At the continent view, every non-capital shown is a megacity (>= 3M).
    expect(result.filter((c) => !c.capital).every((c) => c.pop >= 3_000_000)).toBe(true)
    expect(result.some((c) => c.capital)).toBe(true)
  })

  it('reveals larger cities as zoom increases, respecting the population threshold', () => {
    const lowZoom = selectCities(EUROPE, 3)
    const withCities = selectCities(EUROPE, 6)
    // More places appear once we zoom in.
    expect(withCities.length).toBeGreaterThan(lowZoom.length)
    // Every non-capital shown at zoom 6 clears the 300k threshold for that tier.
    expect(withCities.filter((c) => !c.capital).every((c) => c.pop >= 300_000)).toBe(true)
  })

  it('always includes capitals even when below the zoom population threshold', () => {
    const result = selectCities(EUROPE, 6) // threshold 300k
    expect(result.some((c) => c.capital && c.pop < 300_000)).toBe(true)
  })

  it('caps the result and orders capitals first, then by population', () => {
    const result = selectCities(EUROPE, 12) // threshold 0 → everything eligible
    expect(result.length).toBe(160)

    const capitalCount = result.filter((c) => c.capital).length
    // Capitals lead the list; no capital appears after the block of non-capitals.
    expect(result.slice(0, capitalCount).every((c) => c.capital)).toBe(true)
    expect(result.slice(capitalCount).some((c) => c.capital)).toBe(false)
    // Highest-population capital comes first.
    expect(result[0]!.name).toBe('Moscow')
  })

  it('clips to the requested viewport', () => {
    const paris: BBox = { minLng: 2, minLat: 48.7, maxLng: 2.6, maxLat: 49 }
    const result = selectCities(paris, 12)
    expect(result.length).toBeGreaterThan(0)
    expect(result.some((c) => c.name === 'Paris')).toBe(true)
    expect(
      result.every(
        (c) => c.lng >= paris.minLng && c.lng <= paris.maxLng && c.lat >= paris.minLat && c.lat <= paris.maxLat,
      ),
    ).toBe(true)
  })
})
