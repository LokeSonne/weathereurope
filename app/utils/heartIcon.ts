/**
 * The flat, screen-printed heart silhouette (see DESIGN.md). Single source of truth for the
 * shape, shared by the Favorites toggle (IconHeart.vue) and the favorite mark on city chips
 * (WeatherMap.vue) so they can never drift apart.
 */

/** The heart glyph path, drawn in a 24×24 viewBox. */
export const HEART_PATH =
  'M12 20.7C12 20.7 3.3 14.6 3.3 8.7C3.3 5.5 5.8 3.3 8.6 3.3C10.4 3.3 11.4 4.5 12 5.5C12.6 4.5 13.6 3.3 15.4 3.3C18.2 3.3 20.7 5.5 20.7 8.7C20.7 14.6 12 20.7 12 20.7Z'

/**
 * Inline SVG markup for the heart, filled with `currentColor` so the caller sets the colour via
 * CSS. Trusted, static, locally-authored markup — safe to inject via innerHTML.
 */
export const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
  `<path d="${HEART_PATH}"/></svg>`
