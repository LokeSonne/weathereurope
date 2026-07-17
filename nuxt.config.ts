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

  runtimeConfig: {
    // Contact string sent in the Open-Meteo User-Agent. Override in prod with
    // NUXT_OPEN_METEO_CONTACT (a role address, not a personal one).
    openMeteoContact: 'ops@weathereurope.app',
  },

  nitro: {
    storage: upstashMount
      ? { 'forecast-cache': upstashMount, ratelimit: upstashMount }
      : {},
  },
})
