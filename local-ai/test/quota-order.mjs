// Integration check: a per-uid daily quota is spent only by requests that PASSED
// validation. Run with:
//   npm run test:quota        (node test/quota-order.mjs)
//
// Why this is not a unit test: the ordering being pinned is the order of statements
// inside an Express route, and server.js starts listening at import time, so there
// is nothing importable to assert against. This file therefore spawns its OWN
// server and never touches the live one:
//
//   PORT                = 3199 (throwaway, not the live 3100)
//   DEV_ALLOW_NO_AUTH=1 + TAILSCALE_EXE pointed at a path that does not exist, so
//                         the Funnel guard takes its "cannot verify" branch and
//                         warns instead of refusing to start. Never do this on the
//                         live port — see the README's DEV_ALLOW_NO_AUTH section.
//   OLLAMA_URL          = a closed port, so a request that gets past the quota
//                         fails fast with 502 model_unavailable instead of
//                         occupying the GPU for 35 s. A 502 is the proof we want:
//                         it means the request was charged and reached generation.
//
// The shape of the check, per endpoint (quota = 20/day for both identify and
// diagnose):
//   5 bodies that fail validation   -> 400, and must cost NO quota
//   20 well-formed bodies           -> 502, and NONE of them may be 429
//                                      (before this change the 16th would have
//                                      been, because the 5 rejects had already
//                                      spent 5 of the 20 tokens)
//   1 more well-formed body         -> 429, proving the quota is real and that
//                                      exactly 20 valid calls fit in it
//
// 26 requests per endpoint keeps each phase under the per-client bucket's 30/min,
// and each endpoint gets a FRESH server process so the two phases cannot pool
// their IP buckets.
//
// /api/profile is deliberately NOT checked here: its allowance is 80/day, so the
// same shape would need 86 requests and blow through the 30/min client bucket
// several times over. Its charge site is line-for-line the same as the other two.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const PORT = Number(process.env.QUOTA_PORT || 3199);
const BASE = `http://127.0.0.1:${PORT}`;
const DAILY_QUOTA = 20; // identifyLimiter and diagnoseLimiter in server.js
const REJECTS = 5;

let failures = 0;

