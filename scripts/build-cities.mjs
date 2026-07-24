#!/usr/bin/env node
// Regenerates the worldwide city dataset from the GeoNames "cities5000" dump
// (every place with population > 5,000), split for on-demand loading:
//
//   server/data/cities-prominent.json   — capitals + big cities (pop >= PROMINENT_FLOOR).
//                                          Small, imported at boot, serves wide/mid zoom.
//   server/data/cities/{cx}_{cy}.json    — the long tail (smaller cities), bucketed into a
//                                          spatial grid. Loaded on demand, only at high zoom
//                                          where the viewport spans just a few cells.
//   server/data/cities-manifest.json     — grid config + the set of non-empty tail cells.
//
//   node scripts/build-cities.mjs        # download + build
//
// GeoNames data is licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
// and is attributed in the app UI. Requires the `unzip` binary on PATH.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'server', 'data')
const CHUNK_DIR = join(DATA_DIR, 'cities')
const SOURCE_URL = 'https://download.geonames.org/export/dump/cities5000.zip'

// A city is "prominent" (bundled, always available) if it's a national capital or clears this
// population floor. Everything else is tail, loaded on demand. Keep this aligned with the map's
// zoom→population tiers (minPopForZoom): the tail is only queried once the zoom threshold drops
// below PROMINENT_FLOOR, so the prominent set must cover every wider tier on its own.
const PROMINENT_FLOOR = 100_000

// Tail grid cell size in degrees. Smaller = more, smaller files (less over-fetch at high zoom);
// larger = fewer files (more over-fetch). Emitted in the manifest so the server uses the same value.
const CELL_DEG = 10

/** Non-negative grid indices so chunk filenames have no minus signs. */
function cellKey(lng, lat) {
  const cx = Math.floor((lng + 180) / CELL_DEG)
  const cy = Math.floor((lat + 90) / CELL_DEG)
  return `${cx}_${cy}`
}

function loadRawLines() {
  const dir = mkdtempSync(join(tmpdir(), 'geonames-'))
  const zip = join(dir, 'cities5000.zip')
  const txt = join(dir, 'cities5000.txt')

  console.log(`Downloading ${SOURCE_URL} …`)
  execSync(`curl -sSL -o "${zip}" "${SOURCE_URL}"`, { stdio: 'inherit' })
  execSync(`unzip -o "${zip}" -d "${dir}"`, { stdio: 'ignore' })
  if (!existsSync(txt)) throw new Error('cities5000.txt not found after unzip')
  const lines = readFileSync(txt, 'utf8').split('\n')
  rmSync(dir, { recursive: true, force: true })
  return lines
}

const prominent = []
/** @type {Map<string, object[]>} tail cities grouped by grid cell */
const tail = new Map()

for (const line of loadRawLines()) {
  if (!line) continue
  // GeoNames tab-separated columns: 1=name, 4=lat, 5=lng, 7=featureCode, 8=countryCode, 14=population.
  const c = line.split('\t')
  const name = c[1]
  const lat = Number(c[4])
  const lng = Number(c[5])
  const featureCode = c[7]
  const cc = c[8]
  const pop = Number(c[14])

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

  const city = {
    name,
    country: cc,
    lat: Math.round(lat * 1e4) / 1e4,
    lng: Math.round(lng * 1e4) / 1e4,
    pop,
    capital: featureCode === 'PPLC', // PPLC = national capital
  }

  if (city.capital || pop >= PROMINENT_FLOOR) {
    prominent.push(city)
  } else {
    const key = cellKey(city.lng, city.lat)
    let bucket = tail.get(key)
    if (!bucket) tail.set(key, (bucket = []))
    bucket.push(city)
  }
}

// Prominent: capitals first, then population desc — so the server can slice the top N cheaply.
prominent.sort((a, b) => Number(b.capital) - Number(a.capital) || b.pop - a.pop)
// Tail cells: population desc within each cell (no capitals here).
for (const bucket of tail.values()) bucket.sort((a, b) => b.pop - a.pop)

// Clear any stale chunk files from a previous build, then write the fresh set.
if (existsSync(CHUNK_DIR)) {
  for (const f of readdirSync(CHUNK_DIR)) if (f.endsWith('.json')) unlinkSync(join(CHUNK_DIR, f))
} else {
  mkdirSync(CHUNK_DIR, { recursive: true })
}

writeFileSync(join(DATA_DIR, 'cities-prominent.json'), JSON.stringify(prominent))

const cells = [...tail.keys()].sort()
let tailCount = 0
let maxCellCount = 0
for (const key of cells) {
  const bucket = tail.get(key)
  tailCount += bucket.length
  maxCellCount = Math.max(maxCellCount, bucket.length)
  writeFileSync(join(CHUNK_DIR, `${key}.json`), JSON.stringify(bucket))
}

writeFileSync(
  join(DATA_DIR, 'cities-manifest.json'),
  JSON.stringify({ cellDeg: CELL_DEG, prominentFloor: PROMINENT_FLOOR, cells }),
)

const capitals = prominent.filter((c) => c.capital).length
console.log(
  `Wrote ${prominent.length} prominent cities (${capitals} capitals) → cities-prominent.json\n` +
    `Wrote ${tailCount} tail cities across ${cells.length} cells (largest ${maxCellCount}) → cities/\n` +
    `Total: ${prominent.length + tailCount} cities worldwide.`,
)
