// Server-side validation + coercion. The model is never trusted: everything that
// reaches the app is clamped into the Plantaroo data model's legal values.

export const MOISTURE = ['moist', 'light_dry', 'moderate_dry', 'full_dry'];
export const FERT = ['balanced', 'orchid_30_10_10', 'high_phosphorus', 'none'];
export const WATER_SOURCE = ['tap_ok', 'distilled_or_rain'];
export const LIGHT = ['grow', 'natural'];
export const SOIL = [
  'chunky_aroid',
  'orchid_bark',
  'sphagnum_moss',
  'regular_perlite',
  'cactus_gritty',
  'carnivore_peat',
];

// Near-miss spellings the model produces often enough to be worth absorbing.
const MOISTURE_ALIASES = {
  evenly_moist: 'moist',
  keep_moist: 'moist',
  wet: 'moist',
  slightly_dry: 'light_dry',
  lightly_dry: 'light_dry',
  top_inch_dry: 'light_dry',
  moderately_dry: 'moderate_dry',
  medium_dry: 'moderate_dry',
  half_dry: 'moderate_dry',
  dry: 'full_dry',
  fully_dry: 'full_dry',
  completely_dry: 'full_dry',
};
const FERT_ALIASES = {
  '30_10_10': 'orchid_30_10_10',
  orchid: 'orchid_30_10_10',
  orchid_fertilizer: 'orchid_30_10_10',
  high_p: 'high_phosphorus',
  phosphorus: 'high_phosphorus',
  bloom: 'high_phosphorus',
  none_needed: 'none',
  no_fertilizer: 'none',
  never: 'none',
  general: 'balanced',
  all_purpose: 'balanced',
  balanced_npk: 'balanced',
};
const WATER_ALIASES = {
  tap: 'tap_ok',
  tap_water: 'tap_ok',
  tap_water_ok: 'tap_ok',
  distilled: 'distilled_or_rain',
  rainwater: 'distilled_or_rain',
  rain: 'distilled_or_rain',
  distilled_or_rainwater: 'distilled_or_rain',
  filtered: 'distilled_or_rain',
};

function slug(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-/]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function coerceEnum(value, allowed, aliases) {
  const s = slug(value);
  if (allowed.includes(s)) return s;
  if (aliases && aliases[s] && allowed.includes(aliases[s])) return aliases[s];
  return null;
}

