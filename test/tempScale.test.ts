import { describe, it, expect } from 'vitest'
import { tempColor, contrastText, TEMP_MIN, TEMP_MAX } from '../app/utils/tempScale'

describe('tempColor', () => {
  it('returns the exact stop colors at the scale anchors', () => {
    expect(tempColor(-10)).toBe('rgb(74, 124, 140)') // #4a7c8c
    expect(tempColor(0)).toBe('rgb(123, 169, 172)') // #7ba9ac
    expect(tempColor(30)).toBe('rgb(207, 107, 74)') // #cf6b4a
  })

  it('clamps out-of-domain temperatures to the endpoints', () => {
    expect(tempColor(-50)).toBe(tempColor(TEMP_MIN))
    expect(tempColor(100)).toBe(tempColor(TEMP_MAX))
  })

  it('interpolates between stops', () => {
    const mid = tempColor(-5) // between -10 and 0
    expect(mid).not.toBe(tempColor(-10))
    expect(mid).not.toBe(tempColor(0))
    expect(mid).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })
})

describe('contrastText', () => {
  it('uses cream text on the darker (cold/hot) pills', () => {
    expect(contrastText(-10)).toBe('#f6efda')
    expect(contrastText(30)).toBe('#f6efda')
  })

  it('uses deep-teal ink on the light (mild) pills', () => {
    expect(contrastText(8)).toBe('#1f4b4b')
    expect(contrastText(15)).toBe('#1f4b4b')
  })
})
