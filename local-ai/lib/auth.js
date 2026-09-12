// Firebase ID token verification without a service account.
//
// Firebase signs ID tokens with RS256 using rotating Google keys. The public
// halves are published as X.509 certs at the securetoken URL below, keyed by the
// token's `kid`. Node's crypto (via jsonwebtoken) accepts an X.509 PEM directly,
// so no key conversion is needed.
import jwt from 'jsonwebtoken';

import { clientIp, devAuthEligible, isLoopbackAddr, socketAddr } from './clientip.js';

const CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// kid -> PEM, plus the expiry derived from Cache-Control: max-age.
let certs = null;
let certsExpireAt = 0;
let certsFetchedAt = 0;
let inflight = null;
let lastForcedFetch = 0;
let lastCertError = null;

const FORCE_FETCH_THROTTLE_MS = 60_000; // do not hammer Google on bogus kids
// While a refetch is failing, retry no more often than this so a Google outage
// does not turn every request into an 8 s cert fetch attempt.
const CERT_RETRY_AFTER_FAILURE_MS = 30_000;
let nextCertRetryAt = 0;

let authLog = () => {};

/** Let the server route cert-refresh warnings into its structured log. */
export function setAuthLogger(fn) {
  if (typeof fn === 'function') authLog = fn;
}

/** Cert-cache state, for the authenticated /api/status endpoint. */
export function certStatus() {
  return {
    loaded: certs ? Object.keys(certs).length : 0,
    fetched_at: certsFetchedAt ? new Date(certsFetchedAt).toISOString() : null,
    expired: certs ? Date.now() >= certsExpireAt : true,
    last_error: lastCertError,
  };
}

async function fetchCerts(timeoutMs = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(CERT_URL, { signal: ac.signal });
    if (!res.ok) throw new Error(`cert fetch failed: HTTP ${res.status}`);
    const body = await res.json();
    const cc = res.headers.get('cache-control') || '';
    const m = /max-age\s*=\s*(\d+)/i.exec(cc);
    // Fall back to 1h if the header is missing; cap at 24h.
    const maxAge = m ? Math.min(parseInt(m[1], 10), 86400) : 3600;
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      throw new Error('cert fetch returned no certs');
    }
    certs = body;
    certsFetchedAt = Date.now();
    certsExpireAt = certsFetchedAt + maxAge * 1000;
    lastCertError = null;
    nextCertRetryAt = 0;
    return certs;
  } finally {
    clearTimeout(t);
  }
}

// Single-flight so N concurrent requests cause at most one fetch.
function loadCerts() {
  if (!inflight) {
    inflight = fetchCerts().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * Refresh the cert cache, tolerating failure.
 *
 * A Google outage or a transient DNS blip must NOT take the whole API down:
 * Firebase's signing certs stay valid well past the Cache-Control window, so if
 * we already have a cert set we keep using it (loudly) instead of failing every
 * request. We only fail closed when there is nothing cached at all.
 *
 * @returns {Promise<boolean>} true if certs are usable afterwards
 */
async function refreshCerts() {
  if (lastCertError && Date.now() < nextCertRetryAt && certs) return true;
  try {
    await loadCerts();
    return true;
  } catch (err) {
    lastCertError = String(err?.message || err).slice(0, 200);
    nextCertRetryAt = Date.now() + CERT_RETRY_AFTER_FAILURE_MS;
    if (certs) {
      authLog({
        evt: 'warn',
        reason: 'cert_refresh_failed',
        detail: lastCertError,
        msg: 'serving with the previously fetched Firebase certs (stale but still valid)',
        cert_age_s: Math.round((Date.now() - certsFetchedAt) / 1000),
      });
      return true;
    }
    authLog({ evt: 'error', reason: 'cert_fetch_failed_no_cache', detail: lastCertError });
    return false;
  }
}

async function getCert(kid) {
  if (!certs || Date.now() >= certsExpireAt) {
    const usable = await refreshCerts();
    if (!usable) throw new Error('certs unavailable');
  }
  if (certs && certs[kid]) return certs[kid];
  // Unknown kid: Google may have rotated early. Refetch once, throttled.
  if (Date.now() - lastForcedFetch > FORCE_FETCH_THROTTLE_MS) {
    lastForcedFetch = Date.now();
    await refreshCerts();
  }
  return certs ? certs[kid] : undefined;
}

/**
 * Verify a Firebase ID token. Resolves to the uid, or throws.
 */
export async function verifyIdToken(token, projectId) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header) throw new Error('malformed token');
  if (decoded.header.alg !== 'RS256') throw new Error('unexpected alg');
  const kid = decoded.header.kid;
  if (!kid) throw new Error('missing kid');

  const pem = await getCert(kid);
  if (!pem) throw new Error('unknown kid');

  const payload = jwt.verify(token, pem, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
    // jsonwebtoken checks exp/nbf itself; iat must also be in the past.
    clockTolerance: 5,
  });

  const uid = payload.sub;
  if (typeof uid !== 'string' || uid.length === 0) throw new Error('missing sub');
  if (typeof payload.auth_time === 'number' && payload.auth_time > Date.now() / 1000 + 5) {
    throw new Error('auth_time in the future');
  }
  return uid;
}

/**
 * True when the TCP peer is localhost.
 *
 * WARNING — this is NOT a trust boundary. `tailscaled` terminates Tailscale
 * Funnel and proxies to 127.0.0.1, so **requests from the public internet arrive
 * as loopback** and are indistinguishable here from a request typed on the
 * console. Loopback therefore means "reached this process", not "came from this
 * machine".
 *
 * Not used to gate dev auth on its own — see `devAuthEligible` in clientip.js,
 * which also refuses any request carrying an X-Forwarded-For header.
 */
export function isLoopback(req) {
  return isLoopbackAddr(socketAddr(req));
}

/**
 * Express middleware factory. Sets req.uid on success.
 *
 * Reads HEADERS ONLY — it must be mounted BEFORE express.json() so an
 * unauthenticated flood never gets a body parsed (let alone buffered) on its
 * behalf.
 */
export function requireAuth({ projectId, devAllowNoAuth, log }) {
  setAuthLogger(log);
  return async function authMiddleware(req, res, next) {
    // Set by the rate-limit middleware; recomputed here so the module works
    // standalone (and in tests) without depending on middleware order.
    const ip = req.clientIp || clientIp(req);
    const header = req.get('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(header.trim());

    if (!m) {
      // Raw-socket loopback AND no X-Forwarded-For. A proxied request is never a
      // dev caller, even with the flag on.
      if (devAllowNoAuth && devAuthEligible(req)) {
        req.uid = 'dev';
        req.devAuth = true;
        return next();
      }
      const reason = devAllowNoAuth && isLoopback(req) ? 'no_bearer_proxied' : 'no_bearer';
      log({ evt: 'auth_fail', reason, ip, path: req.originalUrl || req.path });
      return res.status(401).json({ error: 'unauthorized' });
    }

    try {
      req.uid = await verifyIdToken(m[1], projectId);
      return next();
    } catch (err) {
      log({
        evt: 'auth_fail',
        reason: String(err.message || err),
        ip,
        path: req.originalUrl || req.path,
      });
      return res.status(401).json({ error: 'unauthorized' });
    }
  };
}
