<script setup lang="ts">
import { parseShareQuery } from './utils/shareView'

// Restore a shared view from the URL (?lat&lng&z&from&to&tshirt); fall back to defaults.
const shared = parseShareQuery(useRoute().query)
const range = ref(shared.range ?? { from: 0, to: 2 })
const tshirt = ref(shared.tshirt ?? false)
const favoritesOnly = ref(false)
const initialView = shared.view

const TITLE = 'T-Shirt Weather'
const DESCRIPTION =
  'See where in the world it’s warm enough for a t-shirt — live temperatures and weather ' +
  'conditions for cities from capitals to towns, over a selectable date range.'

const siteUrl = useRuntimeConfig().public.siteUrl
const ogImage = `${siteUrl}/og-image.png`
const imageAlt = 'A world weather map showing city temperatures and conditions'

useSeoMeta({
  description: DESCRIPTION,
  ogType: 'website',
  ogSiteName: TITLE,
  ogTitle: TITLE,
  ogDescription: DESCRIPTION,
  ogUrl: siteUrl,
  ogLocale: 'en',
  ogImage,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: imageAlt,
  twitterCard: 'summary_large_image',
  twitterTitle: TITLE,
  twitterDescription: DESCRIPTION,
  twitterImage: ogImage,
  twitterImageAlt: imageAlt,
})

useHead({
  link: [{ rel: 'canonical', href: siteUrl }],
  // Managed by unhead (not hydrated by Vue), so it avoids the <noscript> hydration pitfall.
  noscript: [
    {
      tagPosition: 'bodyOpen',
      innerHTML:
        '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:16px/1.5 system-ui,sans-serif;color:#1c3b52;background:#f4e9d8">T-Shirt Weather is an interactive weather map of the world. Please enable JavaScript to view live temperatures and conditions across the globe.</div>',
    },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: TITLE,
        url: siteUrl,
        description: DESCRIPTION,
        applicationCategory: 'Weather',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      }),
    },
  ],
})
</script>

<template>
  <div class="page">
    <NuxtRouteAnnouncer />

    <!-- Crawlable, screen-reader-friendly heading + intro for an otherwise map-only page. -->
    <header class="visually-hidden">
      <h1>T-Shirt Weather — live weather map of the world</h1>
      <p>
        An interactive map showing current temperatures and weather conditions for cities
        worldwide, from capital cities down to small towns. Pick a date range up to a week ahead,
        and toggle “t-shirt weather” to highlight where it’s warm and dry enough for just a tee.
        Weather data from Open-Meteo; city data from GeoNames.
      </p>
    </header>

    <ClientOnly>
      <WeatherMap
        :range="range"
        :tshirt="tshirt"
        :favorites-only="favoritesOnly"
        :initial-view="initialView"
      />
    </ClientOnly>

    <!-- Poster margin + corner wordmark: purely decorative, never intercept map gestures. -->
    <div class="poster-frame" aria-hidden="true" />
    <div class="wordmark" aria-hidden="true">
      <div class="wordmark__rule" />
      <div class="wordmark__title">T-Shirt Weather</div>
      <div class="wordmark__rule" />
    </div>

    <div class="overlay overlay--top">
      <DayRange v-model="range" />
      <div class="overlay__toggles">
        <MapToggle v-model="tshirt" label="T-shirt weather" active-color="var(--miami-teal)">
          <template #icon><IconTshirt /></template>
        </MapToggle>
        <MapToggle v-model="favoritesOnly" label="Favorites" active-color="var(--miami-flamingo)">
          <template #icon><IconHeart /></template>
        </MapToggle>
      </div>
    </div>

    <div class="attribution">
      Weather: Open-Meteo · Cities:
      <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0) ·
      Map: OpenFreeMap / OpenStreetMap contributors
    </div>
  </div>
</template>

<style>
/* Miami Art Deco palette — single source of truth for accent/ink tokens (see DESIGN.md).
   The temperature ramp lives in app/utils/tempScale.ts; the basemap tint in WeatherMap.vue. */
:root {
  --miami-flamingo: #e86a93; /* primary accent: date-range selection, Favorites active */
  --miami-teal: #2fa8a0; /* T-shirt-weather active + day-cell ring */
  --miami-navy: #1c3b52; /* ink / text on light chips, city names */
  --miami-shell: rgba(28, 59, 82, 0.9); /* frosted deco-navy control shell */
  --miami-cream: #fbf3e2; /* text on dark chips, name-label background */
  --miami-cream-border: #f7eedb; /* chip / pill outlines, poster margin */
  --font-display: 'Poiret One', 'Century Gothic', system-ui, sans-serif; /* Deco wordmark */
}

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

/* Present for crawlers and screen readers, but off-screen visually. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}


/* Poster margin: a thin cream Deco border inset from the screen edges (above the map + grain,
   below the interactive overlays). Rounded corners nod to streamline moderne. */
.poster-frame {
  position: absolute;
  top: calc(8px + env(safe-area-inset-top));
  right: calc(8px + env(safe-area-inset-right));
  bottom: calc(8px + env(safe-area-inset-bottom));
  left: calc(8px + env(safe-area-inset-left));
  z-index: 7;
  pointer-events: none;
  border: 2px solid rgba(251, 243, 226, 0.92);
  border-radius: 12px;
  box-shadow:
    inset 0 0 0 1px rgba(28, 59, 82, 0.22),
    0 0 0 1px rgba(28, 59, 82, 0.1);
}

/* Corner poster wordmark in the Deco display face, flanked by streamline "speed-lines". */
.wordmark {
  position: absolute;
  top: calc(20px + env(safe-area-inset-top));
  left: calc(22px + env(safe-area-inset-left));
  z-index: 8;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.wordmark__title {
  font-family: var(--font-display);
  font-size: 23px;
  font-weight: 400;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  line-height: 1;
  color: var(--miami-navy);
  text-shadow:
    0 1px 0 rgba(251, 243, 226, 0.95),
    0 0 12px rgba(251, 243, 226, 0.8);
}

.wordmark__rule {
  width: 100%;
  min-width: 132px;
  height: 8px;
  background: repeating-linear-gradient(
    to bottom,
    var(--miami-flamingo) 0 1.5px,
    transparent 1.5px 3px
  );
}

/* The poster chrome (margin frame + corner wordmark) is a large-screen enhancement. On narrow
   screens the day-range spans the top edge-to-edge and the attribution becomes a full-width
   bottom band, so a rectangular margin would cross both — hide the chrome and keep mobile clean. */
@media (max-width: 720px) {
  .poster-frame,
  .wordmark {
    display: none;
  }
}

.overlay {
  position: absolute;
  z-index: 10;
}

.overlay--top {
  /* Clear the status bar / camera cut-out, and keep a small gap from the screen edges. */
  top: calc(12px + env(safe-area-inset-top));
  left: 0;
  right: 0;
  padding-left: max(8px, env(safe-area-inset-left));
  padding-right: max(8px, env(safe-area-inset-right));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  /* The full-width band must not swallow map drags / clicks in its empty areas. */
  pointer-events: none;
}

.overlay--top > * {
  pointer-events: auto;
}

.overlay__toggles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.attribution {
  position: absolute;
  bottom: calc(4px + env(safe-area-inset-bottom));
  right: calc(8px + env(safe-area-inset-right));
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
