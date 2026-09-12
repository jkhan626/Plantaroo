// Unit tests — no server, no network, no Ollama. Run with:
//   npm test            (node --test test/unit.mjs)
//
// Scope: the client-IP derivation that keys the rate limiter behind Tailscale
// Funnel, and the DEV_ALLOW_NO_AUTH eligibility rule that must NOT follow it.
// These are the pieces where a mistake is silent — a wrong bucket key just looks
// like a working server until someone floods it — so they are pinned here.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clientIp,
  devAuthEligible,
  forwardedFor,
  forwardedHopCount,
  hasForwardedFor,
  isLoopbackAddr,
  UNKNOWN_IP,
} from '../lib/clientip.js';
import { IpBucket } from '../lib/limits.js';

/** Minimal Express-ish request stand-in. */
function req({ remoteAddress = '127.0.0.1', headers = {} } = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { socket: remoteAddress === null ? undefined : { remoteAddress }, headers: lower };
}

const xff = (value, remoteAddress = '127.0.0.1') =>
  req({ remoteAddress, headers: { 'X-Forwarded-For': value } });

// ------------------------------------------------------- loopback recognition

test('isLoopbackAddr recognises every form Node reports', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(isLoopbackAddr(a), true, a);
  }
  for (const a of ['203.0.113.9', '192.168.1.5', '127.0.0.2', '', null, undefined]) {
    assert.equal(isLoopbackAddr(a), false, String(a));
  }
});

// ----------------------------------------------------- the derivation itself

test('loopback + X-Forwarded-For uses the forwarded IP', () => {
  assert.equal(clientIp(xff('203.0.113.9')), '203.0.113.9');
  assert.equal(clientIp(xff('  203.0.113.9  ')), '203.0.113.9', 'whitespace trimmed');
  assert.equal(clientIp(xff('2001:db8::1')), '2001:db8::1', 'IPv6 literal');
});

test('loopback + X-Forwarded-For works for every loopback spelling', () => {
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(clientIp(xff('203.0.113.9', peer)), '203.0.113.9', peer);
  }
});

test('loopback + multi-hop X-Forwarded-For takes the LAST value', () => {
  // The trusted proxy (Funnel) writes the last hop whether it replaces or appends,
  // so an attacker-supplied leading value can never become the bucket key.
  assert.equal(clientIp(xff('203.0.113.9, 198.51.100.7')), '198.51.100.7');
  assert.equal(clientIp(xff('203.0.113.9,198.51.100.7,192.0.2.1')), '192.0.2.1');
  assert.equal(clientIp(xff(['203.0.113.9', '198.51.100.7'])), '198.51.100.7', 'duplicate headers');
});

test('loopback + garbage X-Forwarded-For falls back to the socket address', () => {
  const junk = [
    'not-an-ip',
    'unknown',
    '_hidden',
    '', // present but empty
    '   ',
    '203.0.113.9, ', // empty last hop — do NOT fall back to an earlier one
    '203.0.113.9:443', // addr:port is not a bare IP literal
    '[2001:db8::1]', // bracketed form is not a bare IP literal
    '999.999.999.999',
    '0x7f000001',
    'localhost',
  ];
  for (const value of junk) {
    assert.equal(clientIp(xff(value)), '127.0.0.1', JSON.stringify(value));
  }
  // Trimming happens before validation, so stray whitespace is still accepted.
  assert.equal(clientIp(xff('203.0.113.9\n')), '203.0.113.9');
});

test('non-loopback peer ignores X-Forwarded-For entirely', () => {
  // A real remote peer can say anything it likes in the header; it is not ours.
  assert.equal(clientIp(xff('203.0.113.9', '198.51.100.7')), '198.51.100.7');
  assert.equal(clientIp(xff('127.0.0.1', '198.51.100.7')), '198.51.100.7');
  assert.equal(clientIp(xff('203.0.113.9', '192.168.1.50')), '192.168.1.50');
});

