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
      <g transform="rotate(-4 330 360)">
        <path fill="#fff" d="M330,542
          C262,598 148,588 110,498
          C74,412 86,294 168,196
          C228,124 296,76 330,66
          C364,76 432,124 492,196
          C574,294 586,412 550,498
          C512,588 398,598 330,542 Z"/>
        <path d="M330,116 C322,250 326,400 330,528" stroke="#000" stroke-width="13" fill="none" stroke-linecap="round"/>
        <g stroke="#000" fill="none" stroke-linecap="round">
          <path d="M20,180 Q150,215 252,225" stroke-width="46"/>
          <path d="M4,300  Q140,340 256,344" stroke-width="50"/>
          <path d="M22,425 Q150,460 258,452" stroke-width="48"/>
        </g>
        <g stroke="#000" fill="none" stroke-linecap="round">
          <path d="M640,160 Q520,195 408,210" stroke-width="44"/>
          <path d="M656,280 Q525,325 404,330" stroke-width="50"/>
          <path d="M640,405 Q510,445 402,436" stroke-width="48"/>
        </g>
        <g fill="#000">
          <ellipse cx="372" cy="252" rx="11" ry="16" transform="rotate(-10 372 252)"/>
          <ellipse cx="290" cy="392" rx="12" ry="18" transform="rotate(12 290 392)"/>
        </g>
      </g>
    </mask>
  </defs>
  <path d="M322,660 C314,622 340,584 330,540" stroke="${fill}" stroke-width="26" stroke-linecap="round" fill="none" transform="rotate(-4 330 360)"/>
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
