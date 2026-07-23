<script setup lang="ts">
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { tempColor, contrastText } from '../utils/tempScale'
import { weatherIcon } from '../utils/weatherIcon'
import { shortDayLabel, longDayLabel } from '../utils/days'
import { declutter, type Box } from '../utils/declutter'
import { isTshirtWeather } from '../utils/tshirt'
import { buildShareQuery, type MapView } from '../utils/shareView'
import { cityId } from '../utils/favorites'
import { HEART_SVG } from '../utils/heartIcon'

// Turn an ISO country code (e.g. "DE") into a readable name ("Germany") for tooltips
// and screen-reader labels. Falls back to the raw code if the API is unavailable.
let regionNames: Intl.DisplayNames | undefined
function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' })
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

interface CityFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    name: string
    country: string
    capital: boolean
    temps: number[]
    codes: number[]
  }
}

interface CityFeatureCollection {
  type: 'FeatureCollection'
  features: CityFeature[]
}

interface CityMarker {
  marker: Marker
  pill: HTMLElement
  /** Minimal fallback shown (instead of the full chip) when decluttered. */
  dot: HTMLElement
  name: HTMLElement
  /** Stable favorite id, from coordinates. */
  id: string
  data: CityFeature['properties']
  /** Whether any day in the current range is t-shirt weather (drives the highlight, and
   *  visibility when the t-shirt filter is on). */
  tshirtOk: boolean
}

const props = defineProps<{
  range: { from: number; to: number }
  tshirt: boolean
  favoritesOnly: boolean
  /** Optional map center/zoom to open at, from a shared URL. */
  initialView?: MapView
}>()

const { favorites, isFavorite, toggle: toggleFavorite } = useFavorites()

const EUROPE_BOUNDS: [number, number, number, number] = [-30, 30, 50, 75]

const container = ref<HTMLDivElement>()
const loading = ref(false)
const errorMessage = ref<string | null>(null)
// Set when an active filter leaves nothing visible in the current view.
const empty = ref<{ icon: string; text: string } | null>(null)
// 'idle' | 'copied' — transient feedback for the share button.
const shareState = ref<'idle' | 'copied'>('idle')

/**
 * Overlap tolerance (px) between full chips. Negative means chips may overlap by up to this
 * many pixels before the lower-priority one collapses to a dot — so chips reveal sooner while
 * zooming, with the dot fallback covering genuinely dense areas.
 */
const MARKER_GAP = -10

let map: MapLibreMap | undefined
let abortController: AbortController | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let markers: CityMarker[] = []

onMounted(async () => {
  const maplibregl = (await import('maplibre-gl')).default
  await import('maplibre-gl/dist/maplibre-gl.css')

  if (!container.value) return

  map = new maplibregl.Map({
    container: container.value,
    // Minimal Positron base, retinted to a warm vintage-poster palette in tintBasemap().
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: props.initialView ? [props.initialView.lng, props.initialView.lat] : [10, 50],
    zoom: props.initialView?.zoom ?? 3.5,
    minZoom: 2,
    maxZoom: 12,
    maxBounds: EUROPE_BOUNDS,
    dragRotate: false,
    pitchWithRotate: false,
  })

  // Prevent rotating the map via touch or keyboard as well.
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()

  map.on('load', () => {
    tintBasemap()
    void refreshData()
  })
  map.on('moveend', () => scheduleRefresh())
})

/**
 * Recolors Positron to a sun-faded Miami Art Deco palette (stucco land, aqua sea, mint parks)
 * and traces a bold navy ink coastline over the sea — the confident single-weight line-work of
 * a vintage travel poster.
 */
