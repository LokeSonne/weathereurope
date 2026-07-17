import { describe, it, expect } from 'vitest'
import { tempColor, contrastText, TEMP_MIN, TEMP_MAX } from '../app/utils/tempScale'

describe('tempColor', () => {
  it('returns the exact stop colors at the scale anchors', () => {
    expect(tempColor(-10)).toBe('rgb(33, 102, 172)') // #2166ac
    expect(tempColor(0)).toBe('rgb(103, 169, 207)') // #67a9cf
    expect(tempColor(30)).toBe('rgb(178, 24, 43)') // #b2182b
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
  it('uses white text on dark (cold/hot) pills', () => {
    expect(contrastText(-10)).toBe('#ffffff')
    expect(contrastText(30)).toBe('#ffffff')
  })

  it('uses dark text on light (mild) pills', () => {
    expect(contrastText(8)).toBe('#0b1f2a')
    expect(contrastText(15)).toBe('#0b1f2a')
  })
})
