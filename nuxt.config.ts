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

const upstashMount = redisUrl && redisToken
  ? { driver: 'upstash', url: redisUrl, token: redisToken }
  : undefined

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],

  app: {
    head: {
      title: 'T-Shirt Weather',
      meta: [
        { name: 'description', content: 'T-Shirt Weather — see where in Europe it’s warm enough for a t-shirt: live temperatures and conditions, from capitals to towns.' },
        { property: 'og:title', content: 'T-Shirt Weather' },
        { property: 'og:description', content: 'See where in Europe it’s warm enough for a t-shirt: live temperatures and conditions, from capitals to towns.' },
        { property: 'og:type', content: 'website' },
      ],
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
