// Plantaroo local AI bridge.
//
// Runs on Jamal's Windows PC, fronted by Tailscale Funnel. Every request is
// treated as public internet traffic: per-client and global token buckets in front
// of everything, a Firebase ID token required on /api/*, per-uid daily quotas, hard
// caps on body/image size and pixel dimensions, and a bounded concurrency gate so
// a burst cannot thrash the GPU or pile up in memory.
//
// Middleware order matters and is load-bearing:
//   cors -> client+global buckets -> [/health] -> auth (headers only)
//   -> content-type -> express.json -> body checks -> per-uid quota -> route
// Auth deliberately runs BEFORE the body parser: an unauthenticated 4 MB POST
// must cost a 401 and nothing else — no JSON parse, no buffered string.
//
// Endpoints:
//   GET  /health          — no auth, minimal body, 15 s cached Ollama probe
//   GET  /api/status      — auth required, the detailed version of /health
//   POST /api/identify    — photo -> plant candidates
//   POST /api/profile     — plant + setup -> care profile
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import express from 'express';
import cors from 'cors';

import { requireAuth, isLoopback, certStatus } from './lib/auth.js';
import { clientIp, forwardedHopCount } from './lib/clientip.js';
import { RateLimiter, IpBucket, Semaphore } from './lib/limits.js';
import { chatJson, checkOllama, warmModel, OllamaError } from './lib/ollama.js';
import {
  IDENTIFY_SYSTEM,
  IDENTIFY_USER,
  PROFILE_SYSTEM,
  profileUserPrompt,
  RETRY_NUDGE,
} from './lib/prompts.js';
import {
  decodeImage,
  precheckImage,
  normalizeIdentify,
  normalizeProfile,
  validateProfileBody,
} from './lib/normalize.js';

const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '127.0.0.1';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const MODEL = process.env.MODEL || 'qwen2.5vl:7b';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'plantaroo-204ca';
const DEV_ALLOW_NO_AUTH = process.env.DEV_ALLOW_NO_AUTH === '1';
const TAILSCALE_EXE = process.env.TAILSCALE_EXE || 'C:\\Program Files\\Tailscale\\tailscale.exe';

const BODY_LIMIT = '4mb';

// --- Timeout budget -------------------------------------------------------
// The app client allows 70 s for identify and 60 s for profile. Every server
// path must fit inside that with room for network, so:
//   identify: gate wait 15 + generate 50            = 65 s  (< 70)
//   profile:  gate wait 15 + first 25 + retry 15    = 55 s  (< 60)
// Changing any of these means changing the client's timeouts to match.
const BUSY_WAIT_MS = 15_000;
const IDENTIFY_TIMEOUT_MS = 50_000;
const PROFILE_FIRST_TIMEOUT_MS = 25_000;
const PROFILE_RETRY_TIMEOUT_MS = 15_000;
// Node's own socket caps sit just outside the worst case above.
const SERVER_REQUEST_TIMEOUT_MS = 80_000;
const SERVER_HEADERS_TIMEOUT_MS = 80_000;

const MAX_CONCURRENT_GENERATIONS = 2;
// Waiters beyond this get an instant 503 instead of parking in memory. With a
// 15 s wait and 2 slots, 8 waiters is already more backlog than a single-user
// service can usefully drain.
const MAX_GENERATION_QUEUE = 8;

const IP_RATE_CAPACITY = 30;
const IP_RATE_WINDOW_MS = 60_000;
const IP_RATE_MAX_KEYS = 5000;

// Backstop across ALL clients, on top of the per-client bucket. The per-client
// key comes from X-Forwarded-For (see lib/clientip.js), so it is only ever as
// trustworthy as the ingress that set the header; this second bucket caps total
// inbound traffic regardless of how many distinct client addresses show up or are
// claimed. 240/min = 8x one client's allowance: ample for a handful of real
// devices, a hard ceiling on a distributed flood.
const GLOBAL_RATE_CAPACITY = 240;
const GLOBAL_RATE_WINDOW_MS = 60_000;

