// Unit tests — no server, no network, no Ollama. Run with:
//   npm test            (node --test test/unit.mjs)
//
// Scope: the client-IP derivation that keys the rate limiter behind Tailscale
// Funnel, the DEV_ALLOW_NO_AUTH eligibility rule that must NOT follow it, and the
// request-validation / model-output clamping in lib/normalize.js.
// These are the pieces where a mistake is silent — a wrong bucket key just looks
// like a working server until someone floods it, and an unclamped model field
// just looks like a working answer until it reaches a user's screen — so they are
// pinned here.
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
import {
  looksCarnivorous,
  normalizeDiagnose,
  validateDiagnoseBody,
  validateProfileBody,
} from '../lib/normalize.js';
import { diagnoseUserPrompt, profileUserPrompt } from '../lib/prompts.js';

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

// ===========================================================================
// Request validation and model-output clamping (lib/normalize.js).
//
// Same reasoning as above: a mistake here is silent. A pot enum that quietly
// falls through changes every watering interval the model produces, and an
// unclamped diagnose field reaches the user's screen verbatim.
// ===========================================================================

// ------------------------------------------------------- profile: pot fields

/** A minimal valid /api/profile body. */
const profileBody = (extra = {}) => ({
  name: 'Monstera Deliciosa',
  light_type: 'natural',
  soil_type: 'chunky_aroid',
  ...extra,
});

test('profile: the three pot fields are optional and default to unknown', () => {
  const r = validateProfileBody(profileBody());
  assert.equal(r.ok, true);
  assert.equal(r.value.pot_size, '');
  assert.equal(r.value.pot_material, '');
  assert.equal(r.value.pot_drainage, null);
});

test('profile: valid pot enums pass through unchanged', () => {
  for (const size of ['small', 'medium', 'large']) {
    const r = validateProfileBody(profileBody({ pot_size: size }));
    assert.equal(r.ok, true, size);
    assert.equal(r.value.pot_size, size);
  }
  for (const mat of ['terracotta', 'plastic', 'glazed', 'other']) {
    const r = validateProfileBody(profileBody({ pot_material: mat }));
    assert.equal(r.ok, true, mat);
    assert.equal(r.value.pot_material, mat);
  }
});

test('profile: pot_size is an enum now, not the old free-text field', () => {
  // "4 inch" used to be accepted. It must be a 400 rather than being handed to
  // the model as a pot description it half-understands.
  for (const bad of ['4 inch', 'Small', 'SMALL', 'tiny', 'x-large', 10, true, {}]) {
    const r = validateProfileBody(profileBody({ pot_size: bad }));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.detail, /pot_size must be one of/);
  }
});

test('profile: pot_material rejects anything outside the enum', () => {
  for (const bad of ['ceramic', 'Terracotta', 'clay', 5, []]) {
    const r = validateProfileBody(profileBody({ pot_material: bad }));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.detail, /pot_material must be one of/);
  }
});

test('profile: pot_drainage must be a real boolean', () => {
  for (const bad of ['true', 'false', 'yes', 1, 0, '']) {
    const r = validateProfileBody(profileBody({ pot_drainage: bad }));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.detail, /pot_drainage must be true or false/);
  }
});

test('profile: pot_drainage false survives as false, not as "unknown"', () => {
  // The whole point of the field: no drainage hole is the dangerous case, and
  // treating it as absent would silently drop the warning.
  const r = validateProfileBody(profileBody({ pot_drainage: false }));
  assert.equal(r.ok, true);
  assert.equal(r.value.pot_drainage, false);

  const absent = validateProfileBody(profileBody({ pot_drainage: null }));
  assert.equal(absent.ok, true);
  assert.equal(absent.value.pot_drainage, null);
});

test('profile: the pot fields reach the prompt, and shape the baseline rules', () => {
  const prompt = profileUserPrompt(
    validateProfileBody(
      profileBody({ pot_size: 'small', pot_material: 'terracotta', pot_drainage: false })
    ).value
  );
  assert.match(prompt, /terracotta/i);
  assert.match(prompt, /NO drainage hole/);
  assert.match(prompt, /THIS PLANT IN ITS POT/);

  // With nothing given, the model is told what to assume rather than guessing.
  const bare = profileUserPrompt(validateProfileBody(profileBody()).value);
  assert.match(bare, /Pot: not specified — assume a medium plastic pot with a drainage hole/);
});