function ok(label, passed, extra = '') {
  if (!passed) failures++;
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`);
}

/**
 * The smallest byte sequence that satisfies every image check: JPEG magic, a
 * SOF0 frame header declaring 1x1 so imageDimensions() succeeds, and enough
 * padding to clear the 64-byte floor. Built here rather than read from
 * test/fixtures/ so this check needs no network and no downloaded fixture.
 */
function tinyJpeg() {
  const filler = Buffer.alloc(64, 0x20);
  const com = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    (() => {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(filler.length + 2);
      return b;
    })(),
    filler,
  ]);
  const sof0 = Buffer.from([
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  ]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), com, sof0, Buffer.from([0xff, 0xd9])]);
}

const IMAGE = `data:image/jpeg;base64,${tinyJpeg().toString('base64')}`;

/** Boot a throwaway server, run `fn(base)`, then always kill it. */
async function withServer(fn) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DEV_ALLOW_NO_AUTH: '1',
      // Nonexistent on purpose: the guard's ENOENT branch warns and continues.
      TAILSCALE_EXE: path.join(ROOT, 'no-such-tailscale.exe'),
      // Closed port: every generation attempt fails immediately as unreachable.
      OLLAMA_URL: 'http://127.0.0.1:9',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(String(d)));

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not log "listening" in 20 s')), 20_000);
      let buf = '';
      child.stdout.on('data', (d) => {
        buf += String(d);
        if (buf.includes('"evt":"listening"')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(
          new Error(
            `server exited early (code ${code}). Is port ${PORT} already in use?\n` +
              buf.split('\n').slice(-4).join('\n') +
              stderr.join('')
          )
        );
      });
    });
    return await fn(BASE);
  } finally {
    child.kill();
  }
}

/** POST a JSON body with no Authorization header (dev mode accepts loopback). */
async function post(pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* a body-less response is fine here; the status is what matters */
  }
  return { status: res.status, json, retryAfter: res.headers.get('retry-after') };
}

const diagnoseBody = (extra = {}) => ({
  image: IMAGE,
  name: 'Monstera Deliciosa',
  light_type: 'natural',
  soil_type: 'chunky_aroid',
  moisture_pref: 'light_dry',
  days_since_watered: 9,
  current_interval: 7,
  watering_count: 23,
  recent_events: [{ type: 'water', days_ago: 9 }],
  season: 'summer',
  ...extra,
});

/**
 * @param {object} o
 * @param {string} o.label     endpoint name for the output
 * @param {string} o.path      route to hit
 * @param {() => object} o.valid            a body that passes validation
 * @param {Array<{why: string, body: object}>} o.invalid  bodies that must 400
 */
async function checkEndpoint({ label, path: route, valid, invalid }) {
  console.log(`\n--- ${label} ---`);

  // Phase 1: requests that must be refused by validation.
  const rejects = [];
  for (const bad of invalid) {
    const r = await post(route, bad.body);
    rejects.push({ ...bad, ...r });
  }
  ok(
    `${label}: ${invalid.length} malformed bodies all answer 400`,
    rejects.every((r) => r.status === 400),
    rejects.map((r) => `${r.why}=${r.status}`).join(' ')
  );

  // Phase 2: the full daily allowance of well-formed requests. Every one must get
  // past the quota. With the limiter in front of validation, the phase-1 rejects
  // would have eaten REJECTS tokens and the tail of this loop would 429.
  const valids = [];
  for (let i = 0; i < DAILY_QUOTA; i++) {
    valids.push(await post(route, valid()));
  }
  const limited = valids.filter((r) => r.status === 429);
  ok(
    `${label}: none of the ${DAILY_QUOTA} valid calls is rate-limited`,
    limited.length === 0,
    limited.length
      ? `${limited.length} got 429 — a 400 is still spending quota`
      : `quota intact after ${invalid.length} rejects`
  );
  ok(
    `${label}: every valid call reached generation (502 model_unavailable)`,
    valids.every((r) => r.status === 502 && r.json?.error === 'model_unavailable'),
    [...new Set(valids.map((r) => `${r.status}/${r.json?.error}`))].join(' ')
  );

  // Phase 3: the quota is real, and it is exactly the documented size.
  const over = await post(route, valid());
  ok(
    `${label}: the call past the ${DAILY_QUOTA}-a-day allowance is 429 with Retry-After`,
    over.status === 429 &&
      over.json?.error === 'rate_limited' &&
      Number(over.json?.retry_after_s) > 0 &&
      over.retryAfter !== null,
    `${over.status} ${JSON.stringify(over.json)} retry-after=${over.retryAfter}`
  );
}

async function main() {
  console.log(`quota-order: throwaway server on ${BASE}, Ollama pointed at a closed port`);

  // A fresh process per endpoint: the per-client 30/min bucket is process-local,
  // and 26 requests per phase would not fit twice in one minute.
  await withServer(() =>
    checkEndpoint({
      label: '/api/diagnose',
      path: '/api/diagnose',
      valid: diagnoseBody,
      invalid: [
        { why: 'no image', body: diagnoseBody({ image: undefined }) },
        { why: 'bad season', body: diagnoseBody({ season: 'monsoon' }) },
        { why: 'bad pot_size', body: diagnoseBody({ pot_size: '4 inch' }) },
        { why: 'bad carnivore', body: diagnoseBody({ carnivore: 'yes' }) },
        { why: 'bad event type', body: diagnoseBody({ recent_events: [{ type: 'sprayed', days_ago: 1 }] }) },
      ].slice(0, REJECTS),
    })
  );

  await withServer(() =>
    checkEndpoint({
      label: '/api/identify',
      path: '/api/identify',
      valid: () => ({ image: IMAGE }),
      invalid: [
        { why: 'no image', body: {} },
        { why: 'image not a string', body: { image: 42 } },
        { why: 'too short', body: { image: '/9j/AAAA' } },
        { why: 'wrong mime', body: { image: `data:image/gif;base64,${'A'.repeat(200)}` } },
        { why: 'not base64', body: { image: `data:image/jpeg;base64,${'!'.repeat(200)}` } },
      ].slice(0, REJECTS),
    })
  );

  console.log(`\n${failures ? `FAILED (${failures})` : 'all checks passed'}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('quota-order: ' + (err?.stack || err));
  process.exit(1);
});