function tintBasemap() {
  if (!map) return
  const set = (layer: string, prop: string, value: string) => {
    try {
      if (map!.getLayer(layer)) map!.setPaintProperty(layer, prop, value)
    } catch {
      // Layer absent in this style version — skip.
    }
  }
  set('background', 'background-color', '#f4e9d8') // warm stucco land
  set('water', 'fill-color', '#6fd0ce') // South Beach aqua
  set('park', 'fill-color', '#bfe0be') // pastel mint
  set('landcover_wood', 'fill-color', '#b2d9af')
  set('landuse_residential', 'fill-color', '#f0dcce') // pale stucco pink

  // Bold ink coastline: a navy stroke traced along every water polygon edge (sea + lakes) — the
  // signature outline of a vintage travel poster. It's a line layer over the same water
  // source-layer, inserted just below the map's text labels so the ink frames the land without
  // crossing the place names.
  try {
    if (map.getLayer('water') && !map.getLayer('coastline-ink')) {
      const firstLabel = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id
      map.addLayer(
        {
          id: 'coastline-ink',
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'water',
          filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#1c3b52', // --miami-navy ink
            'line-opacity': 0.85,
            // Crisp but a removedas you zoom in.
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.0, 6, 0.1, 10, 0.1],
          },
        },
        firstLabel,
      )
    }
  } catch {
    // Water source-layer absent in this style version — skip the coastline.
  }

  // Foamy surf edge: a single bold, soft white band tracing the ocean shoreline — the stylized
  // surf of a Miami travel poster, kept flat and graphic (one band, not a fine multi-line halo).
  // An offset copy of the ocean boundary, restricted to class 'ocean' so lakes and rivers get no
  // foam. It sits just below the bold coast line and eases out as you zoom in, so the surf reads
  // as a whole-map poster flourish rather than clutter around a single city.
  try {
    if (map.getLayer('coastline-ink') && !map.getLayer('coast-foam')) {
      map.addLayer(
        {
          id: 'coast-foam',
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'water',
          // Ocean only — no foam around lakes or rivers.
          filter: [
            'all',
            ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
            ['==', ['get', 'class'], 'ocean'],
          ],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#ffffff', // bright white foam over the aqua sea
            'line-offset': 2, // hugs the waterline, just into the sea
            'line-blur': 1.2, // soft foam edge, not a hard line
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 6, 4.5],
            // Bold at the whole-map poster view, easing out as you zoom into a city.
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 7, 0.1],
          },
        },
        'coastline-ink',
      )
    }
  } catch {
    // Water source-layer absent in this style version — skip the foam.
  }
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  clearTimeout(shareResetTimer)
  abortController?.abort()
  clearMarkers()
  map?.remove()
})

// Range + t-shirt only change client-side rendering — all days are already fetched.
watch(() => [props.range.from, props.range.to, props.tshirt], renderRange)

// Turning the favorites filter on/off switches the data source.
watch(
  () => props.favoritesOnly,
  () => void refreshData(),
)

// Favorites changed: refetch if we're filtering (the in-view set changed), otherwise just
// refresh the ❤️ indicators on the current markers.
watch(favorites, () => {
  if (props.favoritesOnly) void refreshData()
  else renderRange()
})

function scheduleRefresh() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => void refreshData(), 400)
}

let shareResetTimer: ReturnType<typeof setTimeout> | undefined

/** Builds a link to the current view and shares it (native sheet) or copies it. */
async function shareView() {
  if (!map) return
  const c = map.getCenter()
  const query = buildShareQuery({
    view: { lng: c.lng, lat: c.lat, zoom: map.getZoom() },
    from: props.range.from,
    to: props.range.to,
    tshirt: props.tshirt,
  })
  const url = `${location.origin}${location.pathname}?${query}`

  try {
    if (navigator.share) {
      await navigator.share({ title: 'T-Shirt Weather', text: 'Weather across Europe', url })
      return
    }
  } catch {
    // User dismissed the share sheet — nothing to do.
    return
  }

  try {
    await navigator.clipboard.writeText(url)
    shareState.value = 'copied'
    clearTimeout(shareResetTimer)
    shareResetTimer = setTimeout(() => (shareState.value = 'idle'), 2000)
  } catch {
    console.error('Could not copy share link')
  }
}

function clearMarkers() {
  for (const m of markers) m.marker.remove()
  markers = []
}

/** Favorite ids whose coordinates fall within the current map bounds. */
function inViewFavorites(bounds: ReturnType<NonNullable<typeof map>['getBounds']>): string[] {
  const ids: string[] = []
  for (const id of favorites.value) {
    const comma = id.indexOf(',')
    const lng = Number(id.slice(0, comma))
    const lat = Number(id.slice(comma + 1))
    if (
      lng >= bounds.getWest() &&
      lng <= bounds.getEast() &&
      lat >= bounds.getSouth() &&
      lat <= bounds.getNorth()
    ) {
      ids.push(id)
    }
  }
  return ids
}

