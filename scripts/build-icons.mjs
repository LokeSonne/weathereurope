// Regenerates the PNG / ICO icon set from the flat Miami-Deco "TW" mark (see DESIGN.md and
// public/favicon.svg, which is the hand-authored source of truth for the vector icon).
//
//   pnpm build:icons
//
// The "TW" is Poiret One outlined to paths (via opentype.js) so nothing here needs a font.
// og-image.png is a separate social card and is intentionally left alone.
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const AQUA = '#6fd0ce';
const GOLD = '#f3ad3f';
const FLAM = '#e86a93';
const NAVY = '#1c3b52';

// "TW" in Poiret One, outlined on the 64 grid (baseline y42; size 25 full / 27 single-rule).
const TW_FULL   = 'M14.50 23.25L23.93 23.25L23.93 23.97L19.65 23.97L19.65 42L18.82 42L18.82 23.97L14.50 23.97L14.50 23.25ZM37.13 33.17L33.15 42.33L24.93 23.25L25.85 23.25L33.27 40.42L36.75 32.30L32.88 23.25L33.77 23.25L37.25 31.48L40.83 23.25L41.53 23.25L37.63 32.27L41.17 40.50L48.75 23.25L49.42 23.25L41.10 42.33Z';
const TW_SINGLE = 'M13.10 21.75L23.28 21.75L23.28 22.53L18.66 22.53L18.66 42L17.77 42L17.77 22.53L13.10 22.53L13.10 21.75ZM37.54 32.47L33.24 42.35L24.36 21.75L25.36 21.75L33.38 40.30L37.13 31.52L32.95 21.75L33.92 21.75L37.67 30.63L41.53 21.75L42.29 21.75L38.08 31.50L41.91 40.38L50.09 21.75L50.82 21.75L41.83 42.35Z';

const wrap = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${inner}</svg>`;
const sunCorner = `<circle cx="13" cy="12" r="14" fill="${GOLD}"/>`;
const roundedSun = `<defs><clipPath id="t"><rect x="0" y="0" width="64" height="64" rx="14"/></clipPath></defs><g clip-path="url(#t)">${sunCorner}</g>`;
const rulesFull = `<g stroke="${FLAM}" stroke-width="2.6" stroke-linecap="round"><line x1="17" y1="14" x2="47" y2="14"/><line x1="17" y1="18" x2="47" y2="18"/><line x1="17" y1="50" x2="47" y2="50"/><line x1="17" y1="54" x2="47" y2="54"/></g>`;
const twFull = `<path fill="${NAVY}" d="${TW_FULL}"/>`;

// full-bleed square lockup with the corner sun (iOS / launchers apply their own rounding)
const squareFull = wrap(`<rect width="64" height="64" fill="${AQUA}"/>` + sunCorner + rulesFull + twFull);
// maskable: centred inside the ~80% safe circle, no corner sun (the OS clips to a circle)
const maskable = wrap(`<rect width="64" height="64" fill="${AQUA}"/><g transform="translate(32,32) scale(0.8) translate(-32,-32)">${rulesFull}${twFull}</g>`);
// .ico fallbacks: single-rule "TW" for 32, two flamingo rules only for 16
const singleRuleTW = wrap(`<rect width="64" height="64" rx="14" fill="${AQUA}"/>${roundedSun}<g stroke="${FLAM}" stroke-width="3.4" stroke-linecap="round"><line x1="18" y1="16" x2="46" y2="16"/><line x1="18" y1="50" x2="46" y2="50"/></g><path fill="${NAVY}" d="${TW_SINGLE}"/>`);
const rulesOnly = wrap(`<rect width="64" height="64" rx="14" fill="${AQUA}"/>${roundedSun}<g stroke="${FLAM}" stroke-width="5" stroke-linecap="round"><line x1="13" y1="25" x2="51" y2="25"/><line x1="13" y1="39" x2="51" y2="39"/></g>`);

const png = (svg, size, flatten) => {
  let s = sharp(Buffer.from(svg)).resize(size, size);
  if (flatten) s = s.flatten({ background: AQUA });
  return s.png().toBuffer();
};

const write = async (name, buf) => { await writeFile(join(PUBLIC, name), buf); console.log('  ✓', name); };

console.log('Building icons →', PUBLIC);
// PWA "any" and Apple touch: full-bleed square, no transparency (matches prior format)
await write('pwa-192.png', await png(squareFull, 192, true));
await write('pwa-512.png', await png(squareFull, 512, true));
await write('apple-touch-icon.png', await png(squareFull, 180, true));
// Maskable: full-bleed square, content in the safe zone
await write('pwa-maskable-192.png', await png(maskable, 192, true));
await write('pwa-maskable-512.png', await png(maskable, 512, true));
// favicon.ico: 16px = rules only, 32px = single-rule "TW" (rounded, keep transparency)
const ico = await pngToIco([await png(rulesOnly, 16, false), await png(singleRuleTW, 32, false)]);
await write('favicon.ico', ico);
console.log('Done. (favicon.svg is hand-authored; og-image.png left untouched.)');