const HEALTH_CACHE_MS = 15_000;

const STARTED_AT = Date.now();

// ---------------------------------------------------------------- logging

/** Structured single-line logs to stdout. Never logs image bytes or prompts. */
function log(fields) {
  try {
    process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...fields }) + '\n');
  } catch {
    /* logging must never throw */
  }
}

// Rate-limit rejections are the one event a flood can produce without bound, and
// stdout is redirected to an unrotated server.log. Emit at most one line per kind
// per LOG_THROTTLE_MS, carrying how many were suppressed, so a flood stays
// visible without being able to fill the disk.
const LOG_THROTTLE_MS = 5_000;
/** @type {Map<string, {at: number, suppressed: number}>} fixed, tiny key set */
const throttleState = new Map();

function logThrottled(kind, fields) {
  const now = Date.now();
  const st = throttleState.get(kind) || { at: 0, suppressed: 0 };
  if (now - st.at < LOG_THROTTLE_MS) {
    st.suppressed++;
    throttleState.set(kind, st);
    return;
  }
  log({ ...fields, ...(st.suppressed ? { suppressed_since_last: st.suppressed } : {}) });
  throttleState.set(kind, { at: now, suppressed: 0 });
}

// ------------------------------------------------------------------ state

const identifyLimiter = new RateLimiter(20);
const profileLimiter = new RateLimiter(80);
const ipBucket = new IpBucket({
  capacity: IP_RATE_CAPACITY,
  windowMs: IP_RATE_WINDOW_MS,
  maxKeys: IP_RATE_MAX_KEYS,
});
// Same token-bucket mechanics, one fixed key: every request shares it.
const GLOBAL_BUCKET_KEY = 'all';
const globalBucket = new IpBucket({
  capacity: GLOBAL_RATE_CAPACITY,
  windowMs: GLOBAL_RATE_WINDOW_MS,
  maxKeys: 1,
});
const gpuGate = new Semaphore(MAX_CONCURRENT_GENERATIONS, MAX_GENERATION_QUEUE);

// Counters, surfaced by GET /api/status. `jsonBytesParsed` is the proof that auth
// runs before the body parser: a rejected request never advances it.
const counters = {
  requests: 0,
  ip_limited: 0,
  global_limited: 0,
  json_bodies: 0,
  json_bytes: 0,
  aborted: 0,
};

// Keep the limiter maps from growing forever on a long-running box.
setInterval(() => {
  identifyLimiter.sweep();
  profileLimiter.sweep();
}, 60 * 60 * 1000).unref();
setInterval(() => ipBucket.sweep(), 5 * 60 * 1000).unref();

// ----------------------------------------------- cached Ollama health probe

let healthCache = { at: 0, reachable: false, modelPresent: false };
let healthInflight = null;

/**
 * Ollama reachability, cached for HEALTH_CACHE_MS and single-flighted.
 * /health is unauthenticated, so it must never turn into an amplified proxy
 * hitting the Ollama daemon once per inbound request.
 */
function ollamaHealth() {
  if (Date.now() - healthCache.at < HEALTH_CACHE_MS) return Promise.resolve(healthCache);
  if (healthInflight) return healthInflight;
  healthInflight = checkOllama({ baseUrl: OLLAMA_URL, model: MODEL })
    .then((h) => {
      healthCache = { at: Date.now(), reachable: h.reachable, modelPresent: h.modelPresent };
      return healthCache;
    })
    .catch(() => {
      healthCache = { at: Date.now(), reachable: false, modelPresent: false };
      return healthCache;
    })
    .finally(() => {
      healthInflight = null;
    });
  return healthInflight;
}

// ------------------------------------------------------------------- app

const app = express();
app.disable('x-powered-by');
// Stays OFF deliberately. `req.ip`, `req.ips`, `req.protocol` and `req.hostname`
// keep reporting raw socket facts, so no framework behaviour starts depending on a
// header. X-Forwarded-For is read in exactly one place, for exactly two purposes
// (the rate-limit key and the log field), via clientIp() — see lib/clientip.js for
// why that is safe here and why auth does not use it.
app.set('trust proxy', false);

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
  })
);