/** Local calendar day (YYYY-M-D). Used to bust the forecast cache at midnight: forecasts are
 *  indexed by offset from "today", so a response cached across the date boundary would show the
 *  wrong day at index 0. */
function localDay(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

async function refreshData() {
  if (!map) return
  const bounds = map.getBounds()
  abortController?.abort()
  const controller = new AbortController()
  abortController = controller

  loading.value = true
  errorMessage.value = null

  try {
    let data: CityFeatureCollection
    if (props.favoritesOnly) {
      // Personalized + zoom-independent: fetch the in-view favorites directly (not cached).
      const ids = inViewFavorites(bounds)
      data = ids.length
        ? await $fetch<CityFeatureCollection>('/api/favorites-forecast', {
            method: 'POST',
            body: { ids },
            signal: controller.signal,
          })
        : { type: 'FeatureCollection', features: [] }
    } else {
      // Quantize the request so nearby/repeat viewports resolve to an identical URL, letting the
      // browser's HTTP cache serve them without a roundtrip (see the endpoint's Cache-Control).
      // Zoom snaps to its selection tier via ceil(): minPopForZoom() buckets are constant on
      // (n-1, n], so this reproduces the exact city set the raw zoom would select. The bbox snaps
      // outward to a zoom-scaled grid, so small pans stay inside the same cell (cache hit) and the
      // grid pads the fetch slightly beyond the view, revealing already-loaded cities on the pan.
      // Coarser grid = more hits but more over-fetch (and, at the highest zooms, a denser area the
      // server's MAX_CITIES cap may trim at the edges).
      const zoomTier = Math.ceil(map.getZoom())
      const grid = 360 / 2 ** (zoomTier + 1)
      const snapDown = (v: number) => Math.floor(v / grid) * grid
      const snapUp = (v: number) => Math.ceil(v / grid) * grid

      data = await $fetch<CityFeatureCollection>('/api/city-forecast', {
        query: {
          minLng: snapDown(bounds.getWest()),
          minLat: snapDown(bounds.getSouth()),
          maxLng: snapUp(bounds.getEast()),
          maxLat: snapUp(bounds.getNorth()),
          zoom: zoomTier,
          day: localDay(),
        },
        signal: controller.signal,
      })
    }
    renderMarkers(data.features)
  } catch (error) {
    // A newer request superseded this one — ignore its outcome entirely.
    if ((error as { name?: string }).name === 'AbortError') return
    console.error('Failed to load forecasts', error)
    errorMessage.value =
      (error as { statusCode?: number }).statusCode === 429
        ? 'Too many requests — pausing updates for a moment.'
        : 'Couldn’t load weather data.'
  } finally {
    // Only the latest request controls the shared loading flag.
    if (abortController === controller) loading.value = false
  }
}

async function renderMarkers(features: CityFeature[]) {
  if (!map) return
  const maplibregl = (await import('maplibre-gl')).default
  clearMarkers()

  for (const feature of features) {
    const { properties } = feature
    const [lng, lat] = feature.geometry.coordinates
    const id = cityId(lng, lat)

    const el = document.createElement('div')
    el.className = properties.capital ? 'city-marker city-marker--capital' : 'city-marker'
    // A button: activating it toggles the city as a favorite. renderRange() fills in the
    // accessible label (forecast) and aria-pressed (favorite state).
    el.setAttribute('role', 'button')
    el.setAttribute('tabindex', '0')
    el.addEventListener('click', () => toggleFavorite(id))
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggleFavorite(id)
      }
    })

    // Minimal fallback: a small dot shown in place of the chip when decluttered.
    const dot = document.createElement('div')
    dot.className = 'city-marker__dot'
    dot.setAttribute('aria-hidden', 'true')

    const pill = document.createElement('div')
    pill.className = 'city-marker__pill'
    pill.setAttribute('aria-hidden', 'true')

    const name = document.createElement('div')
    name.className = 'city-marker__name'
    name.setAttribute('aria-hidden', 'true')

    el.append(dot, pill, name)

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(feature.geometry.coordinates)
      .addTo(map)

    markers.push({ marker, pill, dot, name, id, data: properties, tshirtOk: false })
  }

  renderRange()
}

