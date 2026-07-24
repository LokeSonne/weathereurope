import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enforceRateLimit } from '../server/utils/rateLimit'

function createMemoryStorage() {
  const map = new Map<string, unknown>()
  return {
    map,
    getItem: vi.fn(async (key: string) => (map.has(key) ? map.get(key) : null)),
    setItem: vi.fn(async (key: string, value: unknown) => {
      map.set(key, value)
    }),
  }
}

let storage: ReturnType<typeof createMemoryStorage>
let setHeader: ReturnType<typeof vi.fn>
const event = {} as never

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-17T12:00:30Z'))
  storage = createMemoryStorage()
  setHeader = vi.fn()
  vi.stubGlobal('useStorage', () => storage)
  // No x-real-ip in tests → clientIp falls through to getRequestIP.
  vi.stubGlobal('getHeader', () => undefined)
  vi.stubGlobal('getRequestIP', () => '1.2.3.4')
  vi.stubGlobal('setResponseHeader', setHeader)
  vi.stubGlobal('createError', (o: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(o.statusMessage), o),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('enforceRateLimit', () => {
  it('allows requests up to the limit', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(enforceRateLimit(event, { limit: 3, windowSeconds: 60 })).resolves.toBeUndefined()
    }
  })

  it('throws 429 with a Retry-After header once the limit is exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await enforceRateLimit(event, { limit: 3, windowSeconds: 60 })
    }

    await expect(enforceRateLimit(event, { limit: 3, windowSeconds: 60 })).rejects.toMatchObject({
      statusCode: 429,
    })

    expect(setHeader).toHaveBeenCalledWith(event, 'Retry-After', expect.any(Number))
    const retryAfter = setHeader.mock.calls.at(-1)![2] as number
    expect(retryAfter).toBeGreaterThan(0)
  })

  it('separates counters by client IP', async () => {
    for (let i = 0; i < 3; i++) {
      await enforceRateLimit(event, { limit: 3, windowSeconds: 60 })
    }
    // A different IP starts fresh.
    vi.stubGlobal('getRequestIP', () => '9.9.9.9')
    await expect(enforceRateLimit(event, { limit: 3, windowSeconds: 60 })).resolves.toBeUndefined()
  })
})
