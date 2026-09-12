// In-memory per-uid rolling-window rate limits, a per-IP token bucket, and a
// global concurrency gate.
// Deliberately process-local: this server is a single node on Jamal's PC, and a
// restart resetting the counters is acceptable.

const DAY_MS = 24 * 60 * 60 * 1000;

export class RateLimiter {
  /** @param {number} limit  requests allowed per rolling window */
  constructor(limit, windowMs = DAY_MS) {
    this.limit = limit;
    this.windowMs = windowMs;
    /** @type {Map<string, number[]>} uid -> ascending timestamps */
    this.hits = new Map();
  }

  /**
   * @returns {{ok: true} | {ok: false, retry_after_s: number}}
   */
  take(uid) {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    let arr = this.hits.get(uid);
    if (!arr) {
      arr = [];
      this.hits.set(uid, arr);
    }
    // Drop expired entries (array is ascending, so shift from the front).
    while (arr.length && arr[0] <= cutoff) arr.shift();

    if (arr.length >= this.limit) {
      const retryAfterMs = arr[0] + this.windowMs - now;
      return { ok: false, retry_after_s: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
    arr.push(now);
    return { ok: true };
  }

  /** Drop uids with no live hits so the map cannot grow without bound. */
  sweep() {
    const cutoff = Date.now() - this.windowMs;
    for (const [uid, arr] of this.hits) {
      while (arr.length && arr[0] <= cutoff) arr.shift();
      if (arr.length === 0) this.hits.delete(uid);
    }
  }
}

/**
 * Keyed token bucket, applied to EVERY route including /health, so an
 * unauthenticated flood is cut off before it reaches auth or the body parser.
 *
 * The bucket map is a bounded LRU: a Map iterates in insertion order, so the
 * oldest-touched key is always the first one, and touching a key re-inserts it
 * at the back. That caps memory at `maxKeys` entries no matter how many distinct
 * keys show up — which matters, because with Funnel unwrapped the key space is
 * the whole internet rather than a handful of local addresses.
 *
 * server.js uses two instances: one keyed on the derived client IP (see
 * lib/clientip.js — Tailscale Funnel proxies to localhost, so the key comes from
 * X-Forwarded-For, not the socket address), and one with `maxKeys: 1` and a fixed
 * key as a global backstop that does not depend on that header at all.
 */
export class IpBucket {
  /**
   * @param {object} [o]
   * @param {number} [o.capacity]  burst size / requests per window
   * @param {number} [o.windowMs]  time to refill a full bucket
   * @param {number} [o.maxKeys]   hard cap on tracked addresses
   */
  constructor({ capacity = 30, windowMs = 60_000, maxKeys = 5000 } = {}) {
    this.capacity = capacity;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.refillPerMs = capacity / windowMs;
    /** @type {Map<string, {tokens: number, at: number}>} */
    this.buckets = new Map();
  }

  /**
   * @param {string} key  remote address
   * @returns {{ok: true, remaining: number} | {ok: false, retry_after_s: number}}
   */
  take(key) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (b) {
      // Re-insert so this key becomes the most-recently-used (moves to the back).
      this.buckets.delete(key);
      b.tokens = Math.min(this.capacity, b.tokens + (now - b.at) * this.refillPerMs);
      b.at = now;
    } else {
      b = { tokens: this.capacity, at: now };
    }
    this.buckets.set(key, b);

    // Evict the least-recently-used keys once over the cap.
    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }

    if (b.tokens < 1) {
      const waitMs = (1 - b.tokens) / this.refillPerMs;
      return { ok: false, retry_after_s: Math.max(1, Math.ceil(waitMs / 1000)) };
    }
    b.tokens -= 1;
    return { ok: true, remaining: Math.floor(b.tokens) };
  }

  /** Drop buckets that have refilled completely — they carry no information. */
  sweep() {
    const now = Date.now();
    for (const [key, b] of this.buckets) {
      if (b.tokens + (now - b.at) * this.refillPerMs >= this.capacity) {
        this.buckets.delete(key);
      }
    }
  }

  get size() {
    return this.buckets.size;
  }
}

/**
 * Counting semaphore with a bounded wait AND a bounded queue.
 *
 * Two separate rejections, both surfaced as a fast 503 to the app:
 *  - 'queue_full' — more than `maxQueue` callers already waiting; rejected
 *    immediately so a flood cannot pile up requests (each of which would be
 *    holding its request state in memory for the whole wait).
 *  - 'timeout'    — got into the queue but no slot freed up within waitMs.
 *
 * Callers may also pass an AbortSignal so a client that hangs up stops waiting
 * and never gets handed a slot it cannot use.
 */
export class Semaphore {
  constructor(slots, maxQueue = 8) {
    this.slots = slots;
    this.maxQueue = maxQueue;
    this.active = 0;
    /** @type {{resolve:(v:any)=>void, timer:NodeJS.Timeout, onAbort:null|(()=>void), signal:AbortSignal|undefined}[]} */
    this.queue = [];
  }

  /**
   * @param {number} waitMs
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ok: true} | {ok: false, reason: 'queue_full'|'timeout'|'aborted'}>}
   */
  acquire(waitMs, signal) {
    if (signal?.aborted) return Promise.resolve({ ok: false, reason: 'aborted' });

    if (this.active < this.slots) {
      this.active++;
      return Promise.resolve({ ok: true });
    }

    if (this.queue.length >= this.maxQueue) {
      return Promise.resolve({ ok: false, reason: 'queue_full' });
    }

    return new Promise((resolve) => {
      const entry = { resolve: null, timer: null, onAbort: null, signal };

      const settle = (value) => {
        clearTimeout(entry.timer);
        if (entry.onAbort && signal) signal.removeEventListener('abort', entry.onAbort);
        resolve(value);
      };

      const drop = (reason) => {
        const i = this.queue.indexOf(entry);
        if (i >= 0) this.queue.splice(i, 1);
        settle({ ok: false, reason });
      };

      entry.timer = setTimeout(() => drop('timeout'), waitMs);
      // Called by release(): the slot is ours, active count already accounts for it.
      entry.resolve = () => settle({ ok: true });

      if (signal) {
        entry.onAbort = () => drop('aborted');
        signal.addEventListener('abort', entry.onAbort, { once: true });
      }

      this.queue.push(entry);
    });
  }

  release() {
    const next = this.queue.shift();
    if (next) {
      // Hand the slot straight over; active count is unchanged.
      next.resolve();
    } else {
      this.active = Math.max(0, this.active - 1);
    }
  }

  get waiting() {
    return this.queue.length;
  }
}
