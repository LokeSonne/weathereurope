import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolveForecasts } from '../server/utils/openMeteo'

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

function makeResponse() {
  return {
    daily: {
      temperature_2m_max: Array.from({ length: 8 }, (_, i) => 20 + i),
      temperature_2m_min: Array.from({ length: 8 }, (_, i) => 10 + i),
      weather_code: Array.from({ length: 8 }, () => 2),
    },
  }
}

const NOW = new Date('2026-07-17T12:00:00Z')
let storage: ReturnType<typeof createMemoryStorage>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  storage = createMemoryStorage()
  fetchMock = vi.fn()
  vi.stubGlobal('useStorage', () => storage)
  vi.stubGlobal('useRuntimeConfig', () => ({ openMeteoContact: 'test@example.com' }))
  vi.stubGlobal('$fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('resolveForecasts', () => {
  it('fetches on a cache miss, maps the response, and caches with a timestamp', async () => {
    fetchMock.mockResolvedValue(makeResponse())

    const [forecast] = await resolveForecasts([{ lat: 48.85, lng: 2.35 }])

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(forecast!.temps[0]).toBe(20) // today's daily high (max[0])
    expect(forecast!.codes[0]).toBe(2) // today's daily code
    expect(forecast!.temps).toHaveLength(8)
    expect(forecast!.temps[1]).toBe(21) // daily max[1]

    const cached = storage.map.get('forecast:48.85:2.35') as { fetchedAt: number }
    expect(cached.fetchedAt).toBe(NOW.getTime())
  })

  it('serves a fresh cache hit without calling Open-Meteo', async () => {
    storage.map.set('forecast:10:20', {
      temps: [5, 6, 7, 8, 9, 10, 11, 12],
      codes: [1, 1, 1, 1, 1, 1, 1, 1],
      fetchedAt: NOW.getTime(),
    })

    const [forecast] = await resolveForecasts([{ lat: 10, lng: 20 }])

    expect(fetchMock).not.toHaveBeenCalled()
    expect(forecast!.temps[0]).toBe(5)
  })

  it('serves stale data when the upstream request fails', async () => {
    storage.map.set('forecast:10:20', {
      temps: [1, 2, 3, 4, 5, 6, 7, 8],
      codes: [3, 3, 3, 3, 3, 3, 3, 3],
      fetchedAt: NOW.getTime() - 3 * 60 * 60 * 1000, // 3h old → stale
    })
    fetchMock.mockRejectedValue(new Error('upstream 503'))

    const [forecast] = await resolveForecasts([{ lat: 10, lng: 20 }])

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(forecast!.temps[0]).toBe(1) // stale value served, no throw
  })

  it('omits points that have no cached data when the upstream request fails', async () => {
    fetchMock.mockRejectedValue(new Error('upstream 503'))

    const result = await resolveForecasts([{ lat: 10, lng: 20 }])

    expect(result[0]).toBeUndefined()
  })

  it('uses the free endpoint with no api key by default', async () => {
    fetchMock.mockResolvedValue(makeResponse())
    await resolveForecasts([{ lat: 1, lng: 2 }])

    const calledUrl = fetchMock.mock.calls[0]![0] as string
    expect(calledUrl).toContain('https://api.open-meteo.com/v1/forecast')
    expect(calledUrl).not.toContain('apikey=')
  })

  it('switches to the commercial customer endpoint and appends the api key when configured', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ openMeteoContact: 'x', openMeteoApiKey: 'secret-key', openMeteoBaseUrl: '' }))
    fetchMock.mockResolvedValue(makeResponse())
    await resolveForecasts([{ lat: 1, lng: 2 }])

    const calledUrl = fetchMock.mock.calls[0]![0] as string
    expect(calledUrl).toContain('https://customer-api.open-meteo.com/v1/forecast')
    expect(calledUrl).toContain('apikey=secret-key')
  })

  it('uses a self-hosted base URL when configured', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ openMeteoContact: 'x', openMeteoApiKey: '', openMeteoBaseUrl: 'https://weather.internal/v1/forecast' }))
    fetchMock.mockResolvedValue(makeResponse())
    await resolveForecasts([{ lat: 1, lng: 2 }])

    const calledUrl = fetchMock.mock.calls[0]![0] as string
    expect(calledUrl).toContain('https://weather.internal/v1/forecast')
  })
})