/**
 * Rebuilds every marker's pill as one cell per day in the selected range
 * (weekday + icon + temperature, each cell tinted by its own temperature).
 * Runs on range change and after a fetch — no network call needed.
 */
function renderRange() {
  const lo = Math.min(props.range.from, props.range.to)
  const hi = Math.max(props.range.from, props.range.to)

  for (const m of markers) {
    m.pill.replaceChildren()
    const titleParts: string[] = []
    const labelParts: string[] = []
    let anyTshirt = false

    for (let day = lo; day <= hi; day++) {
      const t = m.data.temps[day]
      const code = m.data.codes[day]
      if (t === undefined || code === undefined) continue
      const { svg, label } = weatherIcon(code)
      const tshirt = isTshirtWeather(t, code)
      if (tshirt) anyTshirt = true

      const cell = document.createElement('div')
      cell.className =
        props.tshirt && tshirt ? 'city-marker__day city-marker__day--tshirt' : 'city-marker__day'
      cell.style.backgroundColor = tempColor(t)
      cell.style.color = contrastText(t)

      const wday = document.createElement('span')
      wday.className = 'city-marker__wday'
      wday.textContent = shortDayLabel(day)

      const iconEl = document.createElement('span')
      iconEl.className = 'city-marker__icon'
      // Trusted, static, locally-authored SVG markup (see weatherIcon.ts) — no user input.
      iconEl.innerHTML = svg

      const tempEl = document.createElement('span')
      tempEl.className = 'city-marker__temp'
      tempEl.textContent = `${t}°`

      cell.append(wday, iconEl, tempEl)
      m.pill.append(cell)

      titleParts.push(`${shortDayLabel(day)} ${t}° ${label}`)
      labelParts.push(
        `${longDayLabel(day)}, ${t} degrees Celsius, ${label}${tshirt ? ', t-shirt weather' : ''}`,
      )
    }

    // The collapsed dot is tinted by the range's first day, so the minimal view still
    // reads as a temperature at a glance.
    const dotTemp = m.data.temps[lo]
    if (dotTemp !== undefined) m.dot.style.backgroundColor = tempColor(dotTemp)

    const fav = isFavorite(m.id)
    // Rebuild the label: capital star + name, then the custom flat heart (flamingo, via CSS)
    // for favorites — the DESIGN.md ink glyph, not the emoji.
    m.name.replaceChildren(document.createTextNode((m.data.capital ? '★ ' : '') + m.data.name))
    if (fav) {
      const favEl = document.createElement('span')
      favEl.className = 'city-marker__fav'
      favEl.setAttribute('aria-hidden', 'true')
      // Trusted, static, locally-authored SVG markup (see heartIcon.ts) — no user input.
      favEl.innerHTML = HEART_SVG
      m.name.append(favEl)
    }

    const place = `${m.data.name}, ${countryName(m.data.country)}${m.data.capital ? ' (capital)' : ''}`
    const el = m.marker.getElement()
    el.title = `${place}\n${titleParts.join('\n')}`
    el.setAttribute(
      'aria-label',
      `${place}. Forecast: ${labelParts.join('. ')}.${fav ? ' Favorited.' : ''}`,
    )
    el.setAttribute('aria-pressed', String(fav))
    m.tshirtOk = anyTshirt
  }

  declutterMarkers()
}

/**
 * Collapses markers that would overlap higher-priority ones into a minimal dot (rather
 * than hiding them), so every city stays visible and interactive. `markers` is in server
 * importance order (capitals first, then population), so ties resolve to the more
 * significant city. When the t-shirt filter is on, cities with no warm-and-dry day in the
 * range are hidden outright and left out of the layout. Runs after every (re)render — wider
 * ranges make chips bigger, so more collapse. Collapsed chips expand back on zoom-in.
 */
function declutterMarkers() {
  // The favorites filter controls *which cities are fetched*, so the only thing that hides a
  // fetched marker is the t-shirt filter (no warm-and-dry day in range). t-shirt wins.
  const isHidden = (m: CityMarker) => props.tshirt && !m.tshirtOk

  for (const m of markers) {
    const el = m.marker.getElement()
    el.classList.remove('city-marker--min')
    el.classList.toggle('city-marker--hidden', isHidden(m))
  }

  // Lay out only the markers that are still visible (importance order).
  const order = markers.map((_, i) => i).filter((i) => !isHidden(markers[i]!))

  updateEmptyState(order.length)

  const boxes: Box[] = order.map((i) => {
    const r = markers[i]!.marker.getElement().getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })

  const visible = declutter(boxes, MARKER_GAP)
  for (let k = 0; k < order.length; k++) {
    if (!visible[k]) markers[order[k]!]!.marker.getElement().classList.add('city-marker--min')
  }
}