function coerceInt(value, min, max) {
  const n = typeof value === 'string' ? Number(value.replace(/[^0-9.\-]/g, '')) : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function coerceNullableInt(value, min, max) {
  if (value === null || value === undefined || value === '' || value === false) return null;
  const s = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (s === 'null' || s === 'none' || s === 'n/a' || s === 'never') return null;
  const n = coerceInt(value, min, max);
  if (n === null) return null;
  // A raw 0 means "don't do this"; coerceInt would have clamped it up to min.
  const rawZero = Number(String(value).replace(/[^0-9.\-]/g, '')) === 0;
  return rawZero ? null : n;
}

function coerceBool(value) {
  if (typeof value === 'boolean') return value;
  const s = slug(value);
  if (['true', 'yes', 'y', '1'].includes(s)) return true;
  if (['false', 'no', 'n', '0', ''].includes(s)) return false;
  return null;
}

const SMALL_WORDS = new Set(['of', 'the', 'and', 'in', 'on', 'a', 'an', 'var', 'subsp', 'x']);

// Names that are acronyms, not words — they stay upper-case whatever the model sent.
const ACRONYMS = new Set(['zz', 'zzz']);

/** Title Case as a houseplant owner writes it: "Bird of Paradise", "ZZ Plant". */
export function titleCase(input) {
  const words = String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  return words
    .map((w, i) => {
      if (!w) return w;
      if (ACRONYMS.has(w.toLowerCase())) return w.toUpperCase();
      // Preserve short all-caps tokens so they don't get sentence-cased.
      if (/^[A-Z0-9]{1,3}$/.test(w)) return w;
      const bare = w.replace(/[^A-Za-z]/g, '');
      if (i > 0 && SMALL_WORDS.has(bare.toLowerCase())) {
        return bare.toLowerCase() + w.slice(bare.length);
      }
      return w
        .split('-')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
        .join('-');
    })
    .join(' ');
}

/** Scientific names are "Genus species" — genus capitalized, epithet lowercase. */
function normalizeScientific(input) {
  const s = String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s
    .split(' ')
    .map((p, i) => {
      if (!p) return p;
      if (i === 0) return p[0].toUpperCase() + p.slice(1).toLowerCase();
      // Cultivar codes and hybrid numbers keep their shape; epithets lowercase.
      if (/\d/.test(p)) return p;
      return p.toLowerCase();
    })
    .join(' ');
}

function clampStr(v, max) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Trim to `max` chars without cutting a word in half — the result is user-visible.
 * Prefers the last sentence end, then the last word boundary.
 */
function clampSentence(v, max) {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;

  const head = s.slice(0, max);
  const lastStop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  // Only cut at a sentence end if that keeps most of the budget.
  if (lastStop >= max * 0.5) return head.slice(0, lastStop + 1).trim();

  const lastSpace = head.lastIndexOf(' ');
  const cut = (lastSpace > 0 ? head.slice(0, lastSpace) : head).replace(/[\s,;:.\-–—]+$/, '');
  return cut + '.';
}

/**
 * @returns {{candidates: object[], notes: string} | null} null = unusable output
 */
export function normalizeIdentify(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  let list = parsed.candidates;
  // Tolerate a single object, or a flat {common_name,...} response.
  if (!Array.isArray(list)) {
    if (list && typeof list === 'object') list = [list];
    else if (parsed.common_name) list = [parsed];
    else if (Array.isArray(parsed.plants)) list = parsed.plants;
    else list = [];
  }

  const candidates = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const common = titleCase(clampStr(c.common_name ?? c.commonName ?? c.name, 80));
    const sci = normalizeScientific(
      clampStr(c.scientific_name ?? c.scientificName ?? c.latin_name, 80)
    );
    if (!common && !sci) continue;
    let conf = Number(c.confidence ?? c.score);
    if (!Number.isFinite(conf)) conf = 0.5;
    if (conf > 1) conf = conf / 100; // model answered with a percentage
    conf = Math.min(1, Math.max(0, Number(conf.toFixed(3))));
    candidates.push({
      common_name: common || sci,
      scientific_name: sci,
      confidence: conf,
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const notes = clampStr(parsed.notes ?? parsed.note ?? parsed.reason ?? '', 400);

  // An empty candidate list is a legitimate answer ("not a plant"), but only if
  // the model also said something about it.
  if (candidates.length === 0 && !notes) return null;

  return { candidates: candidates.slice(0, 3), notes };
}

/**
 * @returns {object | null} null = unusable output, caller should retry once
 */
export function normalizeProfile(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : parsed;

  const baseline = coerceInt(p.species_baseline_days ?? p.baseline_days ?? p.watering_days, 1, 90);
  const moisture = coerceEnum(p.moisture_pref ?? p.moisture, MOISTURE, MOISTURE_ALIASES);
  const feedEvery = coerceInt(
    p.feed_every_n_waterings ?? p.feed_every_n ?? p.fertilize_every_n_waterings,
    0,
    30
  );
  const fert = coerceEnum(p.fert_type ?? p.fertilizer_type, FERT, FERT_ALIASES);
  const carnivore = coerceBool(p.carnivore ?? p.is_carnivore ?? false);
  const water = coerceEnum(p.water_source ?? p.water, WATER_SOURCE, WATER_ALIASES);
  const rationale = clampSentence(p.rationale ?? p.reason ?? p.explanation, 220);

  // Every required field must resolve; otherwise the caller retries once.
  if (
    baseline === null ||
    moisture === null ||
    feedEvery === null ||
    fert === null ||
    carnivore === null ||
    water === null ||
    !rationale
  ) {
    return null;
  }

  let tips = p.tips;
  if (typeof tips === 'string') tips = [tips];
  if (!Array.isArray(tips)) tips = [];
  tips = tips
    .map((t) => clampStr(typeof t === 'string' ? t : t?.text, 160))
    .filter(Boolean)
    .slice(0, 3);

  const out = {
    species_baseline_days: baseline,
    moisture_pref: moisture,
    feed_every_n_waterings: feedEvery,
    fert_type: fert,
    carnivore,
    water_source: water,
    // 1..90 matches the range the app itself clamps these to.
    mist_every_days: coerceNullableInt(p.mist_every_days, 1, 90),
    clean_every_days: coerceNullableInt(p.clean_every_days, 1, 90),
    rationale,
    tips,
  };

  // Consistency rules the app relies on, regardless of what the model said.
  //
  // Carnivore is the strictest: bog plants (Drosera, Sarracenia, Dionaea,
  // Nepenthes, Pinguicula, Utricularia) must never dry out and must never be fed
  // or given tap water. The model routinely answers "light_dry" or a 7-day
  // baseline while its own rationale says "keep constantly moist"; letting that
  // reach the app would kill the plant. So every one of these is forced, not
  // nudged — this mirrors the spec in the prompt and the README exactly.
  if (out.carnivore) {
    out.moisture_pref = 'moist';
    if (out.species_baseline_days > 3) out.species_baseline_days = 3;
    out.water_source = 'distilled_or_rain';
    out.fert_type = 'none';
    out.feed_every_n_waterings = 0;
  }
  if (out.fert_type === 'none') out.feed_every_n_waterings = 0;
  if (out.feed_every_n_waterings === 0) out.fert_type = 'none';

  // The overrides above can leave a tip contradicting the profile (the model
  // happily writes "feed every 4th watering" for a carnivore it just marked
  // fert_type: none). Drop tips the enforced fields have made false.
  if (out.feed_every_n_waterings === 0) {
    out.tips = out.tips.filter((t) => !/fertiliz|fertilis|\bfeed(ing|s)?\b|nutrient/i.test(t));
  }
  if (out.water_source === 'distilled_or_rain') {
    out.tips = out.tips.filter((t) => !/\btap water\b/i.test(t) || /avoid|not?\b|never/i.test(t));
  }
  if (out.mist_every_days === null) {
    // "Mist regularly" alongside mist_every_days: null reads as a bug to the user.
    out.tips = out.tips.filter((t) => !/\bmist(ing|s)?\b/i.test(t) || /avoid|do not|don't|never/i.test(t));
  }

  return out;
}

/**
 * Validate the /api/profile request body.
 * @returns {{ok: true, value: object} | {ok: false, detail: string}}
 */
export function validateProfileBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, detail: 'body must be a JSON object' };
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, detail: 'name is required' };
  if (name.length > 80) return { ok: false, detail: 'name must be 80 characters or fewer' };

  if (!LIGHT.includes(body.light_type)) {
    return { ok: false, detail: `light_type must be one of: ${LIGHT.join(', ')}` };
  }
  if (!SOIL.includes(body.soil_type)) {
    return { ok: false, detail: `soil_type must be one of: ${SOIL.join(', ')}` };
  }

  const opt = (key, max) => {
    const v = body[key];
    if (v === undefined || v === null || v === '') return { ok: true, value: '' };
    if (typeof v !== 'string') return { ok: false, detail: `${key} must be a string` };
    if (v.trim().length > max) {
      return { ok: false, detail: `${key} must be ${max} characters or fewer` };
    }
    return { ok: true, value: v.trim() };
  };

  const sci = opt('scientific_name', 120);
  if (!sci.ok) return sci;
  const room = opt('room', 40);
  if (!room.ok) return room;
  const pot = opt('pot_size', 40);
  if (!pot.ok) return pot;
  const notes = opt('notes', 300);
  if (!notes.ok) return notes;

  return {
    ok: true,
    value: {
      name,
      scientific_name: sci.value,
      light_type: body.light_type,
      soil_type: body.soil_type,
      room: room.value,
      pot_size: pot.value,
      notes: notes.value,
    },
  };
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_DIM = 4096;

// Longest base64 payload that could still decode to <= MAX_IMAGE_BYTES, plus a
// little slack for a data-URI header and incidental whitespace.
const MAX_IMAGE_B64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 256;

const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/jpg', 'image/png'];

// base64 of the JPEG (FF D8 FF) and PNG (89 50 4E 47) magic numbers. Checking
// these lets us reject junk from the first few characters, with no decode.
const B64_MAGIC = /^(\/9j\/|iVBORw0K)/;

/**
 * Cheap, allocation-free sanity check on the image field.
 *
 * Runs BEFORE the GPU gate so a flood of bogus or oversized payloads is turned
 * away without ever queueing; the expensive part (base64 decode, which doubles
 * the memory held per in-flight request) is deferred to decodeImage() and only
 * happens once a slot is actually held.
 *
 * @returns {{ok:true} | {ok:false, status:number, error:string, detail?:string}}
 */
export function precheckImage(image) {
  if (typeof image !== 'string' || image.length === 0) {
    return { ok: false, status: 400, error: 'bad_request', detail: 'image is required' };
  }
  if (image.length > MAX_IMAGE_B64_CHARS) {
    return { ok: false, status: 413, error: 'image_too_large' };
  }
  // No real photo is this short; checking .length avoids copying the string.
  if (image.length < 64) {
    return { ok: false, status: 400, error: 'bad_request', detail: 'image is too small to be valid' };
  }

  // Only the head of the string is inspected — no full-string copies here.
  let head = image.slice(0, 128).replace(/^\s+/, '');
  const uri = /^data:([a-z0-9.+/-]+);base64,/i.exec(head);
  if (uri) {
    if (!ALLOWED_IMAGE_MIME.includes(uri[1].toLowerCase())) {
      return { ok: false, status: 400, error: 'bad_request', detail: 'image must be JPEG or PNG' };
    }
    head = head.slice(uri[0].length);
  } else if (/^data:/i.test(head)) {
    return { ok: false, status: 400, error: 'bad_request', detail: 'malformed data URI' };
  }
  if (!B64_MAGIC.test(head.replace(/\s/g, ''))) {
    return { ok: false, status: 400, error: 'bad_request', detail: 'image must be JPEG or PNG' };
  }
  return { ok: true };
}

/**
 * Read pixel dimensions from the container header, without decoding pixels.
 *
 * PNG: the IHDR chunk is mandatory and always first — width/height are two
 * big-endian uint32s at offset 16.
 * JPEG: walk the marker segments to the first Start-Of-Frame (SOF0 baseline,
 * SOF2 progressive, and the arithmetic/lossless variants) and read the 16-bit
 * height then width.
 *
 * @returns {{width:number, height:number} | null} null = could not determine
 */
export function imageDimensions(buf) {
  // ---- PNG
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf.toString('latin1', 12, 16) === 'IHDR'
  ) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // ---- JPEG
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    // SOFn markers that carry a frame header. C4 (DHT), C8 (JPG), CC (DAC) are
    // deliberately excluded — they share the Cn range but are not frame headers.
    const SOF = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    let i = 2;
    while (i + 3 < buf.length) {
      if (buf[i] !== 0xff) {
        i++; // resync past fill bytes / corruption
        continue;
      }
      let marker = buf[i + 1];
      // Runs of 0xFF are legal padding before a marker.
      while (marker === 0xff && i + 2 < buf.length) {
        i++;
        marker = buf[i + 1];
      }
      // Standalone markers: TEM (01) and RSTn (D0-D7) have no payload.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break; // EOI / start of scan
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      if (SOF.has(marker)) {
        if (i + 9 > buf.length) break;
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }

  return null;
}

/**
 * Decode + validate the /api/identify image payload.
 *
 * Allocates: call precheckImage() first and only call this while holding a
 * generation slot.
 *
 * @returns {{ok:true, base64:string, bytes:number, mime:string, width:number|null, height:number|null}
 *          | {ok:false, status:number, error:string, detail?:string}}
 */
export function decodeImage(image) {
  if (typeof image !== 'string' || image.trim() === '') {
    return { ok: false, status: 400, error: 'bad_request', detail: 'image is required' };
  }
  let b64 = image.trim();
  const dataUri = /^data:([a-z0-9.+/-]+);base64,([\s\S]*)$/i.exec(b64);
  if (dataUri) {
    const mime = dataUri[1].toLowerCase();
    if (!ALLOWED_IMAGE_MIME.includes(mime)) {
      return { ok: false, status: 400, error: 'bad_request', detail: 'image must be JPEG or PNG' };
    }
    b64 = dataUri[2];
  } else if (/^data:/i.test(b64)) {
    return { ok: false, status: 400, error: 'bad_request', detail: 'malformed data URI' };
  }

  b64 = b64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return { ok: false, status: 400, error: 'bad_request', detail: 'image is not valid base64' };
  }

  // Check the decoded size from the base64 length before allocating a Buffer.
  if (Math.floor((b64.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: 'image_too_large' };
  }

  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 64) {
    return { ok: false, status: 400, error: 'bad_request', detail: 'image is too small to be valid' };
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: 'image_too_large' };
  }

  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d;
  if (!isJpeg && !isPng) {
    return { ok: false, status: 400, error: 'bad_request', detail: 'image must be JPEG or PNG' };
  }

  // A 2 MB payload can still be an enormous canvas (a flat-colour 20000x20000
  // PNG compresses to almost nothing), and the vision model's preprocessing
  // cost scales with pixels, not bytes. Bound the dimensions too.
  const dim = imageDimensions(buf);
  if (dim && (dim.width > MAX_IMAGE_DIM || dim.height > MAX_IMAGE_DIM)) {
    return {
      ok: false,
      status: 413,
      error: 'image_too_large',
      detail: `image must be ${MAX_IMAGE_DIM} px or smaller on each side`,
    };
  }
  if (dim && (dim.width < 1 || dim.height < 1)) {
    return { ok: false, status: 400, error: 'bad_request', detail: 'image has no pixels' };
  }

  // Re-encode from decoded bytes so Ollama always gets canonical base64.
  return {
    ok: true,
    base64: buf.toString('base64'),
    bytes: buf.length,
    mime: isJpeg ? 'image/jpeg' : 'image/png',
    width: dim ? dim.width : null,
    height: dim ? dim.height : null,
  };
}
