import type { H3Event } from 'h3'

export interface RateLimitOptions {
  /** Max requests allowed per window, per client. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

/**
 * Best-effort per-IP fixed-window rate limiter. Backed by the `ratelimit` storage
 * mount — shared across instances when Upstash is configured, per-instance in local
 * dev. The get/set isn't atomic, so counts can undercount slightly under bursts; it's
 * an abuse backstop, not a billing gate. Throws a 429 (with Retry-After) when exceeded.
 */
export async function enforceRateLimit(event: H3Event, opts: RateLimitOptions): Promise<void> {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const storage = useStorage('ratelimit')

  const nowSeconds = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(nowSeconds / opts.windowSeconds) * opts.windowSeconds
  const key = `${ip}:${windowStart}`

  const count = (await storage.getItem<number>(key)) ?? 0

  if (count >= opts.limit) {
    const retryAfter = windowStart + opts.windowSeconds - nowSeconds
    setResponseHeader(event, 'Retry-After', Math.max(1, retryAfter))
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }

  await storage.setItem(key, count + 1, { ttl: opts.windowSeconds })
}
