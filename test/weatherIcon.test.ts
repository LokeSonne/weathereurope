import { describe, it, expect } from 'vitest'
import { weatherIcon } from '../app/utils/weatherIcon'

describe('weatherIcon', () => {
  it('maps clear and cloudy codes to a label and an SVG glyph', () => {
    expect(weatherIcon(0).label).toBe('Clear sky')
    expect(weatherIcon(0).svg).toMatch(/^<svg[\s>]/)
    expect(weatherIcon(3).label).toBe('Overcast')
    expect(weatherIcon(3).svg).toContain('<svg')
  })

  it('groups rain and thunderstorm code ranges', () => {
    expect(weatherIcon(61).label).toBe('Rain')
    expect(weatherIcon(63).label).toBe('Rain')
    expect(weatherIcon(65).label).toBe('Rain')
    expect(weatherIcon(95).label).toBe('Thunderstorm')
    expect(weatherIcon(96).label).toBe('Thunderstorm with hail')
  })

  it('falls back for unknown codes', () => {
    expect(weatherIcon(999).label).toBe('Unknown')
    expect(weatherIcon(999).svg).toContain('<svg')
  })
})
