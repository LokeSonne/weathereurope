/** Short weekday label (e.g. "Thu") for a day offset from today. Day 0 is labelled "Today". */
export function dayLabel(offset: number): string {
  if (offset === 0) return 'Today'
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

/** Compact weekday label (e.g. "Thu") for a day offset — used in the tight per-day chip cells. */
export function shortDayLabel(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

/** Full weekday label (e.g. "Thursday"), or "Today" for offset 0 — used in screen-reader summaries. */
export function longDayLabel(offset: number): string {
  if (offset === 0) return 'Today'
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-US', { weekday: 'long' })
}
