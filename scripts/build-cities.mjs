#!/usr/bin/env node
// Regenerates server/data/cities.json from the GeoNames "cities5000" dump
// (cities with population > 5,000), filtered to Europe.
//
//   node scripts/build-cities.mjs        # download + build
//
// GeoNames data is licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
// and is attributed in the app UI. Requires the `unzip` binary on PATH.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'server', 'data', 'cities.json')
const SOURCE_URL = 'https://download.geonames.org/export/dump/cities5000.zip'

// European country codes (ISO2). RU/TR/UA are kept; the bounding box clips them to
// their European parts.
const EUROPE_CC = new Set([
  'AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FO',
  'FI', 'FR', 'DE', 'GI', 'GR', 'GG', 'HU', 'IS', 'IE', 'IM', 'IT', 'JE', 'XK',
  'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT',
  'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'TR', 'UA', 'GB', 'VA',
])

// Must match EUROPE_BOUNDS used by the map / grid selection.
const BBOX = { minLng: -25, minLat: 34, maxLng: 45, maxLat: 72 }

function loadRawLines() {
  const dir = mkdtempSync(join(tmpdir(), 'geonames-'))
  const zip = join(dir, 'cities5000.zip')
  const txt = join(dir, 'cities5000.txt')

  console.log(`Downloading ${SOURCE_URL} …`)
  execSync(`curl -sSL -o "${zip}" "${SOURCE_URL}"`, { stdio: 'inherit' })
  execSync(`unzip -o "${zip}" -d "${dir}"`, { stdio: 'ignore' })
  if (!existsSync(txt)) throw new Error('cities5000.txt not found after unzip')
  return readFileSync(txt, 'utf8').split('\n')
}

const cities = []
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

  if (!EUROPE_CC.has(cc)) continue
  if (lng < BBOX.minLng || lng > BBOX.maxLng || lat < BBOX.minLat || lat > BBOX.maxLat) continue

  cities.push({
    name,
    country: cc,
    lat: Math.round(lat * 1e4) / 1e4,
    lng: Math.round(lng * 1e4) / 1e4,
    pop,
    capital: featureCode === 'PPLC', // PPLC = national capital
  })
}

// Sort by importance so the server can slice the top N cheaply: capitals first, then by population.
cities.sort((a, b) => (Number(b.capital) - Number(a.capital)) || (b.pop - a.pop))

writeFileSync(OUT, JSON.stringify(cities))
console.log(`Wrote ${cities.length} cities (${cities.filter((c) => c.capital).length} capitals) → ${OUT}`)
