<script setup lang="ts">
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { tempColor, contrastText } from '../utils/tempScale'
import { weatherIcon } from '../utils/weatherIcon'

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
  icon: HTMLElement
  temp: HTMLElement
  name: HTMLElement
  data: CityFeature['properties']
}

const props = defineProps<{ dayOffset: number }>()

const EUROPE_BOUNDS: [number, number, number, number] = [-30, 30, 50, 75]

const container = ref<HTMLDivElement>()
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

watch(() => props.dayOffset, renderDay)

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
  abortController = new AbortController()

  try {
    const data = await $fetch<CityFeatureCollection>('/api/city-forecast', {
      query: {
        minLng: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLng: bounds.getEast(),
        maxLat: bounds.getNorth(),
        zoom: map.getZoom(),
      },
      signal: abortController.signal,
    })
    renderMarkers(data.features)
  } catch (error) {
    if ((error as { name?: string }).name !== 'AbortError') {
      console.error('Failed to load city forecasts', error)
    }
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

    const pill = document.createElement('div')
    pill.className = 'city-marker__pill'

    const icon = document.createElement('span')
    icon.className = 'city-marker__icon'

    const temp = document.createElement('span')
    temp.className = 'city-marker__temp'

    pill.append(icon, temp)

    const name = document.createElement('div')
    name.className = 'city-marker__name'
    name.textContent = (properties.capital ? '★ ' : '') + properties.name

    el.append(pill, name)

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(feature.geometry.coordinates)
      .addTo(map)

    markers.push({ marker, pill, icon, temp, name, data: properties })
  }

  renderDay()
}

/** Updates every marker's pill (temperature + icon + color) to the selected day, without refetching. */
function renderDay() {
  const day = props.dayOffset
  for (const m of markers) {
    const t = m.data.temps[day]
    const code = m.data.codes[day]
    if (t === undefined || code === undefined) continue
    const { icon, label } = weatherIcon(code)
    m.icon.textContent = icon
    m.temp.textContent = `${t}°`
    m.pill.style.backgroundColor = tempColor(t)
    m.pill.style.color = contrastText(t)
    m.marker.getElement().title = `${m.data.name}, ${m.data.country} — ${label}, ${t}°C`
  }
}
</script>

<template>
  <div ref="container" class="weather-map" />
</template>

<style scoped>
.weather-map {
  position: absolute;
  inset: 0;
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

.city-marker__pill {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.city-marker--capital .city-marker__pill {
  border-color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
}

.city-marker__icon {
  font-size: 14px;
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
