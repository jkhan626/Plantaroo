/* Plantaroo brand-asset generator.
 * Renders the app icon, adaptive icon, splash, notification icon and logo marks
 * from inline SVG using sharp (borrowed from ../../../../Wedding/node_modules).
 * Run:  node app/assets/_gen/make-icons.js
 */
const path = require('path');
const fs = require('fs');

// sharp lives in the Wedding project; load it by absolute path.
const sharp = require('E:/Downloads 2026/Claude/Wedding/node_modules/sharp');

const OUT = path.resolve(__dirname, '..');           // app/assets
const SIZE = 1024;

// ---- The sprout mark ---------------------------------------------------
// One leaf, bottom tip at (0,0), pointing straight up ~270 tall, ~150 wide.
const LEAF = 'M0,0 C 78,-58 78,-208 0,-274 C -78,-208 -78,-58 0,0 Z';
const VEIN = 'M0,-26 C 24,-98 24,-178 6,-250';

// Sprout glyph, roughly centred on (512,512) of the 1024 canvas.
// Two leaves fanning from a join point, plus a curved stem below.
function sprout(fill, veinColor) {
  const cx = 512, joinY = 552, stemBaseY = 700;
  const stemLen = stemBaseY - joinY; // 148
  const vein = veinColor
    ? `<path d="${VEIN}" stroke="${veinColor}" stroke-width="11" fill="none" stroke-linecap="round"/>`
    : '';
  return `
  <g transform="translate(${cx} ${joinY})">
    <path d="M0,${stemLen} C -9,${(stemLen * 0.55).toFixed(0)} -7,42 0,0"
          stroke="${fill}" stroke-width="36" stroke-linecap="round" fill="none"/>
    <g transform="rotate(-34)"><path d="${LEAF}" fill="${fill}"/>${vein}</g>
    <g transform="rotate(34)"><path d="${LEAF}" fill="${fill}"/>${vein}</g>
  </g>`;
}

// Scale the glyph about the canvas centre (Android adaptive safe-zone, splash sizing).
function scaled(inner, s) {
  return `<g transform="translate(512 512) scale(${s}) translate(-512 -512)">${inner}</g>`;
}

// ---- Full SVG documents ------------------------------------------------
function iconSVG() {
  // Full-bleed green gradient + white sprout. No transparency (Apple masks corners).
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.15" y2="1">
        <stop offset="0" stop-color="#4BE572"/>
        <stop offset="0.55" stop-color="#2BC95A"/>
        <stop offset="1" stop-color="#159B46"/>
      </linearGradient>
      <radialGradient id="hl" cx="0.5" cy="0.30" r="0.95">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/>
        <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#hl)"/>
    ${scaled(sprout('#ffffff', 'rgba(13,90,40,0.10)'), 1.0)}
  </svg>`;
}

function markSVG(fill, vein) {
  // Transparent glyph only (logo mark for in-app / marketing).
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
    ${scaled(sprout(fill, vein), 1.0)}
  </svg>`;
}

function adaptiveForegroundSVG() {
  // Android adaptive icon foreground: white sprout, transparent, pulled into the
  // centre ~66% safe zone (background colour set in app.json).
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
    ${scaled(sprout('#ffffff', null), 0.66)}
  </svg>`;
}

function splashSVG() {
  // Transparent, brand-green sprout for the dark splash screen.
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
    ${scaled(sprout('#30D158', 'rgba(0,0,0,0.10)'), 0.82)}
  </svg>`;
}

// ---- Render ------------------------------------------------------------
async function png(svg, file, size, { flatten } = {}) {
  let img = sharp(Buffer.from(svg)).resize(size, size);
  if (flatten) img = img.flatten({ background: flatten });
  await img.png().toFile(path.join(OUT, file));
  console.log('  ✓', file, size + 'px');
}

(async () => {
  console.log('Rendering Plantaroo brand assets →', OUT);
  // iOS app icons MUST be opaque (no alpha) or they render as a blank square.
  await png(iconSVG(), 'icon.png', 1024, { flatten: '#159B46' });
  await png(adaptiveForegroundSVG(), 'adaptive-icon.png', 1024);   // Android foreground
  await png(splashSVG(), 'splash-icon.png', 1024);                 // splash mark
  await png(markSVG('#ffffff', null), 'notification-icon.png', 256); // Android status-bar silhouette
  await png(markSVG('#30D158', 'rgba(0,0,0,0.10)'), 'mark-green.png', 512);   // green glyph (dark bg)
  await png(markSVG('#ffffff', null), 'mark-white.png', 512);                  // white glyph
  // Favicon-ish / store-preview opaque versions
  await png(iconSVG(), 'icon-512.png', 512, { flatten: '#159B46' });
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
