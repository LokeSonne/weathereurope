<script setup lang="ts">
const range = ref({ from: 0, to: 2 })
const tshirt = ref(false)
</script>

<template>
  <div class="page">
    <NuxtRouteAnnouncer />
    <ClientOnly>
      <WeatherMap :range="range" :tshirt="tshirt" />
    </ClientOnly>

    <div class="overlay overlay--top">
      <DayRange v-model="range" />
      <TshirtToggle v-model="tshirt" />
    </div>

    <div class="attribution">
      Weather: Open-Meteo (MET Norway model) · Cities:
      <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0) ·
      Map: OpenFreeMap / OpenStreetMap contributors
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
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

.attribution a {
  color: inherit;
  text-decoration: underline;
}
</style>
