// Deriving a client IP for rate limiting and logging behind Tailscale Funnel.
//
// THE PROBLEM: `tailscaled` terminates the public TLS connection ON THIS MACHINE
// and proxies to 127.0.0.1, so every Funnel request arrives with
// `socket.remoteAddress` set to loopback. Keying the per-IP limiter on the socket
// address therefore lumped the entire internet into one shared 30 req/min bucket:
// any single caller could starve every other caller, and a flood needed no
// distribution at all to trip it.
//
// THE FIX: Tailscale serve/funnel sets `X-Forwarded-For` (alongside
// `X-Forwarded-Proto` and `X-Forwarded-Host`) to the real client address on every
// proxied request. Funnel is the only ingress. Whether it *replaces* the inbound
// X-Forwarded-For or *appends* to it, the value it wrote is the LAST hop, so the
// last value is the client `tailscaled` saw — never something the client chose.
// We use it, but only when the TCP peer is loopback,
// i.e. only when the request really did arrive through the local proxy. A request
// from a genuine remote address (LAN, if HOST is widened) carries no XFF we have
// any reason to believe, so the header is ignored outright.
//
// SCOPE — deliberately narrow. This derivation feeds the RATE LIMITER and the
// structured logs, nothing else:
//   - Express `trust proxy` stays OFF, so `req.ip` / `req.ips` / `req.protocol`
//     keep reporting the raw socket facts and no framework behaviour silently
//     starts depending on a header.
//   - It never gates authorization. `/api/*` still requires a verified Firebase
//     ID token.
//   - The `DEV_ALLOW_NO_AUTH` loopback exemption keeps using the RAW socket
//     address, and is additionally refused whenever an X-Forwarded-For header is
//     present at all — see `devAuthEligible`. A Funnel-proxied request must never
//     be mistaken for a caller sitting at the console.
//
// Worst case if the header were ever forgeable (a future ingress that appends
// instead of replacing): an attacker splits themselves across many buckets. That
// is exactly what the separate global backstop bucket in server.js is for.
import net from 'node:net';

/** Socket addresses that mean "the peer is this machine's loopback interface". */
export const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Placeholder key for a request with no readable peer address. */
export const UNKNOWN_IP = 'unknown';

export function isLoopbackAddr(addr) {
  return LOOPBACK_ADDRS.has(String(addr ?? ''));
}

/** The raw TCP peer address, or '' when the socket is already gone. */
export function socketAddr(req) {
  return req?.socket?.remoteAddress || '';
}

/**
 * The X-Forwarded-For header value, or `undefined` when the header is absent.
 *
 * Presence is distinguished from emptiness on purpose: an empty-but-present
 * header still proves the request came through a proxy, which is what the
 * dev-auth check cares about.
 */
export function forwardedFor(req) {
  const raw = req?.headers?.['x-forwarded-for'];
  if (raw === undefined || raw === null) return undefined;
  // Node folds duplicate headers into one comma-joined string, but be explicit.
  return Array.isArray(raw) ? raw.join(',') : String(raw);
}

export function hasForwardedFor(req) {
  return forwardedFor(req) !== undefined;
}

/**
 * How many comma-separated hops the X-Forwarded-For header carries (0 if absent).
 *
 * Under the assumption this module rests on — Funnel is the only ingress and
 * *replaces* the header — a proxied request always has exactly ONE hop. More than
 * one means either a second proxy appeared in the path or the ingress started
 * appending to a client-supplied value. The last-hop rule above stays correct in
 * both cases; server.js logs multi-hop as an anomaly for visibility only.
 */
export function forwardedHopCount(req) {
  const fwd = forwardedFor(req);
  if (fwd === undefined) return 0;
  return fwd.split(',').length;
}

/**
 * The address to key rate limits and logs on.
 *
 * - peer is NOT loopback        -> the socket address; X-Forwarded-For ignored
 * - peer is loopback, no XFF    -> the socket address (a real local caller)
 * - peer is loopback, valid XFF -> the LAST XFF hop. The trusted proxy (Funnel)
 *                                 appends or replaces; either way the value it
 *                                 wrote is the last one, so this is correct under
 *                                 both behaviours and never attacker-chosen.
 * - peer is loopback, junk XFF  -> the socket address (fail closed to the shared
 *                                 bucket rather than trusting a garbage key)
 *
 * @returns {string} an IP literal, or 'unknown' when there is no peer address
 */
export function clientIp(req) {
  const addr = socketAddr(req);
  if (!isLoopbackAddr(addr)) return addr || UNKNOWN_IP;

  const fwd = forwardedFor(req);
  if (fwd === undefined) return addr || UNKNOWN_IP;

  const hops = fwd.split(',');
  const last = hops[hops.length - 1].trim();
  // Must be a bare IPv4/IPv6 literal. Anything else (a hostname, `_hidden`,
  // `unknown`, an addr:port pair, an empty value) falls back to the socket
  // address so a malformed header cannot mint arbitrary bucket keys.
  if (net.isIP(last)) return last;
  return addr || UNKNOWN_IP;
}

/**
 * May this request use the `DEV_ALLOW_NO_AUTH` no-token exemption?
 *
 * Raw socket address only — `clientIp()` is NOT used here, because a derived
 * client IP that happens to read `127.0.0.1` must never unlock dev mode. And an
 * X-Forwarded-For header of any kind disqualifies the request outright: it means
 * a proxy (i.e. Funnel, i.e. the public internet) is in the path, so this is not
 * somebody at the keyboard.
 */
export function devAuthEligible(req) {
  return isLoopbackAddr(socketAddr(req)) && !hasForwardedFor(req);
}