// 1. Token buckets, ahead of EVERYTHING including /health. These are the only
//    limits that apply to unauthenticated traffic, so they are what actually
//    stops a flood — the per-uid quotas below can only run after a valid token.
//
//    Two layers: the per-client bucket keyed on clientIp() (which unwraps
//    Funnel's X-Forwarded-For, so one noisy caller can no longer starve the
//    rest), then a global bucket as a backstop that does not depend on that key
//    being honest. Per-client is checked first so an already-rejected request
//    does not spend a global token.
app.use((req, res, next) => {
  counters.requests++;
  const ip = clientIp(req);
  req.clientIp = ip;

  // A proxied request normally carries exactly one X-Forwarded-For hop. We key on
  // the LAST hop (always written by the trusted proxy), so multi-hop is safe, but
  // surface it for visibility (a second proxy, or an appending ingress). The
  // global bucket below is
  // what actually contains the damage either way.
  const hops = forwardedHopCount(req);
  if (hops > 1) {
    logThrottled('xff_hops', {
      evt: 'warn',
      reason: 'forwarded_for_multi_hop',
      ip,
      hops,
      msg: 'X-Forwarded-For carried more than one hop; per-client rate-limit keys may be forgeable',
    });
  }

  const perClient = ipBucket.take(ip);
  if (!perClient.ok) {
    counters.ip_limited++;
    logThrottled('ip', {
      evt: 'rate_limited',
      kind: 'ip',
      ip,
      path: req.originalUrl || req.path,
      retry_after_s: perClient.retry_after_s,
    });
    res.set('Retry-After', String(perClient.retry_after_s));
    return res.status(429).json({ error: 'rate_limited', retry_after_s: perClient.retry_after_s });
  }

  const overall = globalBucket.take(GLOBAL_BUCKET_KEY);
  if (!overall.ok) {
    counters.global_limited++;
    logThrottled('global', {
      evt: 'rate_limited',
      kind: 'global',
      ip,
      path: req.originalUrl || req.path,
      retry_after_s: overall.retry_after_s,
      tracked_clients: ipBucket.size,
    });
    res.set('Retry-After', String(overall.retry_after_s));
    return res.status(429).json({ error: 'rate_limited', retry_after_s: overall.retry_after_s });
  }

  return next();
});

// 2. /health lives outside auth and outside the body parser.
app.get('/health', async (_req, res) => {
  const h = await ollamaHealth();
  res.set('Cache-Control', 'no-store');
  // Public surface: liveness plus one boolean. No model name, no uptime, no
  // build detail — an unauthenticated caller learns nothing about this box.
  return res.json({ ok: true, ollama: h.reachable && h.modelPresent });
});

// 3. Auth. Headers only, before any body is read.
app.use('/api', requireAuth({ projectId: FIREBASE_PROJECT_ID, devAllowNoAuth: DEV_ALLOW_NO_AUTH, log }));

// 4. Content-type gate — after auth, so an anonymous caller gets a bare 401 and
//    no hints about what the API expects.
app.use('/api', (req, res, next) => {
  if (req.method !== 'POST') return next();
  const ct = (req.get('content-type') || '').toLowerCase();
  if (!ct.includes('json')) {
    return res
      .status(400)
      .json({ error: 'bad_request', detail: 'Content-Type must be application/json' });
  }
  return next();
});

// 5. Body parsing, only for authenticated /api/* requests.
app.use(
  '/api',
  express.json({
    limit: BODY_LIMIT,
    type: ['application/json', 'application/*+json'],
    verify: (req, _res, buf) => {
      req.bodyBytes = buf.length;
      counters.json_bodies++;
      counters.json_bytes += buf.length;
      log({ evt: 'body_read', path: req.originalUrl || req.path, uid: req.uid, bytes: buf.length });
    },
  })
);

