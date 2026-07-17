import { describe, it, expect } from 'vitest'
import { declutter, type Box } from '../app/utils/declutter'

const box = (left: number, top: number, w = 40, h = 20): Box => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
})

describe('declutter', () => {
  it('keeps everything when nothing overlaps', () => {
    const boxes = [box(0, 0), box(100, 0), box(0, 100)]
    expect(declutter(boxes)).toEqual([true, true, true])
  })

  it('drops the lower-priority box of an overlapping pair', () => {
    // Index 0 is higher priority and comes first, so it wins.
    const boxes = [box(0, 0), box(10, 5)]
    expect(declutter(boxes)).toEqual([true, false])
  })

  it('keeps a non-overlapping box even after an earlier collision', () => {
    const boxes = [box(0, 0), box(10, 5) /* collides with 0 */, box(200, 200) /* clear */]
    expect(declutter(boxes)).toEqual([true, false, true])
  })

  it('a large high-priority box can suppress several smaller ones', () => {
    const big = { left: 0, top: 0, right: 100, bottom: 100 }
    const boxes = [big, box(10, 10), box(50, 50), box(300, 300)]
    expect(declutter(boxes)).toEqual([true, false, false, true])
  })

  it('respects the gap so kept markers are not edge-to-edge', () => {
    // Two boxes 5px apart horizontally.
    const boxes = [box(0, 0, 40, 20), box(45, 0, 40, 20)]
    expect(declutter(boxes, 0)).toEqual([true, true]) // touching-ish but not overlapping
    expect(declutter(boxes, 10)).toEqual([true, false]) // 10px gap required → second dropped
  })

  it('handles an empty list', () => {
    expect(declutter([])).toEqual([])
  })
})