// ------------------------------------------------------ diagnose: request body

/** A minimal valid /api/diagnose body (the image is validated separately). */
const diagnoseBody = (extra = {}) => ({
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

test('diagnose: a well-formed body validates and is normalised', () => {
  const r = validateDiagnoseBody(diagnoseBody({ scientific_name: '  Monstera deliciosa  ', notes: ' by the window ' }));
  assert.equal(r.ok, true);
  assert.equal(r.value.scientific_name, 'Monstera deliciosa', 'trimmed');
  assert.equal(r.value.notes, 'by the window', 'trimmed');
  assert.deepEqual(r.value.recent_events, [{ type: 'water', days_ago: 9 }]);
});

test('diagnose: name is required and capped at 80 chars', () => {
  assert.equal(validateDiagnoseBody(diagnoseBody({ name: '' })).ok, false);
  assert.equal(validateDiagnoseBody(diagnoseBody({ name: '   ' })).ok, false);
  assert.equal(validateDiagnoseBody(diagnoseBody({ name: undefined })).ok, false);
  assert.equal(validateDiagnoseBody(diagnoseBody({ name: 'x'.repeat(80) })).ok, true);
  assert.equal(validateDiagnoseBody(diagnoseBody({ name: 'x'.repeat(81) })).ok, false);
});

test('diagnose: every enum field is checked', () => {
  const cases = [
    ['light_type', 'sunlight'],
    ['soil_type', 'dirt'],
    ['moisture_pref', 'damp'],
    ['season', 'autumn'], // the app's enum is "fall"
  ];
  for (const [key, bad] of cases) {
    const r = validateDiagnoseBody(diagnoseBody({ [key]: bad }));
    assert.equal(r.ok, false, key);
    assert.match(r.detail, new RegExp(`^${key} must be one of`));
  }
  assert.equal(validateDiagnoseBody(diagnoseBody({ season: 'fall' })).ok, true);
});

test('diagnose: days_since_watered accepts null (never watered) but not junk', () => {
  assert.equal(validateDiagnoseBody(diagnoseBody({ days_since_watered: null })).value.days_since_watered, null);
  assert.equal(validateDiagnoseBody(diagnoseBody({ days_since_watered: undefined })).value.days_since_watered, null);
  assert.equal(validateDiagnoseBody(diagnoseBody({ days_since_watered: 0 })).value.days_since_watered, 0);
  for (const bad of ['9', -1, NaN, Infinity, 4000, {}]) {
    assert.equal(validateDiagnoseBody(diagnoseBody({ days_since_watered: bad })).ok, false, JSON.stringify(bad));
  }
});

test('diagnose: current_interval and watering_count are required numbers', () => {
  for (const key of ['current_interval', 'watering_count']) {
    assert.equal(validateDiagnoseBody(diagnoseBody({ [key]: undefined })).ok, false, `${key} missing`);
    assert.equal(validateDiagnoseBody(diagnoseBody({ [key]: null })).ok, false, `${key} null`);
    assert.equal(validateDiagnoseBody(diagnoseBody({ [key]: '7' })).ok, false, `${key} string`);
  }
  // watering_count may legitimately be zero; an interval may not.
  assert.equal(validateDiagnoseBody(diagnoseBody({ watering_count: 0 })).ok, true);
  assert.equal(validateDiagnoseBody(diagnoseBody({ current_interval: 0 })).ok, false);
});

test('diagnose: recent_events defaults to empty and is bounded at 10', () => {
  assert.deepEqual(validateDiagnoseBody(diagnoseBody({ recent_events: undefined })).value.recent_events, []);
  assert.deepEqual(validateDiagnoseBody(diagnoseBody({ recent_events: [] })).value.recent_events, []);

  const ten = Array.from({ length: 10 }, (_, i) => ({ type: 'water', days_ago: i }));
  assert.equal(validateDiagnoseBody(diagnoseBody({ recent_events: ten })).ok, true);
  const eleven = [...ten, { type: 'water', days_ago: 11 }];
  const over = validateDiagnoseBody(diagnoseBody({ recent_events: eleven }));
  assert.equal(over.ok, false);
  assert.match(over.detail, /10 or fewer/);

  assert.equal(validateDiagnoseBody(diagnoseBody({ recent_events: 'water' })).ok, false, 'not an array');
});

test('diagnose: every event entry is checked, and the index is reported', () => {
  for (const t of ['water', 'skip', 'still_wet', 'too_busy']) {
    assert.equal(validateDiagnoseBody(diagnoseBody({ recent_events: [{ type: t, days_ago: 1 }] })).ok, true, t);
  }
  const badType = validateDiagnoseBody(
    diagnoseBody({ recent_events: [{ type: 'water', days_ago: 1 }, { type: 'fertilize', days_ago: 3 }] })
  );
  assert.equal(badType.ok, false);
  assert.match(badType.detail, /recent_events\[1\]\.type must be one of/);

  const badAgo = validateDiagnoseBody(diagnoseBody({ recent_events: [{ type: 'water', days_ago: '3' }] }));
  assert.equal(badAgo.ok, false);
  assert.match(badAgo.detail, /recent_events\[0\]\.days_ago must be a number/);

  assert.equal(validateDiagnoseBody(diagnoseBody({ recent_events: ['water'] })).ok, false, 'string entry');
  assert.equal(validateDiagnoseBody(diagnoseBody({ recent_events: [null] })).ok, false, 'null entry');
});

test('diagnose: optional strings are length-capped', () => {
  assert.equal(validateDiagnoseBody(diagnoseBody({ notes: 'x'.repeat(300) })).ok, true);
  assert.equal(validateDiagnoseBody(diagnoseBody({ notes: 'x'.repeat(301) })).ok, false);
  assert.equal(validateDiagnoseBody(diagnoseBody({ scientific_name: 'x'.repeat(120) })).ok, true);
  assert.equal(validateDiagnoseBody(diagnoseBody({ scientific_name: 'x'.repeat(121) })).ok, false);
  assert.equal(validateDiagnoseBody(diagnoseBody({ notes: 42 })).ok, false);
});

test('diagnose: a non-object body is refused', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    assert.equal(validateDiagnoseBody(bad).ok, false, JSON.stringify(bad));
  }
});

