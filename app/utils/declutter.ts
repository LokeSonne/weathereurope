export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Priority-ranked greedy declutter. `boxes` are screen-space rectangles in priority
 * order (most important first). Walks them in order and keeps a box only if it doesn't
 * collide with any already-kept box; colliding lower-priority boxes are dropped.
 *
 * `gap` inflates each candidate by that many pixels, so kept markers keep a little
 * breathing room rather than sitting edge-to-edge.
 *
 * Returns a boolean per input box: `true` = keep visible, `false` = hide.
 */
export function declutter(boxes: Box[], gap = 0): boolean[] {
  const visible: boolean[] = new Array(boxes.length).fill(false)
  const kept: Box[] = []

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!
    if (!kept.some((k) => overlaps(b, k, gap))) {
      visible[i] = true
      kept.push(b)
    }
  }

  return visible
}

/** True when box `a` (inflated by `gap` on every side) intersects box `b`. */
function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.left - gap < b.right && a.right + gap > b.left && a.top - gap < b.bottom && a.bottom + gap > b.top
}
