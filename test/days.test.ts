import { describe, it, expect } from 'vitest'
import { dayLabel, shortDayLabel, longDayLabel } from '../app/utils/days'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

describe('day labels', () => {
  it('labels the current day as "Today"', () => {
    expect(dayLabel(0)).toBe('Today')
    expect(longDayLabel(0)).toBe('Today')
  })

  it('returns weekday names for future offsets', () => {
    expect(WEEKDAYS).toContain(longDayLabel(1))
    expect(longDayLabel(1)).toMatch(/^[A-Z][a-z]+$/) // full weekday
    expect(shortDayLabel(1)).toMatch(/^[A-Z][a-z]{2}$/) // 3-letter weekday
  })

  it('short label uses the weekday even for today', () => {
    expect(WEEKDAYS.map((d) => d.slice(0, 3))).toContain(shortDayLabel(0))
  })
})
