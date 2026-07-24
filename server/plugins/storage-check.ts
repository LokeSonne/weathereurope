/**
 * Boot-time check that the forecast cache is backed by a shared, durable store in production.
 *
 * The storage driver is chosen at *build* time from env vars (see nuxt.config.ts). If the Upstash /
 * Vercel-KV credentials weren't present then, Nitro silently falls back to per-instance in-memory
 * storage: the app still works, but each serverless instance keeps its own cache, cold starts wipe
 * it, and hit rates collapse — so under load every instance re-hits Open-Meteo. That failure is
 * invisible without a check like this. It runs once per instance on startup and:
 *
 *   1. inspects the *actual mounted driver* (not just current env vars, which on Vercel can differ
 *      from build time — the classic "added the vars but didn't redeploy" trap), and
 *   2. when a durable driver is mounted, does one live round-trip to catch wrong/expired creds.
 *
 * Logged loudly; never fatal — a degraded cache still serves, and taking the site down during a
 * launch would be worse than running warm-but-unshared.
 */
export default defineNitroPlugin(() => {
  const onVercel = Boolean(process.env.VERCEL)
  const driver = useStorage().getMount('forecast-cache:probe').driver?.name ?? 'unknown'

  if (driver === 'memory') {
    if (onVercel) {
      console.error(
        [
          '',
          '════════════════════════════════════════════════════════════════════',
          '[storage] ERROR: forecast-cache is IN-MEMORY on Vercel.',
          '  Per-instance, wiped on cold start, not shared across instances — the',
          '  cache barely works under load and each instance re-hits Open-Meteo.',
          '  Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or',
          '  KV_REST_API_URL / KV_REST_API_TOKEN) in the Vercel project env, then',
          '  REDEPLOY — the driver is baked in at build time.',
          '════════════════════════════════════════════════════════════════════',
          '',
        ].join('\n'),
      )
    } else {
      console.info('[storage] forecast-cache: in-memory (expected in local dev).')
    }
    return
  }

  // A durable driver is mounted — confirm it actually answers (catches wrong/expired credentials).
  void verifyRoundTrip(driver)
})

async function verifyRoundTrip(driver: string): Promise<void> {
  const storage = useStorage('forecast-cache')
  const key = '__healthcheck__'
  try {
    await storage.setItem(key, { ok: 1 }, { ttl: 60 })
    const read = await storage.getItem<{ ok: number }>(key)
    await storage.removeItem(key)
    if (read?.ok === 1) {
      console.info(`[storage] forecast-cache: "${driver}" reachable ✓ (shared, durable).`)
    } else {
      console.error(
        `[storage] ERROR: forecast-cache "${driver}" round-trip returned an unexpected value — cache may be misconfigured.`,
      )
    }
  } catch (error) {
    console.error(
      `[storage] ERROR: forecast-cache "${driver}" is configured but unreachable (check credentials). Falling back to no effective shared cache under load.`,
      error,
    )
  }
}