// Body-parser failures (too large, malformed JSON) land here.
app.use('/api', (err, req, res, next) => {
  if (!err) return next();
  if (err.type === 'entity.too.large') {
    log({ evt: 'reject', reason: 'body_too_large', uid: req.uid, path: req.originalUrl || req.path });
    return res.status(413).json({ error: 'image_too_large' });
  }
  log({ evt: 'reject', reason: 'bad_json', uid: req.uid, path: req.originalUrl || req.path });
  return res.status(400).json({ error: 'bad_request', detail: 'body must be valid JSON' });
});

app.use('/api', (req, res, next) => {
  if (req.method !== 'POST') return next();
  if (req.body === undefined || req.body === null) {
    return res.status(400).json({ error: 'bad_request', detail: 'missing JSON body' });
  }
  return next();
});

// ---------------------------------------------------------------- helpers

function rateLimit(limiter, kind) {
  return (req, res, next) => {
    const verdict = limiter.take(req.uid);
    if (!verdict.ok) {
      log({
        evt: 'rate_limited',
        kind,
        uid: req.uid,
        ip: req.clientIp,
        retry_after_s: verdict.retry_after_s,
      });
      res.set('Retry-After', String(verdict.retry_after_s));
      return res.status(429).json({ error: 'rate_limited', retry_after_s: verdict.retry_after_s });
    }
    return next();
  };
}

/**
 * Watch for the client hanging up, and expose an AbortSignal for it.
 *
 * NOTE on the event choice: on Node 20 `req`'s 'close' fires for *every* request
 * as soon as its body has been fully read — well before the response is written —
 * so it cannot be used on its own to mean "client gone". The reliable pair is:
 *   - res 'close' with !res.writableFinished  -> socket died before we finished
 *   - req 'close' with !req.complete          -> body never finished arriving
 *
 * Aborting matters because the GPU slot is the scarce resource: without this, a
 * user who backgrounds the app mid-identify holds one of two slots for up to 50 s
 * of generation nobody will ever read.
 */
function watchClient(req, res) {
  const ac = new AbortController();
  const state = { gone: false };

  const markGone = (why) => {
    if (state.gone) return;
    state.gone = true;
    counters.aborted++;
    log({ evt: 'client_gone', why, path: req.originalUrl || req.path, uid: req.uid });
    ac.abort();
  };

  const onReqClose = () => {
    if (!req.complete) markGone('request_incomplete');
  };
  const onResClose = () => {
    if (!res.writableFinished) markGone('response_unfinished');
  };

  req.on('close', onReqClose);
  res.on('close', onResClose);

  return {
    signal: ac.signal,
    get gone() {
      return state.gone;
    },
    dispose() {
      req.off('close', onReqClose);
      res.off('close', onResClose);
    },
  };
}

/**
 * Acquire a GPU slot, translating the semaphore's verdict into a response.
 * @returns {Promise<{ok:true} | {ok:false, sent:boolean}>} sent=false means the
 *          client is gone and no response should be written at all.
 */
async function takeGpuSlot(req, res, kind, t0, signal) {
  const gate = await gpuGate.acquire(BUSY_WAIT_MS, signal);
  if (gate.ok) return { ok: true };

  if (gate.reason === 'aborted') {
    log({ evt: 'abandoned', kind, uid: req.uid, ms: Date.now() - t0, at: 'queue' });
    return { ok: false, sent: false };
  }
  log({
    evt: 'busy',
    kind,
    uid: req.uid,
    ms: Date.now() - t0,
    reason: gate.reason,
    waiting: gpuGate.waiting,
  });
  res.set('Retry-After', '5');
  res.status(503).json({ error: 'busy' });
  return { ok: false, sent: true };
}

function sendOllamaError(res, err, kind, uid, ms) {
  if (err instanceof OllamaError && err.kind === 'aborted') {
    // The socket is already gone; there is nobody to answer.
    log({ evt: 'abandoned', kind, uid, ms, at: 'generation' });
    return undefined;
  }
  if (err instanceof OllamaError && err.kind === 'timeout') {
    log({ evt: 'error', kind, uid, ms, reason: 'model_timeout' });
    return res.status(504).json({ error: 'model_timeout' });
  }
  // Everything else (unreachable, HTTP error, unparseable) is a bad gateway from
  // the client's point of view. Details stay in the server log.
  log({
    evt: 'error',
    kind,
    uid,
    ms,
    reason: err instanceof OllamaError ? err.kind : 'internal',
    detail: String(err?.message || err).slice(0, 300),
  });
  return res.status(502).json({ error: 'model_unavailable' });
}

