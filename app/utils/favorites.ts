/**
 * Stable identifier for a city, derived from its coordinates (which are fixed in the
 * bundled dataset). Used as the localStorage key for favorites.
 */
export function cityId(lng: number, lat: number): string {
  return `${lng},${lat}`
}
