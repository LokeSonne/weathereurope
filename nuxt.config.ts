// https://nuxt.com/docs/api/configuration/nuxt-config

// Use a shared Upstash Redis store for the forecast cache + rate limiter when its
// credentials are present (e.g. on Vercel). Without them — local dev — Nitro falls
// back to its default in-memory storage. Env vars are read at build time, which is
// when Vercel injects them, so the driver is baked into the deployed bundle.
// Accept either the Upstash-native names or Vercel's KV-style names — both are just the
// Redis REST URL + token. Set a *custom prefix* in the Vercel integration and these stop
// matching, so leave that prefix empty.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

const upstashMount =
  redisUrl && redisToken ? { driver: 'upstash', url: redisUrl, token: redisToken } : undefined

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@vercel/analytics', '@nuxt/fonts'],

  // Self-host the Deco display face for the poster wordmark (no runtime Google dependency).
  fonts: {
    families: [{ name: 'Poiret One', provider: 'google', weights: [400] }],
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'T-Shirt Weather',
      meta: [
        // viewport-fit=cover lets the map fill the screen edge-to-edge and enables the
        // env(safe-area-inset-*) values the overlays use to dodge the notch / rounded corners.
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#6fd0ce' },
        // Description, Open Graph, Twitter and canonical are set in app.vue via useSeoMeta,
        // where the runtime siteUrl is available for absolute URLs.
      ],
      link: [
        // SVG for modern browsers, .ico fallback, PNG for iOS home-screen.
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico', sizes: '16x16 32x32' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        // PWA manifest — makes the app installable ("Install app" / Add to Home Screen).
        { rel: 'manifest', href: '/manifest.json' },
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
    public: {
      // Canonical origin for SEO (canonical link, og:url, og:image, sitemap). Auto-detected
      // on Vercel; override with NUXT_PUBLIC_SITE_URL for a custom domain.
      siteUrl:
        process.env.NUXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : 'http://localhost:3000'),
    },
  },

  nitro: {
    storage: upstashMount ? { 'forecast-cache': upstashMount, ratelimit: upstashMount } : {},
  },
})
