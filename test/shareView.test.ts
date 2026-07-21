import { describe, it, expect } from 'vitest'
import { buildShareQuery, parseShareQuery, type ShareState } from '../app/utils/shareView'

const state: ShareState = {
  view: { lng: 10.5, lat: 50.25, zoom: 5.35 },
  from: 0,
  to: 2,
  tshirt: true,
}

describe('buildShareQuery', () => {
  it('serializes rounded state', () => {
    expect(buildShareQuery(state)).toBe('lat=50.250&lng=10.500&z=5.35&from=0&to=2&tshirt=1')
  })

  it('omits tshirt when off', () => {
    expect(buildShareQuery({ ...state, tshirt: false })).toBe('lat=50.250&lng=10.500&z=5.35&from=0&to=2')
  })
})

describe('parseShareQuery', () => {
  it('round-trips with buildShareQuery', () => {
    const q = Object.fromEntries(new URLSearchParams(buildShareQuery(state)))
    expect(parseShareQuery(q)).toEqual({
      view: { lat: 50.25, lng: 10.5, zoom: 5.35 },
      range: { from: 0, to: 2 },
      tshirt: true,
    })
  })

  it('returns empty object for no params', () => {
    expect(parseShareQuery({})).toEqual({})
  })

  it('ignores invalid coordinates but keeps valid range', () => {
    expect(parseShareQuery({ lat: 'x', lng: '10', z: '5', from: '1', to: '3' })).toEqual({
      range: { from: 1, to: 3 },
    })
  })

  it('clamps and orders the day range', () => {
    expect(parseShareQuery({ from: '9', to: '-2' }).range).toEqual({ from: 0, to: 7 })
  })

  it('parses tshirt truthiness', () => {
    expect(parseShareQuery({ tshirt: '1' }).tshirt).toBe(true)
    expect(parseShareQuery({ tshirt: 'true' }).tshirt).toBe(true)
    expect(parseShareQuery({ tshirt: '0' }).tshirt).toBe(false)
    expect(parseShareQuery({}).tshirt).toBeUndefined()
  })
})
