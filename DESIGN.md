# Design intent — "Vintage Miami Art Deco travel poster"

The look is a **sun-faded Miami Art Deco travel poster** (think South Beach / Ocean Drive): a
warm, chalky, flatly-illustrated world map rendered in a handful of pastel, screen-printed
colours — flamingo, aqua, butter, coral. It suits the name — "T-Shirt Weather" is about
summer, the seaside, and escape — and it makes the **weather data the hero** on a calm,
low-noise canvas.

It is the **daytime, sun-bleached** side of Deco, not the neon night: bright but restrained,
like a faded 1930s poster, never a Miami Vice light show.

## Principles

- **Data first, decoration second.** The basemap recedes to a soft pastel palette so the
  temperature chips read instantly. Nothing on the base competes with the forecast.
- **Sun-faded pastel, limited palette.** A handful of chalky South Beach colours (stucco cream,
  aqua, mint, flamingo, coral) — the restraint of a screen print, not a photographic map.
- **Flat, printed, still.** No 3D tilt, no rotation, north-up, framed as a single flat world — the
  map behaves like a printed poster you pan across, not a globe you fly around. (Rotation and
  pitch are disabled in `WeatherMap.vue`.)
- **Streamline Deco geometry.** Rounded corners, a thin poster margin, and streamline
  "speed-lines" — Art Deco motifs used sparingly, never kitsch.

## Palette

**Accent / ink tokens (source of truth: `:root` in `app/app.vue`)** — referenced as CSS
custom properties throughout the components, so a retint happens in one place.

| Token | Colour | Use |
| --- | --- | --- |
| `--miami-flamingo` | `#e86a93` | primary accent (date-range selection, Favorites active) |
| `--miami-teal` | `#2fa8a0` | T-shirt-weather active + day-cell ring |
| `--miami-navy` | `#1c3b52` | ink: text on light chips, city names |
| `--miami-cream` | `#fbf3e2` | text on dark chips, name-label background |
| `--miami-cream-border` | `#f7eedb` | chip / pill outlines, poster margin |
| `--miami-shell` | `rgba(28,59,82,0.9)` | deco-navy frosted controls (day range, toggles, share) |

**Basemap (Positron, retinted in `tintBasemap()` in `WeatherMap.vue`)**
| Surface | Colour |
| --- | --- |
| Land | `#f4e9d8` warm stucco |
| Sea | `#6fd0ce` South Beach aqua |
| Parks / woods | `#bfe0be` / `#b2d9af` pastel mint |
| Built-up areas | `#f0dcce` pale stucco pink |

**Temperature ramp (source of truth: `app/utils/tempScale.ts`)** — a diverging cold→hot ramp,
muted to live inside the pastel palette, spread across a full lightness + hue swing so each
~7 °C step is distinct at a glance.
| °C | Colour | |
| --- | --- | --- |
| −10 | `#5e83b3` | dusty cornflower blue |
| 0 | `#78c9c6` | South Beach aqua |
| 8 | `#ede6b4` | pale butter (light pivot) |
| 15 | `#f4c96b` | warm gold |
| 22 | `#ee9a6a` | sherbet coral |
| 30 | `#da5a7e` | flamingo sunset rose |

Lightness rises to the butter pivot (~8 °C) then falls, while hue swings blue → aqua → butter
→ gold → coral → flamingo. Cold (≤−10 °C) and hot (≥~30 °C) chips carry warm-cream text; the
lighter middle carries deco-navy ink — chosen per-temperature by `contrastText()`.

## Texture

A faint monochrome **film grain** (`feTurbulence` SVG, `mix-blend-mode: multiply`, ~50%
opacity) sits above the map and below the controls (`.map-grain`). Just enough to read as
"printed," never so much that it muddies the chips.

## Components

- **City chip** — a rounded pill with a **cream border** and soft shadow; one cell per day,
  tinted by the temperature ramp; a **cream name label with navy ink** below.
- **Weather glyphs** — flat, geometric **Deco ink icons** (`app/utils/weatherIcon.ts`): a
  sunburst sun, streamline clouds, drops, flakes and a bolt, drawn in `currentColor` so each
  inherits its chip's contrast ink. No emoji on the chips.
- **Controls** (date range, toggles, share, status) — **deco-navy frosted** shells with cream
  text; the date-range selection and Favorites use the **flamingo** accent, T-shirt weather the
  **ocean teal**. The T-shirt and Favorites toggles carry **custom flat ink icons**
  (`IconTshirt.vue`, `IconHeart.vue`) — filled `currentColor` silhouettes, not emoji.
- **Poster chrome (large screens only)** — a thin cream **margin frame** (`.poster-frame`) inset
  from the screen edges with softly rounded corners, plus a corner **"T-SHIRT WEATHER"** poster
  **wordmark** (`.wordmark`) set in the Deco display face and flanked by streamline
  **speed-lines** in flamingo. Both are **hidden at ≤720px**: on narrow screens the day-range
  spans the top edge-to-edge and the attribution becomes a full-width bottom band, so a
  rectangular margin would cross both. The basemap, chips and controls carry the look on mobile.
- **Decluttered dot** — the minimal fallback keeps a cream ring so it still reads as a place.

## Typography

- **Display / wordmark:** **Poiret One** — a thin geometric Deco face, self-hosted via
  `@nuxt/fonts` (see `nuxt.config.ts`), exposed as `--font-display`. Its natural 400 weight is
  the authentic thin-Deco look for the wordmark.
- **Body / numerals:** system UI sans, bold weights for the temperature numerals — a heavier,
  legible face at chip scale (~13px), where the thin display face would not read.

## Interaction

- Flat Web Mercator world, **north-up, no rotation or pitch** — reinforces the "flat print" intent
  and keeps every chip upright and legible.
- Zoom reveals detail (capitals → towns); chips collapse to dots when crowded.

## Non-goals

- **No dark mode / neon night** — the sun-faded daytime warmth is the identity.
- No photorealistic terrain, 3D buildings, or map rotation.
- No high-saturation "dashboard" colours — everything stays chalky and sun-faded.
