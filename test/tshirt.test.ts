import { describe, it, expect } from 'vitest'
import { isTshirtWeather, TSHIRT_MIN_TEMP } from '../app/utils/tshirt'

describe('isTshirtWeather', () => {
  it('is true when warm and dry', () => {
    expect(isTshirtWeather(24, 0)).toBe(true) // 24°, clear
    expect(isTshirtWeather(21, 2)).toBe(true) // 21°, partly cloudy
    expect(isTshirtWeather(30, 3)).toBe(true) // 30°, overcast but dry
  })

  it('is false when too cold, even if dry', () => {
    expect(isTshirtWeather(TSHIRT_MIN_TEMP - 1, 0)).toBe(false)
    expect(isTshirtWeather(12, 1)).toBe(false)
  })

  it('is false when warm but wet/foggy/stormy', () => {
    expect(isTshirtWeather(25, 61)).toBe(false) // rain
    expect(isTshirtWeather(25, 45)).toBe(false) // fog
    expect(isTshirtWeather(25, 95)).toBe(false) // thunderstorm
    expect(isTshirtWeather(25, 80)).toBe(false) // rain showers
  })

  it('is inclusive at the temperature threshold', () => {
    expect(isTshirtWeather(TSHIRT_MIN_TEMP, 0)).toBe(true)
  })
})
