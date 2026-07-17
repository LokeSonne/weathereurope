// https://nuxt.com/docs/api/configuration/nuxt-config

// Use a shared Upstash Redis store for the forecast cache + rate limiter when its
// credentials are present (e.g. on Vercel). Without them — local dev — Nitro falls
// back to its default in-memory storage. Env vars are read at build time, which is
// when Vercel injects them, so the driver is baked into the deployed bundle.
const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

const upstashMount = hasUpstash
  ? {
      driver: 'upstash',
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }
  : undefined

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],

  app: {
    head: {
      title: 'Weather Europe',
      link: [
        // SVG for modern browsers, .ico fallback, PNG for iOS home-screen.
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico', sizes: '16x16 32x32' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      ],
    },
  },

  runtimeConfig: {
    // Contact string sent in the Open-Meteo User-Agent. Override in prod with
    // NUXT_OPEN_METEO_CONTACT (a role address, not a personal one).
    openMeteoContact: 'ops@weathereurope.app',
    // Licensing knobs (see README). Set NUXT_OPEN_METEO_API_KEY for the commercial
    // plan (auto-switches to the customer endpoint), or NUXT_OPEN_METEO_BASE_URL to
    // point at a self-hosted Open-Meteo instance. Empty → free non-commercial API.
    openMeteoApiKey: '',
    openMeteoBaseUrl: '',
  },

  nitro: {
    storage: upstashMount
      ? { 'forecast-cache': upstashMount, ratelimit: upstashMount }
      : {},
  },
})