// ----------------------------------------------------------------- routes

// The detailed health/diagnostics view, behind auth.
app.get('/api/status', async (req, res) => {
  const h = await ollamaHealth();
  res.set('Cache-Control', 'no-store');
  return res.json({
    ok: true,
    ollama: h.reachable && h.modelPresent,
    ollama_reachable: h.reachable,
    model: MODEL,
    model_present: h.modelPresent,
    health_cached_age_s: Math.round((Date.now() - healthCache.at) / 1000),
    uptime_s: Math.round((Date.now() - STARTED_AT) / 1000),
    node: process.version,
    dev_auth: !!req.devAuth,
    gpu: {
      slots: MAX_CONCURRENT_GENERATIONS,
      active: gpuGate.active,
      waiting: gpuGate.waiting,
      max_queue: MAX_GENERATION_QUEUE,
      busy_wait_ms: BUSY_WAIT_MS,
    },
    timeouts: {
      identify_ms: IDENTIFY_TIMEOUT_MS,
      profile_first_ms: PROFILE_FIRST_TIMEOUT_MS,
      profile_retry_ms: PROFILE_RETRY_TIMEOUT_MS,
    },
    client_ip: req.clientIp || null,
    ip_limit: { capacity: IP_RATE_CAPACITY, window_ms: IP_RATE_WINDOW_MS, tracked: ipBucket.size },
    global_limit: { capacity: GLOBAL_RATE_CAPACITY, window_ms: GLOBAL_RATE_WINDOW_MS },
    counters,
    certs: certStatus(),
  });
});

app.post('/api/identify', rateLimit(identifyLimiter, 'identify'), async (req, res) => {
  const t0 = Date.now();

  // Cheap checks BEFORE the gate: string length, data-URI mime, base64 magic.
  // The expensive base64 decode (which holds ~1.4x the payload in a Buffer for
  // the whole generation) waits until a slot is actually in hand — otherwise a
  // queue of 8 waiters would each be sitting on megabytes for up to 15 s.
  const pre = precheckImage(req.body?.image);
  if (!pre.ok) {
    log({ evt: 'reject', kind: 'identify', uid: req.uid, reason: pre.error, detail: pre.detail });
    const payload = { error: pre.error };
    if (pre.detail) payload.detail = pre.detail;
    return res.status(pre.status).json(payload);
  }

  const watch = watchClient(req, res);
  try {
    const slot = await takeGpuSlot(req, res, 'identify', t0, watch.signal);
    if (!slot.ok) return undefined;

    try {
      const img = decodeImage(req.body.image);
      if (!img.ok) {
        log({ evt: 'reject', kind: 'identify', uid: req.uid, reason: img.error, detail: img.detail });
        const payload = { error: img.error };
        if (img.detail) payload.detail = img.detail;
        return res.status(img.status).json(payload);
      }

      const out = await chatJson({
        baseUrl: OLLAMA_URL,
        model: MODEL,
        timeoutMs: IDENTIFY_TIMEOUT_MS,
        temperature: 0.2,
        numPredict: 400,
        signal: watch.signal,
        messages: [
          { role: 'system', content: IDENTIFY_SYSTEM },
          { role: 'user', content: IDENTIFY_USER, images: [img.base64] },
        ],
      });

      if (watch.gone) {
        log({ evt: 'abandoned', kind: 'identify', uid: req.uid, ms: Date.now() - t0, at: 'reply' });
        return undefined;
      }

      const result = normalizeIdentify(out.parsed);
      if (!result) {
        log({ evt: 'error', kind: 'identify', uid: req.uid, reason: 'model_output_invalid' });
        return res.status(502).json({ error: 'model_output_invalid' });
      }

      log({
        evt: 'identify',
        uid: req.uid,
        ms: Date.now() - t0,
        bytes: img.bytes,
        px: img.width && img.height ? `${img.width}x${img.height}` : null,
        top: result.candidates[0]?.common_name || '(none)',
        n: result.candidates.length,
      });
      return res.json(result);
    } finally {
      gpuGate.release();
    }
  } catch (err) {
    return sendOllamaError(res, err, 'identify', req.uid, Date.now() - t0);
  } finally {
    watch.dispose();
  }
});

