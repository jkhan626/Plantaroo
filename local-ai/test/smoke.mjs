// Smoke test for the Plantaroo local AI bridge.
//
// Works in three modes, auto-detected:
//
//   1. TOKEN MODE     — `ID_TOKEN=<firebase id token> node test/smoke.mjs`
//                       Runs everything, including against the production-mode
//                       server (DEV_ALLOW_NO_AUTH=0) and over Funnel:
//                       `BASE_URL=https://jamal.taila00dc9.ts.net ID_TOKEN=... npm run smoke`
//   2. DEV MODE       — server started with DEV_ALLOW_NO_AUTH=1 on loopback.
//                       Detected by probing GET /api/status with no credentials.
//   3. NO-TOKEN MODE  — neither of the above. The model endpoints are skipped
//                       (with a clear message), but everything reachable without
//                       credentials is still checked: /health's shape, the 401s,
//                       auth-before-body-parse, 404s, and the per-IP limiter.
//
// Fixture photos are fetched from Wikimedia Commons only — no dependency on the
// untracked repo-root plant-images.json — and only when the model endpoints will
// actually run.
//
// The per-IP limiter test runs LAST and deliberately empties that bucket, so a
// re-run inside the same minute may start rate-limited. Wait ~60 s between runs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3100}`;
const ID_TOKEN = process.env.ID_TOKEN || '';

// Wikimedia Commons Special:FilePath URLs are stable and the files are freely
// licensed, which is why they are the only source here.
const WANTED = [
  {
    file: 'monstera.jpg',
    // Foliage, not the inflorescence — the fenestrated leaves are what a user
    // would actually photograph. (Monstera_deliciosa_002.jpg is a fruit close-up
    // and gets read as a banana plant, fairly.)
    commons: 'Costela-de-adão, Monstera deliciosa, em Bagé-RS, Brasil.jpg',
    expect: /monstera/i,
  },
  {
    file: 'snake-plant.jpg',
    commons: 'Dracaena_Trifasciata_Plant.jpg',
    expect: /snake plant|dracaena|sansevieria/i,
  },
  {
    file: 'orchid.jpg',
    commons: 'Phalaenopsis_Cultivar_White_01.jpg',
    expect: /orchid|phalaenopsis/i,
  },
];

