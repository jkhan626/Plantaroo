/* Plantaroo brand-asset generator — monstera rebrand (Liftaroo family style).
 *
 * icon.png (1024, dark bg + leaf + "plantaroo" wordmark) is rendered from
 * ../icon-source/icon.html with headless Edge (the wordmark needs the
 * Quicksand webfont, which librsvg/sharp can't load). All mark-only assets
 * (splash, notification, adaptive, logo marks) are rendered here from the
 * same monstera glyph via sharp (borrowed from ../../../../Wedding/node_modules).
 *
 * Run:  node app/assets/_gen/make-icons.cjs
 */
const path = require('path');
const { execFileSync } = require('child_process');

const sharp = require('E:/Downloads 2026/Claude/Wedding/node_modules/sharp');

const OUT = path.resolve(__dirname, '..');           // app/assets
const SRC = path.join(OUT, 'icon-source');
const SIZE = 1024;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

// ---- The monstera glyph (matches icon-source/icon.html) ------------------
// 660x660 viewBox: heart-shaped leaf, edge slits cut via mask, stem below.
function monstera(fill) {
  return `
  <defs>
    <mask id="slits">
      <path fill="#fff" d="M330,118
        C262,62 148,72 110,162
        C74,248 86,366 168,464
        C228,536 296,584 330,594
        C364,584 432,536 492,464
        C574,366 586,248 550,162
        C512,72 398,62 330,118 Z"/>
      <rect x="322" y="120" width="16" height="470" rx="8" fill="#000"/>
      <g fill="#000">
        <rect x="60"  y="170" width="230" height="30" rx="15" transform="rotate(16 60 170)"/>
        <rect x="42"  y="262" width="250" height="30" rx="15" transform="rotate(24 42 262)"/>
        <rect x="52"  y="358" width="240" height="30" rx="15" transform="rotate(32 52 358)"/>
        <rect x="92"  y="450" width="200" height="30" rx="15" transform="rotate(42 92 450)"/>
      </g>
      <g fill="#000" transform="translate(660,0) scale(-1,1)">
        <rect x="60"  y="170" width="230" height="30" rx="15" transform="rotate(16 60 170)"/>
        <rect x="42"  y="262" width="250" height="30" rx="15" transform="rotate(24 42 262)"/>
        <rect x="52"  y="358" width="240" height="30" rx="15" transform="rotate(32 52 358)"/>
        <rect x="92"  y="450" width="200" height="30" rx="15" transform="rotate(42 92 450)"/>
      </g>
    </mask>
  </defs>
  <path d="M330,560 C330,620 330,648 330,660" stroke="${fill}" stroke-width="26" stroke-linecap="round" fill="none"/>
  <rect x="0" y="0" width="660" height="660" fill="${fill}" mask="url(#slits)"/>`;
}

// Glyph centred on a 1024 canvas at scale s (1.0 = 660px wide).
function glyphSVG(fill, s) {
  const w = 660 * s, off = (SIZE - w) / 2;
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(${off} ${off}) scale(${s})">${monstera(fill)}</g>
  </svg>`;
}

// ---- Render --------------------------------------------------------------
async function png(svg, file, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT, file));
  console.log('  ✓', file, size + 'px');
}

(async () => {
  console.log('Rendering Plantaroo brand assets →', OUT);

  // 1) App icon via headless Edge (webfont wordmark). iOS icons MUST be opaque.
  const url = 'file:///' + path.join(SRC, 'icon.html').replace(/\\/g, '/').replace(/ /g, '%20');
  execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1024,1024',
    '--virtual-time-budget=8000',
    `--screenshot=${path.join(SRC, 'render.png')}`, url,
  ], { stdio: 'ignore' });
  const flat = sharp(path.join(SRC, 'render.png')).flatten({ background: '#0C1F17' });
  await flat.clone().png().toFile(path.join(OUT, 'icon.png'));
  console.log('  ✓ icon.png 1024px (Edge render, flattened)');
  await flat.clone().resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
  console.log('  ✓ icon-512.png 512px');

  // 2) Mark-only assets (transparent backgrounds).
  await png(glyphSVG('#ffffff', 0.62), 'adaptive-icon.png', 1024); // Android foreground, safe zone
  await png(glyphSVG('#3FC878', 0.82), 'splash-icon.png', 1024);   // dark splash (#0A0A0A behind)
  await png(glyphSVG('#ffffff', 1.0), 'notification-icon.png', 256); // status-bar silhouette
  await png(glyphSVG('#3FC878', 1.0), 'mark-green.png', 512);      // green glyph (dark bg)
  await png(glyphSVG('#ffffff', 1.0), 'mark-white.png', 512);      // white glyph
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