app.post('/api/profile', rateLimit(profileLimiter, 'profile'), async (req, res) => {
  const t0 = Date.now();
  const parsedBody = validateProfileBody(req.body);
  if (!parsedBody.ok) {
    log({ evt: 'reject', kind: 'profile', uid: req.uid, reason: parsedBody.detail });
    return res.status(400).json({ error: 'bad_request', detail: parsedBody.detail });
  }
  const p = parsedBody.value;
  const userPrompt = profileUserPrompt(p);

  const watch = watchClient(req, res);
  try {
    const slot = await takeGpuSlot(req, res, 'profile', t0, watch.signal);
    if (!slot.ok) return undefined;

    let retried = false;
    try {
      const baseMessages = [
        { role: 'system', content: PROFILE_SYSTEM },
        { role: 'user', content: userPrompt },
      ];

      const first = await chatJson({
        baseUrl: OLLAMA_URL,
        model: MODEL,
        timeoutMs: PROFILE_FIRST_TIMEOUT_MS,
        temperature: 0.1,
        numPredict: 700,
        signal: watch.signal,
        messages: baseMessages,
      });

      let profile = normalizeProfile(first.parsed);
      if (!profile && !watch.gone) {
        // One corrective round-trip before giving up. Its budget is deliberately
        // tighter than the first attempt so the pair still fits the client cap.
        retried = true;
        const second = await chatJson({
          baseUrl: OLLAMA_URL,
          model: MODEL,
          timeoutMs: PROFILE_RETRY_TIMEOUT_MS,
          temperature: 0.1,
          numPredict: 700,
          signal: watch.signal,
          messages: [
            ...baseMessages,
            { role: 'assistant', content: first.raw.slice(0, 2000) },
            { role: 'user', content: RETRY_NUDGE },
          ],
        });
        profile = normalizeProfile(second.parsed);
      }

      if (watch.gone) {
        log({ evt: 'abandoned', kind: 'profile', uid: req.uid, ms: Date.now() - t0, at: 'reply' });
        return undefined;
      }

      if (!profile) {
        log({
          evt: 'error',
          kind: 'profile',
          uid: req.uid,
          ms: Date.now() - t0,
          reason: 'model_output_invalid',
          name: p.name,
        });
        return res.status(502).json({ error: 'model_output_invalid' });
      }

      log({
        evt: 'profile',
        uid: req.uid,
        ms: Date.now() - t0,
        name: p.name,
        retried,
        baseline: profile.species_baseline_days,
      });
      return res.json(profile);
    } finally {
      gpuGate.release();
    }
  } catch (err) {
    return sendOllamaError(res, err, 'profile', req.uid, Date.now() - t0);
  } finally {
    watch.dispose();
  }
});

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// Final safety net: never leak a stack trace to a client.
app.use((err, req, res, _next) => {
  log({ evt: 'error', reason: 'unhandled', path: req.originalUrl || req.path, detail: String(err?.message || err) });
  if (res.headersSent) return res.end();
  return res.status(500).json({ error: 'internal_error' });
});

// ------------------------------------------------------------------ boot

/**
 * Belt-and-braces guard for DEV_ALLOW_NO_AUTH.
 *
 * `DEV_ALLOW_NO_AUTH=1` waives auth for loopback callers — and Tailscale Funnel
 * proxies inbound internet traffic to loopback, so on an exposed machine that
 * combination hands the whole API to anyone who knows the hostname. `tailscale
 * funnel status` prints "No serve config" when nothing is exposed; anything else
 * means a serve/Funnel config exists and dev mode must not run.
 */