const commonsUrl = (name) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=900`;

let failures = 0;
let skipped = 0;

function ok(label, passed, extra = '') {
  const mark = passed ? 'PASS' : 'FAIL';
  if (!passed) failures++;
  console.log(`[${mark}] ${label}${extra ? ' — ' + extra : ''}`);
}

function skip(label, why) {
  skipped++;
  console.log(`[SKIP] ${label}${why ? ' — ' + why : ''}`);
}

async function ensureFixtures() {
  await fs.mkdir(FIXTURES, { recursive: true });
  for (const w of WANTED) {
    const dest = path.join(FIXTURES, w.file);
    try {
      const st = await fs.stat(dest);
      if (st.size > 5000) continue;
    } catch {
      /* not downloaded yet */
    }
    const url = commonsUrl(w.commons);
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`${url} — HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Must actually be a JPEG, not an HTML error page.
    if (!(buf.length > 5000 && buf[0] === 0xff && buf[1] === 0xd8)) {
      throw new Error(`${url} — not a JPEG (${buf.length} bytes)`);
    }
    await fs.writeFile(dest, buf);
    console.log(`  downloaded ${w.file} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
}

/**
 * @param {object} [o]
 * @param {boolean} [o.auth] send the bearer token when one is configured
 * @param {string}  [o.rawBody] send this exact string as the body (for size tests)
 */
async function call(method, endpoint, body, { auth = true, headers = {}, rawBody } = {}) {
  const h = { ...headers };
  if (body !== undefined || rawBody !== undefined) h['content-type'] = 'application/json';
  if (auth && ID_TOKEN && !('authorization' in h)) h.authorization = `Bearer ${ID_TOKEN}`;
  const t0 = Date.now();
  const res = await fetch(BASE + endpoint, {
    method,
    headers: h,
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _nonJson: text.slice(0, 200) };
  }
  return { status: res.status, json, ms };
}

/** Decide which mode we are in by asking the server. */
async function detectMode() {
  if (ID_TOKEN) {
    const r = await call('GET', '/api/status');
    if (r.status === 200) return { mode: 'token', status: r.json };
    return { mode: 'token-bad', detail: `GET /api/status returned ${r.status}` };
  }
  const r = await call('GET', '/api/status', undefined, { auth: false });
  if (r.status === 200) return { mode: 'dev', status: r.json };
  return { mode: 'none' };
}

async function main() {
  console.log(`Target: ${BASE}\n`);

  const detected = await detectMode();
  const canModel = detected.mode === 'token' || detected.mode === 'dev';
  if (detected.mode === 'token') {
    console.log('Mode: TOKEN — ID_TOKEN accepted, running the full suite.\n');
  } else if (detected.mode === 'dev') {
    console.log('Mode: DEV — server is running with DEV_ALLOW_NO_AUTH=1, running the full suite.\n');
  } else if (detected.mode === 'token-bad') {
    console.log(`Mode: NO-TOKEN — ID_TOKEN was set but rejected (${detected.detail}).`);
    console.log('  The model endpoints will be SKIPPED. Get a fresh token from the app\n');
    console.log('  (Firebase tokens expire after 1 hour) and re-run.\n');
  } else {
    console.log('Mode: NO-TOKEN — no ID_TOKEN in the environment and the server is in');
    console.log('  production mode (DEV_ALLOW_NO_AUTH=0), so /api/identify and /api/profile');
    console.log('  cannot be exercised. To run them:');
    console.log('    ID_TOKEN=<firebase id token> node test/smoke.mjs');
    console.log('  Everything reachable without credentials is still checked below.\n');
  }

  // ---------------------------------------------------------------- /health
  console.log('== GET /health ==');
  const health = await call('GET', '/health', undefined, { auth: false });
  console.log(`  ${health.ms} ms  ${JSON.stringify(health.json)}`);
  ok('health returns ok:true', health.status === 200 && health.json.ok === true);
  ok(
    'ollama reachable with model present',
    health.json.ollama === true,
    health.json.ollama ? '' : 'model not pulled / ollama down — identify+profile would fail'
  );
  // Finding 3: the public body is exactly {ok, ollama} — no model name, no uptime.
  const healthKeys = Object.keys(health.json).sort().join(',');
  ok('health body discloses nothing else', healthKeys === 'ok,ollama', `keys=${healthKeys}`);

  // The Ollama probe is cached for 15 s, so a second call must not re-proxy.
  const health2 = await call('GET', '/health', undefined, { auth: false });
  ok('second /health is served from cache (fast)', health2.status === 200 && health2.ms < 200, `${health2.ms} ms`);
  console.log();

  // ------------------------------------------------------------------ auth
  console.log('== auth ==');
  const noAuthIdentify = await call('POST', '/api/identify', { image: 'x' }, { auth: false });
  if (canModel && detected.mode === 'dev') {
    skip('POST /api/identify without token → 401', 'server is in DEV_ALLOW_NO_AUTH=1 mode');
  } else {
    console.log(`  no token:      HTTP ${noAuthIdentify.status}  ${JSON.stringify(noAuthIdentify.json)}`);
    ok(
      'POST /api/identify without token → 401 unauthorized',
      noAuthIdentify.status === 401 && noAuthIdentify.json.error === 'unauthorized'
    );
  }

  const garbage = await call(
    'POST',
    '/api/profile',
    { name: 'Pothos', light_type: 'natural', soil_type: 'chunky_aroid' },
    { auth: false, headers: { authorization: 'Bearer not.a.real.token' } }
  );
  console.log(`  bad token:     HTTP ${garbage.status}  ${JSON.stringify(garbage.json)}`);
  ok(
    'garbage bearer token → 401 unauthorized',
    garbage.status === 401 && garbage.json.error === 'unauthorized'
  );

  const statusNoAuth = await call('GET', '/api/status', undefined, { auth: false });
  if (detected.mode === 'dev') {
    skip('GET /api/status without token → 401', 'server is in DEV_ALLOW_NO_AUTH=1 mode');
  } else {
    console.log(`  status no tok: HTTP ${statusNoAuth.status}  ${JSON.stringify(statusNoAuth.json)}`);
    ok('GET /api/status without token → 401', statusNoAuth.status === 401);
  }
  console.log();

  // ------------------------------------------- auth runs before body parsing
  // Finding 2: an unauthenticated oversized POST must cost a 401 and nothing
  // else — the body is never handed to express.json(), so the answer comes back
  // fast and no 4 MB string is ever built. In production mode the status proves
  // it (401, not the 413 you would get if the parser ran first).
  console.log('== oversized body, no token (auth must run before the body parser) ==');
  const oversize = `{"image":"${'A'.repeat(5 * 1024 * 1024)}"}`;
  const oversizeNoAuth = await call('POST', '/api/identify', undefined, {
    auth: false,
    rawBody: oversize,
  });
  console.log(
    `  ${(oversize.length / 1024 / 1024).toFixed(1)} MB body  ${oversizeNoAuth.ms} ms  ` +
      `HTTP ${oversizeNoAuth.status}  ${JSON.stringify(oversizeNoAuth.json)}`
  );
  if (detected.mode === 'dev') {
    ok(
      'oversized body in dev mode → 413 image_too_large',
      oversizeNoAuth.status === 413 && oversizeNoAuth.json.error === 'image_too_large'
    );
  } else {
    ok(
      'oversized body without token → 401, NOT 413 (body never parsed)',
      oversizeNoAuth.status === 401 && oversizeNoAuth.json.error === 'unauthorized',
      `got ${oversizeNoAuth.status}`
    );
  }

  if (ID_TOKEN && detected.mode === 'token') {
    const oversizeAuthed = await call('POST', '/api/identify', undefined, { rawBody: oversize });
    console.log(`  authed:        HTTP ${oversizeAuthed.status}  ${JSON.stringify(oversizeAuthed.json)}`);
    ok(
      'oversized body with token → 413 image_too_large',
      oversizeAuthed.status === 413 && oversizeAuthed.json.error === 'image_too_large'
    );
  } else {
    skip('oversized body with token → 413', 'needs credentials');
  }
  console.log();

  // ------------------------------------------------------------------- 404
  console.log('== unknown route ==');
  const missing = await call('GET', '/nope', undefined, { auth: false });
  console.log(`  HTTP ${missing.status}  ${JSON.stringify(missing.json)}`);
  ok('unknown route → 404 not_found', missing.status === 404 && missing.json.error === 'not_found');
  console.log();

  // -------------------------------------------------------------- /identify
  if (!canModel) {
    skip('POST /api/identify (3 fixture photos)', 'no credentials');
    skip('POST /api/identify oversized image → 413', 'no credentials');
    skip('POST /api/identify oversized dimensions → 413', 'no credentials');
    skip('POST /api/profile (4 plants)', 'no credentials');
    skip('POST /api/profile bad enum → 400', 'no credentials');
  } else {
    console.log('== fixtures ==');
    await ensureFixtures();
    console.log('  fixtures ready\n');

    console.log('== POST /api/identify ==');
    for (const w of WANTED) {
      const buf = await fs.readFile(path.join(FIXTURES, w.file));
      const r = await call('POST', '/api/identify', {
        image: `data:image/jpeg;base64,${buf.toString('base64')}`,
      });
      console.log(`  ${w.file}  (${(buf.length / 1024).toFixed(0)} KB)  ${r.ms} ms  HTTP ${r.status}`);
      console.log(`  ${JSON.stringify(r.json)}`);
      const top = r.json?.candidates?.[0];
      ok(`identify ${w.file} → 200 with >=1 candidate`, r.status === 200 && !!top);
      if (top) {
        const matched = w.expect.test(`${top.common_name} ${top.scientific_name}`);
        ok(`identify ${w.file} top candidate plausible`, matched, `top="${top.common_name}"`);
      }
      console.log();
    }

    console.log('== POST /api/identify (oversized image bytes) ==');
    const big = Buffer.alloc(2.4 * 1024 * 1024, 0x41);
    big[0] = 0xff;
    big[1] = 0xd8;
    big[2] = 0xff;
    const tooBig = await call('POST', '/api/identify', { image: big.toString('base64') });
    console.log(`  HTTP ${tooBig.status}  ${JSON.stringify(tooBig.json)}`);
    ok(
      'oversized image → 413 image_too_large',
      tooBig.status === 413 && tooBig.json.error === 'image_too_large'
    );
    console.log();

    // Finding 8: a tiny payload can still be an enormous canvas.
    console.log('== POST /api/identify (oversized dimensions, tiny payload) ==');
    const hugePng = Buffer.alloc(2000, 0);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(hugePng, 0);
    hugePng.writeUInt32BE(13, 8);
    hugePng.write('IHDR', 12, 'latin1');
    hugePng.writeUInt32BE(20000, 16);
    hugePng.writeUInt32BE(20000, 20);
    const hugeDim = await call('POST', '/api/identify', {
      image: `data:image/png;base64,${hugePng.toString('base64')}`,
    });
    console.log(`  20000x20000 in ${hugePng.length} bytes  HTTP ${hugeDim.status}  ${JSON.stringify(hugeDim.json)}`);
    ok(
      '20000px image → 413 image_too_large',
      hugeDim.status === 413 && hugeDim.json.error === 'image_too_large'
    );
    console.log();

    console.log('== POST /api/profile ==');
    const profileCases = [
      { name: 'Monstera Deliciosa', light_type: 'natural', soil_type: 'chunky_aroid', room: 'Living room' },
      { name: 'Hoya Kerrii', light_type: 'grow', soil_type: 'chunky_aroid', room: 'Office', pot_size: '4 inch' },
      { name: 'Alocasia Dragon Scale', light_type: 'natural', soil_type: 'sphagnum_moss', room: 'Bathroom' },
      {
        name: 'Cape Sundew',
        scientific_name: 'Drosera capensis',
        light_type: 'grow',
        soil_type: 'carnivore_peat',
        room: 'Windowsill',
        carnivoreExpected: true,
      },
    ];
    for (const { carnivoreExpected, ...body } of profileCases) {
      const r = await call('POST', '/api/profile', body);
      console.log(`  ${body.name}  ${r.ms} ms  HTTP ${r.status}`);
      console.log(`  ${JSON.stringify(r.json)}`);
      ok(`profile ${body.name} → 200`, r.status === 200);
      if (r.status === 200) {
        const p = r.json;
        ok(
          `profile ${body.name} baseline in 1..90`,
          Number.isInteger(p.species_baseline_days) &&
            p.species_baseline_days >= 1 &&
            p.species_baseline_days <= 90,
          `got ${p.species_baseline_days}`
        );
        ok(
          `profile ${body.name} enums legal`,
          ['moist', 'light_dry', 'moderate_dry', 'full_dry'].includes(p.moisture_pref) &&
            ['balanced', 'orchid_30_10_10', 'high_phosphorus', 'none'].includes(p.fert_type) &&
            ['tap_ok', 'distilled_or_rain'].includes(p.water_source)
        );
        ok(
          `profile ${body.name} rationale <= 220 chars`,
          (p.rationale || '').length <= 220,
          `len=${(p.rationale || '').length}`
        );
        ok(`profile ${body.name} tips <= 3`, Array.isArray(p.tips) && p.tips.length <= 3);
        // Finding 9: the server must clamp these to the same 1..90 the app does.
        const inRange = (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 90);
        ok(
          `profile ${body.name} mist/clean null or 1..90`,
          inRange(p.mist_every_days) && inRange(p.clean_every_days),
          `mist=${p.mist_every_days} clean=${p.clean_every_days}`
        );
        // Finding 6: the carnivore rule is absolute.
        if (carnivoreExpected) {
          ok(`profile ${body.name} flagged carnivore`, p.carnivore === true);
          if (p.carnivore === true) {
            ok(`carnivore ${body.name} moisture_pref = moist`, p.moisture_pref === 'moist', p.moisture_pref);
            ok(
              `carnivore ${body.name} baseline <= 3`,
              p.species_baseline_days <= 3,
              String(p.species_baseline_days)
            );
            ok(
              `carnivore ${body.name} water_source = distilled_or_rain`,
              p.water_source === 'distilled_or_rain'
            );
            ok(`carnivore ${body.name} fert_type = none`, p.fert_type === 'none');
            ok(`carnivore ${body.name} feed_every_n_waterings = 0`, p.feed_every_n_waterings === 0);
          }
        }
      }
      console.log();
    }

    console.log('== POST /api/profile (bad enum) ==');
    const bad = await call('POST', '/api/profile', {
      name: 'Pothos',
      light_type: 'sunlight',
      soil_type: 'chunky_aroid',
    });
    console.log(`  HTTP ${bad.status}  ${JSON.stringify(bad.json)}`);
    ok('bad light_type → 400 bad_request', bad.status === 400 && bad.json.error === 'bad_request');
    console.log();
  }

  // --------------------------------------------------- per-IP limiter (LAST)
  // This empties the bucket for this source address, so nothing may run after it.
  console.log('== per-IP rate limit (runs last: it empties the bucket) ==');
  const BURST = 60;
  const results = await Promise.all(
    Array.from({ length: BURST }, () => call('GET', '/health', undefined, { auth: false }))
  );
  const codes = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const limited = results.filter((r) => r.status === 429);
  console.log(`  ${BURST} rapid GET /health → ${JSON.stringify(codes)}`);
  ok('burst produces 429 rate_limited', limited.length > 0, `${limited.length} of ${BURST} limited`);
  if (limited.length) {
    console.log(`  429 body: ${JSON.stringify(limited[0].json)}`);
    ok(
      '429 body is rate_limited with retry_after_s',
      limited[0].json.error === 'rate_limited' && Number(limited[0].json.retry_after_s) >= 1
    );
  }
  console.log();

  const summary = [`${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`];
  if (skipped) summary.push(`${skipped} skipped`);
  console.log(summary.join(', '));
  if (skipped && !canModel) {
    console.log('Set ID_TOKEN to exercise /api/identify and /api/profile.');
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exit(2);
});