test('diagnose: the request facts reach the prompt, events explained', () => {
  const p = validateDiagnoseBody(
    diagnoseBody({ recent_events: [{ type: 'still_wet', days_ago: 2 }, { type: 'too_busy', days_ago: 9 }] })
  ).value;
  const prompt = diagnoseUserPrompt(p);
  assert.match(prompt, /still wet/);
  assert.match(prompt, /too busy/);
  assert.match(prompt, /evidence about the OWNER, not the plant/);
  assert.match(prompt, /every 7 days/);

  const never = diagnoseUserPrompt(validateDiagnoseBody(diagnoseBody({ days_since_watered: null })).value);
  assert.match(never, /never recorded in the app/);
});

// ------------------------------------------- diagnose: pot + carnivore context

test('diagnose: the pot fields are optional and default to unknown', () => {
  const r = validateDiagnoseBody(diagnoseBody());
  assert.equal(r.ok, true);
  assert.equal(r.value.pot_size, '');
  assert.equal(r.value.pot_material, '');
  assert.equal(r.value.pot_drainage, null);
  assert.equal(r.value.carnivore, null);
});

test('diagnose: the pot enums are the same three fields as /api/profile', () => {
  for (const size of ['small', 'medium', 'large']) {
    const r = validateDiagnoseBody(diagnoseBody({ pot_size: size }));
    assert.equal(r.ok, true, size);
    assert.equal(r.value.pot_size, size);
  }
  for (const mat of ['terracotta', 'plastic', 'glazed', 'other']) {
    const r = validateDiagnoseBody(diagnoseBody({ pot_material: mat }));
    assert.equal(r.ok, true, mat);
    assert.equal(r.value.pot_material, mat);
  }
  const both = validateDiagnoseBody(
    diagnoseBody({ pot_size: 'large', pot_material: 'glazed', pot_drainage: false })
  );
  assert.equal(both.ok, true);
  assert.deepEqual(
    { s: both.value.pot_size, m: both.value.pot_material, d: both.value.pot_drainage },
    { s: 'large', m: 'glazed', d: false }
  );
});