let funnelCheckResult = 'not run';

function assertSafeForDevAuth() {
  let out = '';
  try {
    out = execFileSync(TAILSCALE_EXE, ['funnel', 'status'], {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (err) {
    const code = err?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES') {
      log({
        evt: 'warn',
        reason: 'tailscale_not_found',
        path: TAILSCALE_EXE,
        msg:
          'Could not verify that no Tailscale Funnel is configured. Assuming this machine is not ' +
          'exposed. If it is, DEV_ALLOW_NO_AUTH=1 publishes this API to the internet.',
      });
      funnelCheckResult = 'tailscale CLI not found — could not verify';
      return;
    }
    // Non-zero exit still prints to stdout; a timeout leaves us unable to tell.
    out = `${err?.stdout || ''}\n${err?.stderr || ''}`;
    if (code === 'ETIMEDOUT' || !out.trim()) {
      log({
        evt: 'fatal',
        reason: 'funnel_check_inconclusive',
        detail: code || 'no output',
        msg:
          'DEV_ALLOW_NO_AUTH=1 but `tailscale funnel status` could not be read, so it is not ' +
          'provable that this machine is unexposed. Refusing to start. Set DEV_ALLOW_NO_AUTH=0.',
      });
      process.exit(1);
    }
  }

  if (/no serve config/i.test(out)) {
    funnelCheckResult = 'verified: no Tailscale serve/Funnel config';
    return;
  }

  log({
    evt: 'fatal',
    reason: 'dev_auth_with_funnel',
    detail: out.replace(/\s+/g, ' ').trim().slice(0, 300),
    msg:
      'DEV_ALLOW_NO_AUTH=1 but a Tailscale serve/Funnel config exists. Funnel proxies public ' +
      'traffic to 127.0.0.1, so loopback is NOT a trust boundary here and dev mode would expose ' +
      'this API to the internet unauthenticated. Refusing to start. Set DEV_ALLOW_NO_AUTH=0, or ' +
      'run `tailscale funnel reset` first if you really are testing locally.',
  });
  process.exit(1);
}

if (DEV_ALLOW_NO_AUTH) assertSafeForDevAuth();

const server = app.listen(PORT, HOST, async () => {
  log({
    evt: 'listening',
    host: HOST,
    port: PORT,
    model: MODEL,
    ollama_url: OLLAMA_URL,
    project: FIREBASE_PROJECT_ID,
  });
  if (DEV_ALLOW_NO_AUTH) {
    log({
      evt: 'warn',
      msg:
        'DEV_ALLOW_NO_AUTH=1 — unauthenticated LOOPBACK requests are accepted as uid "dev". ' +
        'Tailscale Funnel proxies public traffic to loopback, so this must never be set on a ' +
        `machine with a Funnel/serve config. Startup check — ${funnelCheckResult}.`,
    });
  }
  const health = await checkOllama({ baseUrl: OLLAMA_URL, model: MODEL });
  healthCache = { at: Date.now(), reachable: health.reachable, modelPresent: health.modelPresent };
  log({
    evt: 'ollama_check',
    reachable: health.reachable,
    model_present: health.modelPresent,
    models: health.models.slice(0, 10),
  });

  // Preload the weights so the first user request is a warm one. Runs in the
  // background: the server is already accepting connections, and /health stays
  // honest while this is in flight.
  if (health.reachable && health.modelPresent) {
    warmModel({ baseUrl: OLLAMA_URL, model: MODEL }).then((w) =>
      log({ evt: 'warmup', ok: w.ok, ms: w.ms, ...(w.error ? { error: w.error } : {}) })
    );
  }
});

// Slow clients should not hold sockets forever. These sit just outside the worst
// case the routes can produce (identify: 15 s queue + 50 s generation).
server.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;
server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log({ evt: 'shutdown', sig });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

process.on('unhandledRejection', (reason) => {
  log({ evt: 'error', reason: 'unhandled_rejection', detail: String(reason).slice(0, 300) });
});

export { app, isLoopback };
