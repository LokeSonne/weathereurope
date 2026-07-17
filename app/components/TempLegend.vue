<script setup lang="ts">
import { TEMP_STOPS, TEMP_MIN, TEMP_MAX } from '../utils/tempScale'

const gradient = `linear-gradient(to right, ${TEMP_STOPS.map(([, color]) => color).join(', ')})`
</script>

<template>
  <div class="legend">
    <div class="legend__bar" :style="{ background: gradient }" />
    <div class="legend__labels">
      <span>{{ TEMP_MIN }}°C</span>
      <span>{{ TEMP_MAX }}°C</span>
    </div>
  </div>
</template>

<style scoped>
.legend {
  background: rgba(20, 24, 30, 0.75);
  backdrop-filter: blur(6px);
  border-radius: 8px;
  padding: 8px 10px;
  color: rgba(255, 255, 255, 0.85);
  width: 160px;
}

.legend__bar {
  height: 8px;
  border-radius: 4px;
}

.legend__labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-top: 4px;
}
</style>
