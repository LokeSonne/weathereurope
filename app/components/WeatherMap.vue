<script setup lang="ts">
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { tempColor, contrastText } from '../utils/tempScale'
import { weatherIcon } from '../utils/weatherIcon'
import { shortDayLabel, longDayLabel } from '../utils/days'
import { declutter, type Box } from '../utils/declutter'
import { isTshirtWeather } from '../utils/tshirt'

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
  data: CityFeature['properties']
  /** Whether any day in the current range is t-shirt weather (drives the highlight, and
   *  visibility when the t-shirt filter is on). */
  tshirtOk: boolean
}

const props = defineProps<{ range: { from: number; to: number }; tshirt: boolean }>()

const EUROPE_BOUNDS: [number, number, number, number] = [-30, 30, 50, 75]

const container = ref<HTMLDivElement>()
const loading = ref(false)
const errorMessage = ref<string | null>(null)
// True when the t-shirt filter is on but no city in view has a matching day.
const noTshirtMatches = ref(false)

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
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [10, 50],
    zoom: 3.5,
    minZoom: 2,
    maxZoom: 12,
    maxBounds: EUROPE_BOUNDS,
  })

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

  map.on('load', () => void refreshCities())
  map.on('moveend', () => scheduleRefresh())
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  abortController?.abort()
  clearMarkers()
  map?.remove()
})

watch(() => [props.range.from, props.range.to, props.tshirt], renderRange)

function scheduleRefresh() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => void refreshCities(), 400)
}

function clearMarkers() {
  for (const m of markers) m.marker.remove()
  markers = []
}

async function refreshCities() {
  if (!map) return
  const bounds = map.getBounds()
  abortController?.abort()
  const controller = new AbortController()
  abortController = controller

  loading.value = true
  errorMessage.value = null

  try {
    const data = await $fetch<CityFeatureCollection>('/api/city-forecast', {
      query: {
        minLng: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLng: bounds.getEast(),
        maxLat: bounds.getNorth(),
        zoom: map.getZoom(),
      },
      signal: controller.signal,
    })
    renderMarkers(data.features)
  } catch (error) {
    // A newer request superseded this one — ignore its outcome entirely.
    if ((error as { name?: string }).name === 'AbortError') return
    console.error('Failed to load city forecasts', error)
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

    const el = document.createElement('div')
    el.className = properties.capital ? 'city-marker city-marker--capital' : 'city-marker'
    // Expose each marker as a single labelled image; renderRange() fills in the label.
    // Focusable so keyboard users can reach the forecast the tooltip shows on hover.
    el.setAttribute('role', 'img')
    el.setAttribute('tabindex', '0')

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
    name.textContent = (properties.capital ? '★ ' : '') + properties.name

    el.append(dot, pill, name)

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(feature.geometry.coordinates)
      .addTo(map)

    markers.push({ marker, pill, dot, data: properties, tshirtOk: false })
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
      const { icon, label } = weatherIcon(code)
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
      iconEl.textContent = icon

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

    const place = `${m.data.name}, ${countryName(m.data.country)}${m.data.capital ? ' (capital)' : ''}`
    const el = m.marker.getElement()
    el.title = `${place}\n${titleParts.join('\n')}`
    el.setAttribute('aria-label', `${place}. Forecast: ${labelParts.join('. ')}.`)
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
  // Restore full chips, and hide cities with no matching day when the t-shirt filter is on.
  for (const m of markers) {
    const el = m.marker.getElement()
    el.classList.remove('city-marker--min')
    el.classList.toggle('city-marker--hidden', props.tshirt && !m.tshirtOk)
  }

  // Lay out only the markers that are still visible (importance order).
  const order = markers.map((_, i) => i).filter((i) => !(props.tshirt && !markers[i]!.tshirtOk))

  // Filter is on, cities are in view, but none of them match.
  noTshirtMatches.value = props.tshirt && markers.length > 0 && order.length === 0

  const boxes: Box[] = order.map((i) => {
    const r = markers[i]!.marker.getElement().getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })

  const visible = declutter(boxes, MARKER_GAP)
  for (let k = 0; k < order.length; k++) {
    if (!visible[k]) markers[order[k]!]!.marker.getElement().classList.add('city-marker--min')
  }
}
</script>

<template>
  <div class="weather-map">
    <div ref="container" class="weather-map__canvas" />

    <div v-if="loading" class="map-status map-status--loading" role="status">
      <span class="map-status__spinner" aria-hidden="true" />
      Updating…
    </div>

    <div v-else-if="errorMessage" class="map-status map-status--error" role="alert">
      <span>{{ errorMessage }}</span>
      <button type="button" class="map-status__retry" @click="refreshCities">Retry</button>
    </div>

    <div v-if="noTshirtMatches" class="map-empty" role="status">
      <span class="map-empty__emoji" aria-hidden="true">🧥</span>
      Sorry, no T-shirt weather here.
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

.map-status {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: rgba(20, 24, 30, 0.8);
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
  background: rgba(20, 24, 30, 0.85);
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
.maplibregl-ctrl-top-right {
  margin-top: env(safe-area-inset-top);
  margin-right: env(safe-area-inset-right);
}

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
  cursor: default;
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
  border-radius: 8px;
  overflow: hidden;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.city-marker--capital .city-marker__pill {
  border-color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
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
  border-left: 1px solid rgba(255, 255, 255, 0.4);
}

/* T-shirt-weather mode: ring the warm-and-dry day cells, hide cities with none. */
.city-marker__day--tshirt {
  box-shadow: inset 0 0 0 2px #10b981;
}

.city-marker--hidden {
  display: none;
}

.city-marker__wday {
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  opacity: 0.85;
}

.city-marker__icon {
  font-size: 14px;
  line-height: 1;
}

.city-marker__temp {
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.city-marker__name {
  margin-top: 3px;
  padding: 1px 5px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
  color: #14181e;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.city-marker--capital .city-marker__name {
  font-weight: 700;
}
</style>
