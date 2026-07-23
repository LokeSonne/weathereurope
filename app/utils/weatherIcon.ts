/**
 * Maps a WMO weather code (as returned by Open-Meteo) to a flat, geometric SVG glyph + a
 * display label. The glyphs are screen-printed silhouettes in a warm Miami Deco palette — a
 * gold sun, soft-white / cool-gray clouds, sky-blue rain — matching the flat tee/heart marks
 * (IconTshirt.vue / IconHeart.vue). They sit on temperature-tinted chips, so a subtle drop
 * shadow (see `.city-marker__icon svg` in WeatherMap.vue) keeps them legible on any tint.
 * See DESIGN.md.
 */

// Miami Deco weather palette.
const GOLD = '#f5b52e' // sunny Deco gold
const WHITE = '#fdfaf1' // warm cloud white
const GRAY = '#aeb8c2' // cool overcast gray
const BLUE = '#4f9dd6' // soft sky-blue rain

/** Wraps glyph body markup in a 24×24 SVG. Elements carry their own colour; `currentColor`
 * is only the fallback the neutral "unknown" glyph relies on. */
function svg(body: string): string {
  return (
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
    body +
    '</svg>'
  )
}

// A puffy grey rain/snow/storm cloud pushed to the upper half, leaving room for the drops beneath.
const CLOUD_TOP =
  `<g fill="${GRAY}"><circle cx="9" cy="9" r="3.6"/><circle cx="14.6" cy="8" r="4.2"/>` +
  '<rect x="6.4" y="9.4" width="11.8" height="4.4" rx="2.2"/></g>'

// A centred grey cloud for plain overcast.
const CLOUD_MID =
  `<g fill="${GRAY}"><circle cx="8.8" cy="12" r="4"/><circle cx="14.8" cy="11" r="4.7"/>` +
  '<rect x="5.8" y="12.4" width="12.6" height="5" rx="2.5"/></g>'

// Deco sunburst: a gold disc ringed by short tapered rays (used whole, or small + a cloud).
const SUN =
  `<circle cx="12" cy="12" r="4.4" fill="${GOLD}"/>` +
  `<g fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round">` +
  '<path d="M12 1.8v2.5M12 19.7v2.5M1.8 12h2.5M19.7 12h2.5' +
  'M4.7 4.7l1.8 1.8M17.5 17.5l1.8 1.8M19.3 4.7l-1.8 1.8M6.5 17.5l-1.8 1.8"/></g>'

// A small gold sun peeking behind a white cloud (partly cloudy).
const SUN_SMALL =
  `<circle cx="8" cy="8" r="2.7" fill="${GOLD}"/>` +
  `<g fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round">` +
  '<path d="M8 2.2v1.7M2.2 8h1.7M3.9 3.9l1.2 1.2M12.1 3.9l-1.2 1.2M3.9 12.1l1.2-1.2"/></g>'
const CLOUD_LOW =
  `<g fill="${WHITE}"><circle cx="11" cy="15" r="3.4"/><circle cx="15.6" cy="14" r="4"/>` +
  '<rect x="8.6" y="15.4" width="9.8" height="4.2" rx="2.1"/></g>'

// Three short diagonal blue drops beneath a cloud.
const RAIN =
  `<g fill="none" stroke="${BLUE}" stroke-width="2" stroke-linecap="round">` +
  '<path d="M9 16l-1 3.6M12.5 16l-1 3.6M16 16l-1 3.6"/></g>'
// Three white flakes beneath a cloud.
const SNOW =
  `<g fill="${WHITE}"><circle cx="9" cy="18.4" r="1.35"/><circle cx="12.5" cy="19" r="1.35"/>` +
  '<circle cx="16" cy="18.4" r="1.35"/></g>'
// A filled gold Deco lightning bolt.
const BOLT = `<path d="M13.2 13.4l-3.4 4.6h2.5l-1.2 3.7 4.5-5.4h-2.7l1.4-2.9z" fill="${GOLD}"/>`
// Four stacked grey haze bars.
const FOG =
  `<g fill="none" stroke="${GRAY}" stroke-width="2" stroke-linecap="round">` +
  '<path d="M4 8h16M6 12h12M4 16h16M8 20h8"/></g>'

const CLEAR = svg(SUN)
const PARTLY = svg(SUN_SMALL + CLOUD_LOW)
const OVERCAST = svg(CLOUD_MID)
const FOGGY = svg(FOG)
const RAINY = svg(CLOUD_TOP + RAIN)
const SNOWY = svg(CLOUD_TOP + SNOW)
const STORM = svg(CLOUD_TOP + BOLT)
const UNKNOWN = svg('<circle cx="12" cy="12" r="3.4"/>')

/** Maps a WMO weather code to a flat Deco SVG glyph + label. */
export function weatherIcon(code: number): { svg: string; label: string } {
  switch (code) {
    case 0:
      return { svg: CLEAR, label: 'Clear sky' }
    case 1:
      return { svg: PARTLY, label: 'Mainly clear' }
    case 2:
      return { svg: PARTLY, label: 'Partly cloudy' }
    case 3:
      return { svg: OVERCAST, label: 'Overcast' }
    case 45:
    case 48:
      return { svg: FOGGY, label: 'Fog' }
    case 51:
    case 53:
    case 55:
      return { svg: RAINY, label: 'Drizzle' }
    case 56:
    case 57:
      return { svg: RAINY, label: 'Freezing drizzle' }
    case 61:
    case 63:
    case 65:
      return { svg: RAINY, label: 'Rain' }
    case 66:
    case 67:
      return { svg: RAINY, label: 'Freezing rain' }
    case 71:
    case 73:
    case 75:
      return { svg: SNOWY, label: 'Snow' }
    case 77:
      return { svg: SNOWY, label: 'Snow grains' }
    case 80:
    case 81:
    case 82:
      return { svg: RAINY, label: 'Rain showers' }
    case 85:
    case 86:
      return { svg: SNOWY, label: 'Snow showers' }
    case 95:
      return { svg: STORM, label: 'Thunderstorm' }
    case 96:
    case 99:
      return { svg: STORM, label: 'Thunderstorm with hail' }
    default:
      return { svg: UNKNOWN, label: 'Unknown' }
  }
}