test('diagnose: free text and near-miss pot spellings are a 400, not a guess', () => {
  for (const bad of ['4 inch', 'Small', 'tiny', 10, true, {}]) {
    const r = validateDiagnoseBody(diagnoseBody({ pot_size: bad }));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.detail, /pot_size must be one of/);
  }
  for (const bad of ['ceramic', 'Terracotta', 'clay', 5, []]) {
    const r = validateDiagnoseBody(diagnoseBody({ pot_material: bad }));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.detail, /pot_material must be one of/);
  }
  for (const bad of ['true', 'false', 'yes', 1, 0, '']) {
    const r = validateDiagnoseBody(diagnoseBody({ pot_drainage: bad }));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.detail, /pot_drainage must be true or false/);
  }
});

test('diagnose: pot_drainage false survives as false, not as "unknown"', () => {
  // The dangerous case. Collapsing it into "absent" would silently drop the
  // root-rot reasoning the prompt is built around.
  assert.equal(validateDiagnoseBody(diagnoseBody({ pot_drainage: false })).value.pot_drainage, false);
  assert.equal(validateDiagnoseBody(diagnoseBody({ pot_drainage: null })).value.pot_drainage, null);
});

test('diagnose: carnivore must be a real boolean and survives as given', () => {
  assert.equal(validateDiagnoseBody(diagnoseBody({ carnivore: true })).value.carnivore, true);
  assert.equal(validateDiagnoseBody(diagnoseBody({ carnivore: false })).value.carnivore, false);
  assert.equal(validateDiagnoseBody(diagnoseBody({ carnivore: null })).value.carnivore, null);
  for (const bad of ['true', 'yes', 1, 0, '', {}]) {
    const r = validateDiagnoseBody(diagnoseBody({ carnivore: bad }));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.detail, /carnivore must be true or false/);
  }
});

test('diagnose: the pot reaches the prompt as drying context', () => {
  const prompt = diagnoseUserPrompt(
    validateDiagnoseBody(
      diagnoseBody({ pot_size: 'small', pot_material: 'terracotta', pot_drainage: true })
    ).value
  );
  assert.match(prompt, /terracotta/i);
  assert.match(prompt, /little reservoir/);
  assert.match(prompt, /HAS a drainage hole/);
  // The pot must be tied to the over/under-watering judgement, not merely listed.
  assert.match(prompt, /How to read the pot/);
  assert.match(prompt, /dries FASTER/);
  assert.match(prompt, /how fast THIS pot dries/);

  const noHole = diagnoseUserPrompt(
    validateDiagnoseBody(diagnoseBody({ pot_drainage: false })).value
  );
  assert.match(noHole, /NO drainage hole/);
  assert.match(noHole, /root rot/i);
});

test('diagnose: an unspecified pot sends the model to the photo, not to an assumption', () => {
  // Unlike /api/profile, diagnose has the picture — assuming a plastic pot while a
  // terracotta one is visible would be strictly worse than looking.
  const bare = diagnoseUserPrompt(validateDiagnoseBody(diagnoseBody()).value);
  assert.match(bare, /Pot: not specified — read the pot from the photo/);
  assert.doesNotMatch(bare, /Pot: not specified — assume/);

  // Half-known: the given part is stated, the missing part still goes to the photo.
  const half = diagnoseUserPrompt(
    validateDiagnoseBody(diagnoseBody({ pot_material: 'terracotta' })).value
  );
  assert.match(half, /Pot size and drainage not specified — read it from the photo if visible/);

  // The profile prompt keeps its own wording: it has no photo to fall back on.
  const profile = profileUserPrompt(validateProfileBody(profileBody()).value);
  assert.match(profile, /Pot: not specified — assume a medium plastic pot with a drainage hole/);
});

