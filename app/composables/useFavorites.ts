const STORAGE_KEY = 'tsw:favorites'

// Module-level singleton so every caller shares one reactive set.
const favorites = ref<Set<string>>(new Set())
let hydrated = false

/** Reactive favorite-city ids, backed by localStorage. See {@link cityId} for the id format. */
export function useFavorites() {
  if (import.meta.client && !hydrated) {
    hydrated = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) favorites.value = new Set(JSON.parse(raw) as string[])
    } catch {
      // Ignore corrupt/unavailable storage — start empty.
    }
  }

  function isFavorite(id: string): boolean {
    return favorites.value.has(id)
  }

  function toggle(id: string): void {
    // Reassign a new Set so the ref reacts.
    const next = new Set(favorites.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    favorites.value = next

    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // Storage full or unavailable — favorite still works for this session.
      }
    }
  }

  return { favorites, isFavorite, toggle }
}