/** Chooses the empty-state message when an active filter leaves nothing visible. */
function updateEmptyState(visibleCount: number) {
  const total = markers.length
  if (visibleCount > 0) {
    empty.value = null
    return
  }

  if (props.favoritesOnly) {
    if (total === 0) {
      // Nothing was even fetched — no favorites in this area (or none at all yet).
      empty.value =
        favorites.value.size === 0
          ? {
              icon: '❤️',
              text: 'No favorites yet — turn off the filter, then tap a city to add one.',
            }
          : { icon: '🔍', text: 'No favorite cities in this area.' }
    } else if (props.tshirt) {
      // Favorites are here, but the t-shirt filter hid them all.
      empty.value = {
        icon: '🧥',
        text: `Sorry, no T-shirt weather here (${total} favorite${total === 1 ? '' : 's'} hidden).`,
      }
    } else {
      empty.value = null
    }
  } else if (props.tshirt && total > 0) {
    empty.value = { icon: '🧥', text: 'Sorry, no T-shirt weather here.' }
  } else {
    empty.value = null
  }
}
</script>

<template>
  <div class="weather-map">
    <div ref="container" class="weather-map__canvas" />
    <div class="map-grain" aria-hidden="true" />

    <div class="map-actions">
      <div v-if="loading" class="map-status map-status--loading" role="status">
        <span class="map-status__spinner" aria-hidden="true" />
        Updating…
      </div>

      <div v-else-if="errorMessage" class="map-status map-status--error" role="alert">
        <span>{{ errorMessage }}</span>
        <button type="button" class="map-status__retry" @click="refreshData">Retry</button>
      </div>

      <button
        type="button"
        class="map-share"
        :aria-label="shareState === 'copied' ? 'Link copied' : 'Share this view'"
        @click="shareView"
      >
        <span class="map-share__icon" aria-hidden="true">{{
          shareState === 'copied' ? '✓' : ''
        }}</span>
        {{ shareState === 'copied' ? 'Copied!' : 'Share' }}
      </button>
    </div>

    <div v-if="empty" class="map-empty" role="status">
      <span class="map-empty__emoji" aria-hidden="true">{{ empty.icon }}</span>
      {{ empty.text }}
    </div>
  </div>
</template>

<style scoped>
.weather-map {
  position: absolute;
  inset: 0;
}

.weather-map__canvas {
  position: absolute;
  inset: 0;
}

/* Subtle print-grain for a vintage-poster feel; sits above the map but below the controls. */
.map-grain {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  opacity: 0.5;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
}

/* Bottom-left stack (clear of the full-width day selector on mobile): the Share button
   anchors at the corner and transient status pills stack above it. */
.map-actions {
  position: absolute;
  bottom: calc(30px + env(safe-area-inset-bottom));
  left: max(12px, env(safe-area-inset-left));
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  pointer-events: none;
}

/* On narrow screens the map attribution wraps into a full-width band along the bottom;
   lift the stack above it. */
@media (max-width: 700px) {
  .map-actions {
    bottom: calc(76px + env(safe-area-inset-bottom));
  }
}

.map-actions > * {
  pointer-events: auto;
}

.map-share {
  display: inline-flex;
  align-items: center;
  gap: 0px;
  border: 1px solid rgba(251, 243, 226, 0.14);
  background: var(--miami-shell, rgba(28, 59, 82, 0.9));
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 20px rgba(20, 40, 60, 0.3);
  color: var(--miami-cream, #fbf3e2);
  font-size: 13px;
  font-weight: 600;
  padding: 7px 13px;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background-color 0.14s ease,
    color 0.14s ease;
}

.map-share:hover {
  background: rgba(28, 59, 82, 0.98);
  color: #fff;
}

.map-share__icon {
  font-size: 14px;
  line-height: 1;
}

.map-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: var(--miami-shell, rgba(28, 59, 82, 0.9));
  backdrop-filter: blur(6px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.map-status--error {
  background: rgba(150, 30, 30, 0.9);
}

/* Empty state when the t-shirt filter matches nothing in view. */
.map-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 24px);
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--miami-shell, rgba(28, 59, 82, 0.9));
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.map-empty__emoji {
  font-size: 18px;
  line-height: 1;
}