test('diagnose: a carnivore is stated as a fact in the prompt, by flag or by medium', () => {
  const byFlag = diagnoseUserPrompt(validateDiagnoseBody(diagnoseBody({ carnivore: true })).value);
  assert.match(byFlag, /carnivorous bog plant/);
  assert.match(byFlag, /never be given tap water/);

  const byMedium = diagnoseUserPrompt(
    validateDiagnoseBody(diagnoseBody({ soil_type: 'carnivore_peat' })).value
  );
  assert.match(byMedium, /carnivorous bog plant/);

  // An ordinary plant must not be told it is a bog plant.
  const ordinary = diagnoseUserPrompt(validateDiagnoseBody(diagnoseBody()).value);
  assert.doesNotMatch(ordinary, /carnivorous bog plant/);
  const explicitlyNot = diagnoseUserPrompt(
    validateDiagnoseBody(diagnoseBody({ carnivore: false })).value
  );
  assert.doesNotMatch(explicitlyNot, /carnivorous bog plant/);
});

test('carnivore ctx: any one of the three signals is enough', () => {
  // The exact expression /api/diagnose builds its advice-filter ctx from. Pinned
  // here because a false negative reaches a bog plant owner as "try fertilizer".
  const ctx = (p) => ({
    carnivore:
      p.carnivore === true ||
      p.soil_type === 'carnivore_peat' ||
      looksCarnivorous(p.name, p.scientific_name),
  });

  const flag = validateDiagnoseBody(diagnoseBody({ carnivore: true })).value;
  assert.equal(ctx(flag).carnivore, true, 'the stored owner flag');

  const medium = validateDiagnoseBody(diagnoseBody({ soil_type: 'carnivore_peat' })).value;
  assert.equal(ctx(medium).carnivore, true, 'carnivorous potting medium');

  const byName = validateDiagnoseBody(diagnoseBody({ name: 'Cape Sundew' })).value;
  assert.equal(ctx(byName).carnivore, true, 'common name');

  const bySci = validateDiagnoseBody(
    diagnoseBody({ name: 'Mystery Plant', scientific_name: 'Nepenthes ventricosa' })
  ).value;
  assert.equal(ctx(bySci).carnivore, true, 'scientific name');

  // carnivore: false does NOT override the other two — a plainly carnivorous plant
  // stays filtered whatever the stored flag says.
  const contradicted = validateDiagnoseBody(
    diagnoseBody({ name: 'Venus Fly Trap', carnivore: false })
  ).value;
  assert.equal(ctx(contradicted).carnivore, true, 'a false flag cannot unset a Dionaea');

  const ordinary = validateDiagnoseBody(diagnoseBody()).value;
  assert.equal(ctx(ordinary).carnivore, false);
});

// --------------------------------------------------- diagnose: output clamping

/** A complete, well-formed model answer. */
const modelOut = (extra = {}) => ({
  summary: 'The leaves look healthy and the watering record lines up.',
  watering_verdict: 'watering_ok',
  observations: ['Deep green leaves', 'Dry soil surface'],
  likely_causes: [],
  actions: ['Keep the current schedule'],
  confidence: 0.8,
  not_a_plant: false,
  ...extra,
});

test('normalizeDiagnose: a clean answer passes through with the documented shape', () => {
  const r = normalizeDiagnose(modelOut());
  assert.deepEqual(Object.keys(r), [
    'summary',
    'watering_verdict',
    'observations',
    'likely_causes',
    'actions',
    'confidence',
    'not_a_plant',
  ]);
  assert.equal(r.watering_verdict, 'watering_ok');
  assert.equal(r.confidence, 0.8);
  assert.equal(r.not_a_plant, false);
});

test('normalizeDiagnose: unusable output returns null so the caller can retry', () => {
  assert.equal(normalizeDiagnose(null), null);
  assert.equal(normalizeDiagnose('nope'), null);
  assert.equal(normalizeDiagnose({}), null);
  assert.equal(normalizeDiagnose(modelOut({ summary: '' })), null, 'no summary');
  assert.equal(normalizeDiagnose(modelOut({ summary: '   ' })), null, 'blank summary');
  assert.equal(normalizeDiagnose(modelOut({ watering_verdict: 'needs_water' })), null, 'unknown verdict');
  assert.equal(normalizeDiagnose(modelOut({ watering_verdict: undefined })), null, 'missing verdict');
});

