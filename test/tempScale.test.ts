import { describe, it, expect } from 'vitest'
import { tempColor, contrastText, TEMP_MIN, TEMP_MAX } from '../app/utils/tempScale'

describe('tempColor', () => {
  it('returns the exact stop colors at the scale anchors', () => {
    expect(tempColor(-10)).toBe('rgb(94, 131, 179)') // #5e83b3 cornflower
    expect(tempColor(0)).toBe('rgb(120, 201, 198)') // #78c9c6 aqua
    expect(tempColor(30)).toBe('rgb(218, 90, 126)') // #da5a7e flamingo
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
  it('uses warm cream text on the darker (cold/hot) pills', () => {
    expect(contrastText(-10)).toBe('#fbf3e2')
    expect(contrastText(30)).toBe('#fbf3e2')
  })

  it('uses deco-navy ink on the light (mild) pills', () => {
    expect(contrastText(8)).toBe('#1c3b52')
    expect(contrastText(15)).toBe('#1c3b52')
  })
})
