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
        <!-- per Jamal's reference: solid heart silhouette, CLOSED interior slits
             (never piercing the edge) + scattered oval holes — flipped to point up -->
        <!-- leaf body: tip up, basal lobes + notch at the bottom -->
        <path fill="#fff" d="M330,542
          C262,598 148,588 110,498
          C74,412 86,294 168,196
          C228,124 296,76 330,66
          C364,76 432,124 492,196
          C574,294 586,412 550,498
          C512,588 398,598 330,542 Z"/>
        <!-- midrib: thin line rising from the bottom notch, fading out mid-leaf -->
        <path d="M330,530 C327,460 326,350 328,250" stroke="#000" stroke-width="10" fill="none" stroke-linecap="round"/>
        <!-- left slits: gentle ~30° downward sweep, rounded ends, fully enclosed -->
        <g stroke="#000" fill="none" stroke-linecap="round">
          <path d="M255,408 Q185,455 125,492" stroke-width="32"/>
          <path d="M250,325 Q175,372 100,410" stroke-width="30"/>
          <path d="M248,242 Q180,285 115,320" stroke-width="28"/>
          <path d="M255,165 Q220,190 185,212" stroke-width="24"/>
        </g>
        <!-- right slits (mirrored) -->
        <g stroke="#000" fill="none" stroke-linecap="round">
          <path d="M405,408 Q475,455 535,492" stroke-width="32"/>
          <path d="M410,325 Q485,372 560,410" stroke-width="30"/>
          <path d="M412,242 Q480,285 545,320" stroke-width="28"/>
          <path d="M405,165 Q440,190 475,212" stroke-width="24"/>
        </g>
        <!-- fenestration holes: scattered in the open band between midrib and slit ends -->
        <g fill="#000">
          <ellipse cx="295" cy="205" rx="8"  ry="13" transform="rotate(14 295 205)"/>
          <ellipse cx="290" cy="290" rx="11" ry="17" transform="rotate(18 290 290)"/>
          <ellipse cx="296" cy="372" rx="9"  ry="15" transform="rotate(16 296 372)"/>
          <ellipse cx="292" cy="448" rx="8"  ry="12" transform="rotate(20 292 448)"/>
          <ellipse cx="365" cy="205" rx="8"  ry="13" transform="rotate(-14 365 205)"/>
          <ellipse cx="370" cy="290" rx="11" ry="17" transform="rotate(-18 370 290)"/>
          <ellipse cx="364" cy="372" rx="9"  ry="15" transform="rotate(-16 364 372)"/>
          <ellipse cx="368" cy="448" rx="8"  ry="12" transform="rotate(-20 368 448)"/>
        </g>
      </mask>
  </defs>
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