test('normalizeDiagnose: verdict near-misses are absorbed, spelling is exact after', () => {
  const cases = {
    overwatered: 'likely_overwatered',
    'Over Watered': 'likely_overwatered',
    LIKELY_OVERWATERED: 'likely_overwatered',
    underwatered: 'likely_underwatered',
    'too little water': 'likely_underwatered',
    ok: 'watering_ok',
    healthy: 'watering_ok',
    unknown: 'unclear',
    inconclusive: 'unclear',
  };
  for (const [given, want] of Object.entries(cases)) {
    assert.equal(normalizeDiagnose(modelOut({ watering_verdict: given })).watering_verdict, want, given);
  }
});

test('normalizeDiagnose: summary is trimmed to 200 chars on a word boundary', () => {
  const long = ('The plant shows widespread yellowing across the lower leaves ' +
    'and the potting medium has stayed saturated for several days now, which ').repeat(3);
  const r = normalizeDiagnose(modelOut({ summary: long }));
  assert.ok(r.summary.length <= 200, `len=${r.summary.length}`);
  assert.doesNotMatch(r.summary, /\s$/, 'no trailing whitespace');
  // Word boundary: the cut must not land mid-word.
  assert.ok(long.replace(/\s+/g, ' ').startsWith(r.summary.replace(/\.$/, '')), 'prefix of the original');
});

test('normalizeDiagnose: observations are capped at 4, deduped, and cleaned', () => {
  const r = normalizeDiagnose(
    modelOut({
      observations: [
        'Yellow lower leaves',
        'yellow lower leaves!', // same thing, different case/punctuation
        '',
        null,
        { text: 'Soggy soil surface' },
        'Brown crispy tips',
        'Drooping stems',
        'Webbing between leaves',
      ],
    })
  );
  assert.equal(r.observations.length, 4);
  assert.deepEqual(r.observations.slice(0, 3), [
    'Yellow lower leaves',
    'Soggy soil surface',
    'Brown crispy tips',
  ]);
});

test('normalizeDiagnose: a bare string where an array belongs is tolerated', () => {
  const r = normalizeDiagnose(modelOut({ observations: 'Yellowing leaves', actions: 'Water less often' }));
  assert.deepEqual(r.observations, ['Yellowing leaves']);
  assert.deepEqual(r.actions, ['Water less often']);
});

test('normalizeDiagnose: actions are capped at 3 and deduped', () => {
  const r = normalizeDiagnose(
    modelOut({
      actions: ['Let it dry out', 'let it dry out.', 'Check the drainage hole', 'Move it closer to the window', 'Wipe the leaves'],
    })
  );
  assert.equal(r.actions.length, 3);
  assert.deepEqual(r.actions, ['Let it dry out', 'Check the drainage hole', 'Move it closer to the window']);
});

test('normalizeDiagnose: likely_causes are capped, ordered best-first and deduped', () => {
  const r = normalizeDiagnose(
    modelOut({
      likely_causes: [
        { cause: 'Underwatering', confidence: 0.2 },
        { cause: 'Overwatering / soggy roots', confidence: 85 }, // a percentage
        { cause: 'overwatering / soggy roots', confidence: 0.1 }, // duplicate
        { cause: 'Low humidity', confidence: 0.5 },
        { cause: 'Spider mites', confidence: 0.4 },
      ],
    })
  );
  assert.equal(r.likely_causes.length, 3);
  assert.deepEqual(
    r.likely_causes.map((c) => c.confidence),
    [0.85, 0.5, 0.4],
    'descending'
  );
  assert.equal(r.likely_causes[0].cause, 'Overwatering / soggy roots');
});

test('normalizeDiagnose: cause text is clamped to 80 chars and confidence to 0..1', () => {
  const r = normalizeDiagnose(
    modelOut({
      likely_causes: [
        { cause: 'x'.repeat(200), confidence: 4 },
        { cause: 'Root rot', confidence: -3 },
        { cause: 'Cold draught', confidence: 'not a number' },
      ],
    })
  );
  for (const c of r.likely_causes) {
    assert.ok(c.cause.length <= 80, `cause len=${c.cause.length}`);
    assert.ok(c.confidence >= 0 && c.confidence <= 1, `confidence=${c.confidence}`);
  }
  assert.equal(r.likely_causes.find((c) => c.cause === 'Root rot').confidence, 0);
  assert.equal(r.likely_causes.find((c) => c.cause === 'Cold draught').confidence, 0.5, 'fallback');
});