test('no X-Forwarded-For keeps the socket address', () => {
  assert.equal(clientIp(req({ remoteAddress: '127.0.0.1' })), '127.0.0.1');
  assert.equal(clientIp(req({ remoteAddress: '198.51.100.7' })), '198.51.100.7');
});

test('a missing socket degrades to a single "unknown" bucket', () => {
  assert.equal(clientIp(req({ remoteAddress: null })), UNKNOWN_IP);
  assert.equal(clientIp(req({ remoteAddress: '' })), UNKNOWN_IP);
  assert.equal(clientIp({}), UNKNOWN_IP);
});

test('header presence is distinguished from header emptiness', () => {
  assert.equal(forwardedFor(req()), undefined);
  assert.equal(forwardedFor(xff('')), '');
  assert.equal(hasForwardedFor(req()), false);
  assert.equal(hasForwardedFor(xff('')), true, 'empty but present still counts');
});

test('hop count flags a header that is not the single value Funnel should set', () => {
  assert.equal(forwardedHopCount(req()), 0, 'absent');
  assert.equal(forwardedHopCount(xff('203.0.113.9')), 1, 'the expected shape');
  assert.equal(forwardedHopCount(xff('')), 1, 'present but empty is still one value');
  assert.equal(forwardedHopCount(xff('203.0.113.9, 198.51.100.7')), 2);
  assert.equal(forwardedHopCount(xff(['203.0.113.9', '198.51.100.7'])), 2, 'duplicate headers');
});

// ------------------------------------------------ DEV_ALLOW_NO_AUTH exemption

test('dev exemption: allowed only for a raw loopback peer with no XFF', () => {
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(devAuthEligible(req({ remoteAddress: peer })), true, peer);
  }
});

test('dev exemption: DENIED whenever an X-Forwarded-For header is present', () => {
  // A Funnel-proxied request arrives as loopback. It must never be treated as a
  // dev caller, whatever the header says — including when it claims loopback, is
  // empty, or is garbage.
  for (const value of ['203.0.113.9', '127.0.0.1', '', 'not-an-ip', ', ']) {
    assert.equal(devAuthEligible(xff(value)), false, JSON.stringify(value));
  }
});

test('dev exemption: denied for a non-loopback peer', () => {
  assert.equal(devAuthEligible(req({ remoteAddress: '198.51.100.7' })), false);
  assert.equal(devAuthEligible(req({ remoteAddress: null })), false);
  assert.equal(devAuthEligible({}), false);
});

test('dev exemption never follows the derived client IP', () => {
  // The inverse of the bug: a forwarded "127.0.0.1" derives a loopback client IP,
  // and that must not unlock dev mode.
  const r = xff('127.0.0.1');
  assert.equal(clientIp(r), '127.0.0.1');
  assert.equal(devAuthEligible(r), false);
});

// --------------------------------------------------- buckets built on the key

test('two forwarded clients get independent per-client buckets', () => {
  const bucket = new IpBucket({ capacity: 3, windowMs: 60_000 });
  const key = (v) => clientIp(xff(v));

  for (let i = 0; i < 3; i++) assert.equal(bucket.take(key('203.0.113.9')).ok, true, `hit ${i}`);
  const fourth = bucket.take(key('203.0.113.9'));
  assert.equal(fourth.ok, false, 'first client is limited');
  assert.ok(fourth.retry_after_s >= 1);

  // A different forwarded IP is untouched — the whole point of the change.
  assert.equal(bucket.take(key('198.51.100.7')).ok, true);
});

test('global backstop bucket is shared across every client', () => {
  const global = new IpBucket({ capacity: 4, windowMs: 60_000, maxKeys: 1 });
  const KEY = 'all';
  for (let i = 0; i < 4; i++) assert.equal(global.take(KEY).ok, true, `hit ${i}`);
  assert.equal(global.take(KEY).ok, false, 'exhausted regardless of client identity');
  assert.equal(global.size, 1, 'never tracks more than the one key');
});
