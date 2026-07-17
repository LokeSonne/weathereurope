<script setup lang="ts">
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl'
import { tempColorExpression } from '../utils/tempScale'

interface ForecastFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: Record<string, number>
  }>
}

const props = defineProps<{ dayOffset: number }>()

const EUROPE_BOUNDS: [number, number, number, number] = [-30, 30, 50, 75]
const SOURCE_ID = 'forecast-grid'
const LAYER_ID = 'forecast-heat'

const container = ref<HTMLDivElement>()
let map: MapLibreMap | undefined
let abortController: AbortController | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined

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

  map.on('load', () => {
    map!.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })

    map!.addLayer({
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 18, 6, 30, 10, 45],
        'circle-color': tempColorExpression(`temp_d${props.dayOffset}`),
        'circle-blur': 0.9,
        'circle-opacity': 0.65,
      },
    })

    void refreshGrid()
  })

  map.on('moveend', () => scheduleRefresh())
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  abortController?.abort()
  map?.remove()
})

watch(
  () => props.dayOffset,
  (day) => {
    map?.setPaintProperty(LAYER_ID, 'circle-color', tempColorExpression(`temp_d${day}`))
  },
)

function scheduleRefresh() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(refreshGrid, 400)
}

async function refreshGrid() {
  if (!map) return
  const bounds = map.getBounds()
  abortController?.abort()
  abortController = new AbortController()

  try {
    const data = await $fetch<ForecastFeatureCollection>('/api/grid-forecast', {
      query: {
        minLng: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLng: bounds.getEast(),
        maxLat: bounds.getNorth(),
        zoom: map.getZoom(),
      },
      signal: abortController.signal,
    })
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(data as unknown as Parameters<GeoJSONSource['setData']>[0])
  } catch (error) {
    if ((error as { name?: string }).name !== 'AbortError') {
      console.error('Failed to load forecast grid', error)
    }
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