test('normalizeDiagnose: a plain string list of causes still yields objects', () => {
  const r = normalizeDiagnose(modelOut({ likely_causes: ['Overwatering', 'Low light'] }));
  assert.deepEqual(r.likely_causes, [
    { cause: 'Overwatering', confidence: 0.5 },
    { cause: 'Low light', confidence: 0.5 },
  ]);
});

test('normalizeDiagnose: top-level confidence is clamped, defaulted and de-percented', () => {
  assert.equal(normalizeDiagnose(modelOut({ confidence: 90 })).confidence, 0.9);
  // Just over 1 is a near-miss on the scale, not a percentage — it clamps to 1
  // rather than becoming 0.017.
  assert.equal(normalizeDiagnose(modelOut({ confidence: 1.7 })).confidence, 1);
  assert.equal(normalizeDiagnose(modelOut({ confidence: -5 })).confidence, 0);
  assert.equal(normalizeDiagnose(modelOut({ confidence: undefined })).confidence, 0.5);
  assert.equal(normalizeDiagnose(modelOut({ confidence: 'high' })).confidence, 0.5);
});

test('normalizeDiagnose: not_a_plant forces unclear and empties every list', () => {
  const r = normalizeDiagnose(
    modelOut({
      not_a_plant: true,
      watering_verdict: 'likely_overwatered',
      observations: ['A golden retriever'],
      likely_causes: [{ cause: 'Not a plant', confidence: 0.9 }],
      actions: ['Take another photo'],
      summary: 'This is a photo of a dog, not a plant.',
    })
  );
  assert.equal(r.not_a_plant, true);
  assert.equal(r.watering_verdict, 'unclear');
  assert.deepEqual(r.observations, []);
  assert.deepEqual(r.likely_causes, []);
  assert.deepEqual(r.actions, []);
  assert.equal(r.summary, 'This is a photo of a dog, not a plant.');
});

test('normalizeDiagnose: not_a_plant with no summary still answers instead of 502ing', () => {
  const r = normalizeDiagnose({ not_a_plant: true });
  assert.equal(r.not_a_plant, true);
  assert.equal(r.watering_verdict, 'unclear');
  assert.match(r.summary, /does not appear to show a plant/);
});

test('normalizeDiagnose: carnivore advice never mentions fertilizer or tap water', () => {
  const r = normalizeDiagnose(
    modelOut({
      watering_verdict: 'likely_underwatered',
      actions: ['Feed it a balanced fertilizer monthly', 'Top up with tap water', 'Keep the tray filled'],
      likely_causes: [
        { cause: 'Nutrient deficiency from never fertilizing', confidence: 0.7 },
        { cause: 'Tray ran dry', confidence: 0.6 },
      ],
    }),
    { carnivore: true }
  );
  assert.deepEqual(r.actions, ['Keep the tray filled']);
  assert.deepEqual(r.likely_causes.map((c) => c.cause), ['Tray ran dry']);

  // Without the flag the same advice is left alone — it is only wrong for bog plants.
  const other = normalizeDiagnose(modelOut({ actions: ['Feed it a balanced fertilizer monthly'] }));
  assert.equal(other.actions.length, 1);
});

test('normalizeDiagnose: warnings AGAINST fertilizer/tap water survive the carnivore filter', () => {
  const r = normalizeDiagnose(
    modelOut({
      actions: ['Never use tap water on this plant', 'Avoid fertilizer entirely', 'Use rainwater'],
    }),
    { carnivore: true }
  );
  assert.equal(r.actions.length, 3, r.actions.join(' | '));
});

test('looksCarnivorous matches the genera and common names, not ordinary plants', () => {
  assert.equal(looksCarnivorous('Cape Sundew', 'Drosera capensis'), true);
  assert.equal(looksCarnivorous('Venus Flytrap'), true);
  assert.equal(looksCarnivorous('My Pitcher Plant'), true);
  assert.equal(looksCarnivorous('', 'Nepenthes ventricosa'), true);
  assert.equal(looksCarnivorous('Monstera Deliciosa', 'Monstera deliciosa'), false);
  assert.equal(looksCarnivorous('Snake Plant'), false);
  assert.equal(looksCarnivorous(undefined, undefined), false);
});
