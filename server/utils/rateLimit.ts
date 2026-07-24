import type { H3Event } from 'h3'
import { Redis } from '@upstash/redis'

export interface RateLimitOptions {
  /** Max requests allowed per window, per client. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

// One Upstash client, reused across invocations on a warm instance. Resolved from the same env vars
// the storage mount uses (nuxt.config.ts) — Upstash-native or Vercel KV-style names. When they're
// absent (local dev) we fall back to the in-memory `ratelimit` storage mount below.
let redis: Redis | null | undefined
function getRedis(): Redis | null {
  if (redis !== undefined) return redis
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  redis = url && token ? new Redis({ url, token }) : null
  return redis
}

/**
 * Per-IP fixed-window rate limiter. On the Upstash backend the count is bumped with an atomic INCR
 * (+ EXPIRE on the window's first hit), so a concurrent burst can't slip past the limit the way a
 * read-then-write can. Without Upstash (local dev) it degrades to a best-effort non-atomic count on
 * in-memory storage — single instance, not under attack, so the race is moot there.
 *
 * Scope: this is a backstop for function-invocation / storage-command cost, NOT the upstream guard.
 * Open-Meteo exposure is bounded elsewhere — the coordinates that can reach it are fixed (the
 * bundled city dataset) and cached per city. Per-IP limits are also inherently evadable by IP
 * rotation / botnets; Vercel's platform firewall is the front line for that, this is the floor.
 * Throws a 429 (with Retry-After) when the limit is exceeded.
 */
export async function enforceRateLimit(event: H3Event, opts: RateLimitOptions): Promise<void> {
  const ip = clientIp(event)
  const nowSeconds = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(nowSeconds / opts.windowSeconds) * opts.windowSeconds
  const key = `${ip}:${windowStart}`

  const count = await bumpCount(key, opts.windowSeconds)

  if (count > opts.limit) {
    const retryAfter = windowStart + opts.windowSeconds - nowSeconds
    setResponseHeader(event, 'Retry-After', Math.max(1, retryAfter))
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }
}

/** Bumps and returns the window's request count for `key`. Atomic on Upstash, best-effort in dev. */
async function bumpCount(key: string, windowSeconds: number): Promise<number> {
  const client = getRedis()
  if (client) {
    const count = await client.incr(key)
    // Set the TTL once, on the window's first request, so the counter self-expires.
    if (count === 1) await client.expire(key, windowSeconds)
    return count
  }

  const storage = useStorage('ratelimit')
  const count = ((await storage.getItem<number>(key)) ?? 0) + 1
  await storage.setItem(key, count, { ttl: windowSeconds })
  return count
}

/**
 * Best-effort client IP for the limit bucket. Prefer `x-real-ip` — set by the platform (e.g. Vercel)
 * and not client-forgeable — over the left-most `x-forwarded-for` hop, which a client can spoof to
 * rotate buckets. Falls back to the socket address, then a constant.
 */
function clientIp(event: H3Event): string {
  const realIp = getHeader(event, 'x-real-ip')
  if (realIp) return realIp.trim()
  return getRequestIP(event, { xForwardedFor: true }) || getRequestIP(event) || 'unknown'
}
