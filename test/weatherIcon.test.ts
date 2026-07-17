import { describe, it, expect } from 'vitest'
import { weatherIcon } from '../app/utils/weatherIcon'

describe('weatherIcon', () => {
  it('maps clear and cloudy codes', () => {
    expect(weatherIcon(0)).toEqual({ icon: '☀️', label: 'Clear sky' })
    expect(weatherIcon(3)).toEqual({ icon: '☁️', label: 'Overcast' })
  })

  it('groups rain and thunderstorm code ranges', () => {
    expect(weatherIcon(61).label).toBe('Rain')
    expect(weatherIcon(63).label).toBe('Rain')
    expect(weatherIcon(65).label).toBe('Rain')
    expect(weatherIcon(95).label).toBe('Thunderstorm')
    expect(weatherIcon(96).label).toBe('Thunderstorm with hail')
  })

  it('falls back for unknown codes', () => {
    expect(weatherIcon(999)).toEqual({ icon: '🌡️', label: 'Unknown' })
  })
})
