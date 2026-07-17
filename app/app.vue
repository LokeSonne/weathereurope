<script setup lang="ts">
const dayOffset = ref(0)
</script>

<template>
  <div class="page">
    <NuxtRouteAnnouncer />
    <ClientOnly>
      <WeatherMap :day-offset="dayOffset" />
    </ClientOnly>

    <div class="overlay overlay--top">
      <DayToggle v-model="dayOffset" />
    </div>

    <div class="overlay overlay--bottom-left">
      <TempLegend />
    </div>

    <div class="attribution">
      Weather data: Open-Meteo (MET Norway model) · Map: OpenFreeMap / OpenStreetMap contributors
    </div>
  </div>
</template>

<style>
html,
body,
#__nuxt {
  height: 100%;
  margin: 0;
}
</style>

<style scoped>
.page {
  position: relative;
  height: 100vh;
  width: 100vw;
  font-family: system-ui, sans-serif;
}

.overlay {
  position: absolute;
  z-index: 10;
}

.overlay--top {
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
}

.overlay--bottom-left {
  bottom: 24px;
  left: 12px;
}

.attribution {
  position: absolute;
  bottom: 4px;
  right: 8px;
  z-index: 10;
  font-size: 10px;
  color: rgba(0, 0, 0, 0.6);
  background: rgba(255, 255, 255, 0.6);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