.map-status__spinner {
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: map-status-spin 0.7s linear infinite;
}

.map-status__retry {
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: transparent;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.map-status__retry:hover {
  background: rgba(255, 255, 255, 0.15);
}

@keyframes map-status-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<style>
/* Keep MapLibre's own controls clear of the notch / rounded corners under viewport-fit=cover.
   These elements are added at runtime, so the rules must be global (not scoped). */
.maplibregl-ctrl-bottom-right {
  margin-bottom: env(safe-area-inset-bottom);
  margin-right: env(safe-area-inset-right);
}

.maplibregl-ctrl-bottom-left {
  margin-bottom: env(safe-area-inset-bottom);
  margin-left: env(safe-area-inset-left);
}

/* Markers are created outside the component tree, so these rules are global (not scoped). */
.city-marker {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  z-index: 1;
}

.city-marker--capital {
  z-index: 2;
}

.city-marker:focus-visible {
  outline: 3px solid #1a73e8;
  outline-offset: 2px;
  border-radius: 10px;
  z-index: 3;
}

/* Minimal (decluttered) state: hide the chip, show a small dot instead. */
.city-marker__dot {
  display: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #9ca3af;
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.city-marker--capital .city-marker__dot {
  width: 13px;
  height: 13px;
  border-width: 2px;
}

.city-marker--min {
  z-index: 0;
}

.city-marker--min .city-marker__pill,
.city-marker--min .city-marker__name {
  display: none;
}

.city-marker--min .city-marker__dot {
  display: block;
}

.city-marker__pill {
  display: flex;
  align-items: stretch;
  border-radius: 9px;
  overflow: hidden;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(60, 50, 30, 0.26);
  border: 2px solid var(--miami-cream-border, #f7eedb);
}

.city-marker--capital .city-marker__pill {
  border-color: var(--miami-cream, #fbf3e2);
  box-shadow: 0 2px 8px rgba(60, 50, 30, 0.32);
}

/* One cell per day in the selected range. */
.city-marker__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 2px 6px;
  min-width: 30px;
}

.city-marker__day + .city-marker__day {
  border-left: 1.5px solid rgba(251, 243, 226, 0.6);
}

/* T-shirt-weather mode: ring the warm-and-dry day cells, hide cities with none. */
.city-marker__day--tshirt {
  box-shadow: inset 0 0 0 2px var(--miami-teal, #2fa8a0);
}

.city-marker--hidden {
  display: none;
}

.city-marker__wday {
  font-size: 8.5px;
  font-weight: 800;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.8;
}

.city-marker__icon {
  display: flex;
  line-height: 1;
}

/* Flat Deco weather glyphs (weatherIcon.ts): gold sun, white/grey clouds, blue rain. A faint
   navy shadow separates them from the temperature-tinted chip, even on warm gold/butter days. */
.city-marker__icon svg {
  display: block;
  width: 15px;
  height: 15px;
  filter: drop-shadow(0 0.5px 0.5px rgba(28, 59, 82, 0.45));
}

.city-marker__temp {
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.01em;
}

.city-marker__name {
  margin-top: 4px;
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.4;
  color: var(--miami-navy, #1c3b52);
  white-space: nowrap;
  background: var(--miami-cream, #fbf3e2);
  border-radius: 5px;
  box-shadow: 0 1px 2px rgba(60, 50, 30, 0.22);
  pointer-events: none;
}

.city-marker--capital .city-marker__name {
  color: #12283a;
}

/* Favorite mark: the flat Deco heart (heartIcon.ts) in flamingo, inline after the city name. */
.city-marker__fav {
  display: inline-flex;
  vertical-align: -1px;
  margin-left: 3px;
  color: var(--miami-flamingo, #e86a93);
}

.city-marker__fav svg {
  display: block;
  width: 11px;
  height: 11px;
}
</style>
