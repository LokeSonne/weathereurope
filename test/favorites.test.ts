import { describe, it, expect } from 'vitest'
import { cityId } from '../app/utils/favorites'

describe('cityId', () => {
  it('builds a stable id from lng,lat', () => {
    expect(cityId(13.4105, 52.5244)).toBe('13.4105,52.5244')
  })

  it('is order-sensitive (lng first) and distinguishes nearby cities', () => {
    expect(cityId(2.3488, 48.8534)).not.toBe(cityId(48.8534, 2.3488))
    expect(cityId(2.3488, 48.8534)).not.toBe(cityId(2.349, 48.8534))
  })
})
