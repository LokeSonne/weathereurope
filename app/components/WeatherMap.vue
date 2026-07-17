<script setup lang="ts">
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { tempColor, contrastText } from '../utils/tempScale'
import { weatherIcon } from '../utils/weatherIcon'
import { shortDayLabel, longDayLabel } from '../utils/days'
import { declutter, type Box } from '../utils/declutter'

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
  data: CityFeature['properties']
}

const props = defineProps<{ range: { from: number; to: number } }>()

const EUROPE_BOUNDS: [number, number, number, number] = [-30, 30, 50, 75]

const container = ref<HTMLDivElement>()
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const hiddenCount = ref(0)

/** Minimum screen-space gap (px) enforced between visible markers. */
const MARKER_GAP = 4

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

watch(() => [props.range.from, props.range.to], renderRange)

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

    const pill = document.createElement('div')
    pill.className = 'city-marker__pill'
    pill.setAttribute('aria-hidden', 'true')

    const name = document.createElement('div')
    name.className = 'city-marker__name'
    name.setAttribute('aria-hidden', 'true')
    name.textContent = (properties.capital ? '★ ' : '') + properties.name

    el.append(pill, name)

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(feature.geometry.coordinates)
      .addTo(map)

    markers.push({ marker, pill, data: properties })
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

    for (let day = lo; day <= hi; day++) {
      const t = m.data.temps[day]
      const code = m.data.codes[day]
      if (t === undefined || code === undefined) continue
      const { icon, label } = weatherIcon(code)

      const cell = document.createElement('div')
      cell.className = 'city-marker__day'
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
      labelParts.push(`${longDayLabel(day)}, ${t} degrees Celsius, ${label}`)
    }

    const place = `${m.data.name}, ${countryName(m.data.country)}${m.data.capital ? ' (capital)' : ''}`
    const el = m.marker.getElement()
    el.title = `${place}\n${titleParts.join('\n')}`
    el.setAttribute('aria-label', `${place}. Forecast: ${labelParts.join('. ')}.`)
  }

  declutterMarkers()
}

/**
 * Hides markers that would overlap higher-priority ones. `markers` is in server
 * importance order (capitals first, then population), so ties resolve to the more
 * significant city. Runs after every (re)render — wider ranges make chips bigger,
 * so more get suppressed, keeping the map legible. Hidden markers reappear on zoom-in
 * as they stop colliding.
 */
function declutterMarkers() {
  // Show all first so every marker is measurable at its true size.
  for (const m of markers) m.marker.getElement().style.display = ''

  const boxes: Box[] = markers.map((m) => {
    const r = m.marker.getElement().getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })

  const visible = declutter(boxes, MARKER_GAP)
  let hidden = 0
  for (let i = 0; i < markers.length; i++) {
    if (!visible[i]) {
      markers[i]!.marker.getElement().style.display = 'none'
      hidden++
    }
  }
  hiddenCount.value = hidden
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

    <div v-if="hiddenCount > 0" class="map-hint" role="status">
      +{{ hiddenCount }} more — zoom in
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

.map-hint {
  position: absolute;
  bottom: 44px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  background: rgba(20, 24, 30, 0.8);
  backdrop-filter: blur(6px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  pointer-events: none;
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
  margin-top: 2px;
  font-size: 11px;
  font-weight: 600;
  color: #1a1f26;
  white-space: nowrap;
  text-shadow:
    0 0 3px rgba(255, 255, 255, 0.9),
    0 0 3px rgba(255, 255, 255, 0.9);
  pointer-events: none;
}

.city-marker--capital .city-marker__name {
  font-weight: 700;
}
</style>
