# Design intent — "Vintage summer travel poster"

The look is modelled on a **mid-century travel poster** (think Air France / SNCF seaside
prints): a warm, sun-faded, flatly-illustrated Europe with a few bold, screen-printed
colours. It suits the name — "T-Shirt Weather" is about summer, the seaside, and escape —
and it makes the **weather data the hero** on a calm, low-noise canvas.

## Principles

- **Data first, decoration second.** The basemap recedes to a soft, limited palette so the
  temperature chips read instantly. Nothing on the base competes with the forecast.
- **Warm, sun-faded, limited palette.** A handful of muted colours (cream, faded teal,
  terracotta, sage) — the restraint of a screen print, not a photographic map.
- **Flat, printed, still.** No 3D tilt, no rotation, north-up, framed to Europe — the map
  behaves like a printed poster you pan across, not a globe you fly around. (Rotation and
  pitch are disabled in `WeatherMap.vue`.)
- **Quietly nostalgic.** A subtle paper grain and soft shadows suggest print, without
  tipping into skeuomorphic kitsch.

## Palette (source of truth: `app/utils/tempScale.ts`, `WeatherMap.vue`)

**Basemap (Positron, retinted in `tintBasemap()`)**
| Surface | Colour |
| --- | --- |
| Land | `#f1e6c9` warm cream |
| Sea | `#83c0b4` faded poster teal |
| Parks / woods | `#cdd9a8` / `#c7d5a2` muted sage |
| Built-up areas | `#ece1c4` |

**Temperature ramp** (diverging cold→hot; muted to live inside the poster palette, but spread
across a full lightness + hue swing so each ~7 °C step is distinct at a glance)
| °C | Colour | |
| --- | --- | --- |
| −10 | `#3a6b82` | deep dusty ocean blue |
| 0 | `#6aa39b` | faded teal |
| 8 | `#e6d6a0` | pale cream-khaki (light pivot) |
| 15 | `#efc266` | warm gold |
| 22 | `#e2924b` | terracotta orange |
| 30 | `#c74c2c` | sunset rust |

The scale is a true diverging ramp: lightness rises to the cream pivot (~8 °C) then falls, while
hue swings blue → teal → cream → gold → orange → rust. Cold (≤0 °C) and hot (≥~24 °C) chips carry
warm-cream text; the lighter middle carries deep-teal ink (`contrastText()`).

**Ink & accents**
| Token | Colour | Use |
| --- | --- | --- |
| Deep-teal ink | `#1f4b4b` | text on light chips, city names |
| Warm cream | `#f6efda` | text on dark chips, name-label background |
| Cream border | `#f4ead0` | chip / pill outlines |
| Terracotta | `#d2694a` | primary accent (date-range selection, Favorites active) |
| Muted teal-green | `#3f9e86` | T-shirt-weather active |
| Control shell | `rgba(26, 58, 56, 0.88)` | deep-teal frosted controls (day range, toggles, share) |

Chip text colour is chosen per-temperature by `contrastText()`: deep-teal ink on the lighter
mid-range pills, warm cream on the darker cold/hot ends.

## Texture

A faint monochrome **film grain** (`feTurbulence` SVG, `mix-blend-mode: multiply`, ~50%
opacity) sits above the map and below the controls (`.map-grain`). Just enough to read as
"printed," never so much that it muddies the chips.

## Components

- **City chip** — a rounded pill with a **cream border** and soft warm shadow; one cell per
  day, tinted by the temperature ramp; a **cream name label with teal ink** below.
- **Controls** (date range, toggles, share, status) — **deep-teal frosted** shells with cream
  text; the date-range selection and Favorites use the **terracotta** accent, T-shirt weather
  the muted teal-green.
- **Decluttered dot** — the minimal fallback keeps a cream ring so it still reads as a place.

## Typography

- **Current:** system UI sans, bold weights for the numerals.
- **Intended (not yet built):** a heavy, condensed **display face** (e.g. Anton / Archivo
  Black, self-hosted) for a poster **wordmark** ("T-SHIRT WEATHER") and the temperatures —
  this is the single biggest thing still missing versus a real poster.

## Interaction

- Locked to Europe (`maxBounds`), **north-up, no rotation or pitch** — reinforces the "flat
  print" intent and keeps every chip upright and legible.
- Zoom reveals detail (capitals → towns); chips collapse to dots when crowded.

## Roadmap to fully land the look ("phase 2")

1. **Flat weather icons in teal ink** to replace the emoji (`app/utils/weatherIcon.ts`) — the
   emoji are the one element still fighting the flat, printed aesthetic.
2. **Display typeface + wordmark** (see Typography) — the defining poster signal.
3. Optional: a thin **cream frame** around the viewport (the poster's border), and a small
   corner wordmark/credit set in the display face.

## Non-goals

- No dark mode (the poster warmth is the identity).
- No photorealistic terrain, 3D buildings, or map rotation.
- No high-saturation "dashboard" colours — everything stays sun-faded.
