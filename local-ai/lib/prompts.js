// Prompt text for the two endpoints. Kept here so wording can be tuned without
// touching request handling.

export const IDENTIFY_SYSTEM = [
  'You are an expert horticulturist who identifies houseplants and garden plants from photographs.',
  'You answer only with a single JSON object, no prose, no markdown, no code fences.',
].join(' ');

export const IDENTIFY_USER = `Identify the plant in this photo.

Return JSON with exactly this shape:
{
  "candidates": [
    { "common_name": "string", "scientific_name": "string", "confidence": 0.0 }
  ],
  "notes": "string"
}

Rules:
- Give the 1 to 3 most likely candidates, best guess FIRST, ordered by descending confidence.
- "confidence" is a number between 0 and 1 (your own calibrated certainty, not a percentage).
- "common_name" must be the name a houseplant owner would actually use, in Title Case.
  Good examples: "Monstera Deliciosa", "Snake Plant", "Pothos", "Fiddle Leaf Fig",
  "ZZ Plant", "Peace Lily", "Bird of Paradise", "Phalaenopsis Orchid", "Aloe Vera".
- "scientific_name" is the botanical binomial, e.g. "Monstera deliciosa",
  "Dracaena trifasciata". Use "" only if you genuinely cannot name a genus.
- "notes" is one short sentence: the visual features you keyed on, or what would
  disambiguate the top candidates.
- If the photo does not contain a plant (a person, a pet, a room, a blurry mess,
  a screenshot), return "candidates": [] and explain that in "notes".
- Do not invent a species to be helpful. Low confidence is a valid answer.`;

export const PROFILE_SYSTEM = [
  'You are an expert horticulturist writing care parameters for a plant-care app.',
  'You answer only with a single JSON object, no prose, no markdown, no code fences.',
].join(' ');

/**
 * @param {object} p validated request body
 */
export function profileUserPrompt(p) {
  const lines = [
    `Plant name: ${p.name}`,
    p.scientific_name ? `Scientific name: ${p.scientific_name}` : null,
    `Light: ${p.light_type === 'grow' ? 'grow light (artificial, consistent year-round)' : 'natural light from a window'}`,
    `Potting medium: ${SOIL_LABELS[p.soil_type]}`,
    p.room ? `Room: ${p.room}` : null,
    ...potLines(p, PROFILE_POT_FALLBACK),
    p.notes ? `Owner notes: ${p.notes}` : null,
  ].filter(Boolean);

  return `Produce a care profile for this plant.

${lines.join('\n')}

Return JSON with exactly these keys. The angle brackets describe what each value
must be — they are NOT example values, and you must not copy them:
{
  "species_baseline_days": <integer 1-90>,
  "moisture_pref": <one of the four moisture strings below>,
  "feed_every_n_waterings": <integer 0-30>,
  "fert_type": <one of the four fertilizer strings below>,
  "carnivore": <true or false>,
  "water_source": <one of the two water strings below>,
  "mist_every_days": <integer, or null>,
  "clean_every_days": <integer, or null>,
  "rationale": <string>,
  "tips": <array of 0-3 strings>
}

Answer for THIS plant specifically. Different species get very different numbers —
a thirsty fern is not watered on the same schedule as a jade plant. Do not fall back
on generic middle-of-the-road values.

Field definitions — obey these exactly:

- "species_baseline_days" (integer 1-90): the typical number of days between
  waterings for THIS PLANT IN ITS POT - the pot size, material and drainage given
  above; if the pot was not specified, assume a medium plastic pot with a drainage
  hole - in a standard well-draining potting mix under average indoor conditions
  during the growing season. The app multiplies this baseline by its own soil
  factor and seasonal factor at display time, so do NOT bake the potting medium or
  the time of year into this number.
  Start from what the species itself wants. For a sense of the real spread: bog and
  carnivorous plants sit around 1-3, thirsty tropicals and ferns around 4-6, most
  common houseplants around 7-10, semi-succulent plants like Hoya and ZZ around
  14-21, and cacti and true succulents around 21-45.
  Then move that number for the pot, because the pot decides how fast the water
  actually leaves:
    * unglazed terracotta breathes and wicks water out through its walls -> SHORTER
    * a small pot holds a small reservoir and runs out sooner            -> SHORTER
    * a large pot holds a lot of water deep in the middle                -> LONGER
    * glazed ceramic or plastic seals the water in                       -> LONGER
    * NO drainage hole: nothing can run off, so the medium stays wet      -> LONGER
  Do not stack these into an absurd number - a small terracotta pot rarely more
  than halves the species figure, and a large glazed pot with no drainage rarely
  more than doubles it. If no pot detail was given, just answer for the medium
  plastic pot with drainage.

- "moisture_pref" (one of): 
    "moist"         = keep the medium evenly moist, never let it dry out
    "light_dry"     = let the top inch dry before watering
    "moderate_dry"  = let the top half of the pot dry before watering
    "full_dry"      = let the pot dry out completely before watering

- "feed_every_n_waterings" (integer 0-30): fertilize on every Nth watering.
  0 means never fertilize. Heavy feeders are around 3-4; most houseplants 4-6;
  succulents and cacti 8-12; plants that resent feeding use 0.

- "fert_type" (one of): "balanced", "orchid_30_10_10", "high_phosphorus", "none".
  Use "orchid_30_10_10" for orchids, "high_phosphorus" for bloom-driven plants,
  "none" for carnivorous plants and anything that should not be fed.

- "carnivore" (boolean): true only for carnivorous plants (Nepenthes, Sarracenia,
  Dionaea, Drosera, Pinguicula, Utricularia). These are bog plants: if carnivore is
  true, "moisture_pref" must be "moist" and "species_baseline_days" must be small
  (1-3). They must never be allowed to dry out.

- "water_source" (one of): "tap_ok" or "distilled_or_rain". **"tap_ok" is the
  default and correct answer for the large majority of plants** — cacti,
  succulents, Hoya, Monstera, Pothos, Sansevieria, Philodendron, ZZ, orchids,
  most ferns. Choose "distilled_or_rain" ONLY for carnivorous plants and the few
  genuinely mineral-sensitive genera (Calathea, Maranta, Stromanthe, Ctenanthe,
  Dracaena, Spathiphyllum). If you are unsure, answer "tap_ok" — telling someone
  to buy distilled water they do not need is a worse error than the reverse.

- "mist_every_days" (integer or null): how often to mist, or null if misting is
  pointless or harmful for this plant (most plants: null; fuzzy-leaved plants and
  succulents must be null).

- "clean_every_days" (integer or null): how often to wipe dust off the leaves.
  Broad smooth-leaved plants (Monstera, Ficus, Philodendron, Sansevieria, ZZ)
  should be wiped every 14-30 days — give a number for those. Use null only for
  plants whose leaves are too small, spiny, or fuzzy to wipe (ferns, cacti,
  African violets, most succulents).

- "rationale" (string): one or two sentences, AT MOST 30 WORDS and 200 characters.
  It must fit in that budget as a complete sentence — do not start a third thought
  you cannot finish. Explain the choices and explicitly mention how the given
  light and potting medium shaped the advice. If any pot detail was given, the
  rationale must also say how the pot changed the watering interval.

- "tips" (array of 0 to 3 short strings): concrete, non-obvious care notes for this
  specific plant and setup. No generic filler. Never contradict the fields above —
  if "feed_every_n_waterings" is 0, no tip may mention fertilizing. If the pot has
  NO drainage hole, one tip MUST warn about it — water a measured small amount,
  never let water stand in the bottom, and repot into something with a hole if
  possible.

Use the light, potting medium and room ONLY to shape "rationale", "tips", and
genuine edge cases (for example: carnivores need distilled water; orchids use
orchid_30_10_10; succulents feed rarely). Those three must not change
"species_baseline_days".

The pot is the exception: pot size, material and drainage ARE part of
"species_baseline_days", because they change how fast this particular pot dries
out. Use them there as described above.`;
}

const POT_SIZE_LABELS = {
  small: 'small (under 4 in / 10 cm across — little reservoir, dries out quickly)',
  medium: 'medium (4-8 in / 10-20 cm across)',
  large: 'large (over 8 in / 20 cm across — a deep reservoir that dries slowly)',
};

const POT_MATERIAL_LABELS = {
  terracotta:
    'unglazed terracotta (porous — it wicks moisture out through the walls, so the ' +
    'medium dries noticeably faster than in any sealed pot)',
  plastic: 'plastic (non-porous, water leaves only from the surface and the drainage hole)',
  glazed:
    'glazed ceramic (non-porous and heavy — it holds moisture longer than plastic)',
  other: 'unspecified material',
};

// What the model should do about pot details the owner did not give. The two
// endpoints differ for a real reason: /api/profile has nothing but this text to go
// on, so it is told to assume the ordinary pot and the baseline stays comparable
// across plants added before the app sent pot details. /api/diagnose also gets a
// PHOTO, in which the pot is usually visible — so it is told to read it there
// first and only fall back to the assumption.
const PROFILE_POT_FALLBACK = {
  all: 'assume a medium plastic pot with a drainage hole.',
  some: 'assume the ordinary case.',
};
const DIAGNOSE_POT_FALLBACK = {
  all:
    'read the pot from the photo if it is visible (terracotta vs glazed vs plastic, ' +
    'how big it is), otherwise assume a medium plastic pot with a drainage hole.',
  some: 'read it from the photo if visible, otherwise assume the ordinary case.',
};

/**
 * Pot description lines. Every part is optional.
 * @param {object} p validated request body
 * @param {{all: string, some: string}} fallback what to do about missing details
 * @returns {string[]}
 */
function potLines(p, fallback) {
  const known = p.pot_size || p.pot_material || typeof p.pot_drainage === 'boolean';
  if (!known) {
    return [`Pot: not specified — ${fallback.all}`];
  }
  const out = [];
  if (p.pot_size) out.push(`Pot size: ${POT_SIZE_LABELS[p.pot_size] || p.pot_size}`);
  if (p.pot_material) {
    out.push(`Pot material: ${POT_MATERIAL_LABELS[p.pot_material] || p.pot_material}`);
  }
  if (p.pot_drainage === true) out.push('Drainage: the pot HAS a drainage hole.');
  if (p.pot_drainage === false) {
    out.push(
      'Drainage: the pot has NO drainage hole. Excess water cannot escape, the medium ' +
        'stays wet far longer, and root rot is the main risk — be cautious.'
    );
  }
  // Anything the owner left out is still unknown; say so rather than letting the
  // model quietly invent the missing half of the pot.
  const missing = [
    p.pot_size ? null : 'size',
    p.pot_material ? null : 'material',
    typeof p.pot_drainage === 'boolean' ? null : 'drainage',
  ].filter(Boolean);
  if (missing.length) {
    out.push(`Pot ${missing.join(' and ')} not specified — ${fallback.some}`);
  }
  return out;
}

const SOIL_LABELS = {
  chunky_aroid: 'chunky aroid mix (bark, perlite, coco — very fast draining)',
  orchid_bark: 'coarse orchid bark (almost no water retention)',
  sphagnum_moss: 'sphagnum moss (holds a lot of water, stays damp)',
  regular_perlite: 'regular potting soil amended with perlite',
  cactus_gritty: 'gritty cactus/succulent mix (sand and pumice, drains instantly)',
  carnivore_peat: 'peat and perlite carnivorous plant mix (stays wet, no nutrients)',
};

export const RETRY_NUDGE =
  'Your previous reply did not match the required JSON schema. Return ONLY the JSON object, ' +
  'with every field present, every enum spelled exactly as listed, and every number an integer ' +
  'inside its stated range.';

// --------------------------------------------------------------- diagnose

export const DIAGNOSE_SYSTEM = [
  'You are an expert horticulturist doing a visual health check on one houseplant,',
  "working from a single photo plus the owner's real watering record.",
  'You answer only with a single JSON object, no prose, no markdown, no code fences.',
].join(' ');

const MOISTURE_LABELS = {
  moist: 'keep evenly moist, never let it dry out',
  light_dry: 'let the top inch dry before watering',
  moderate_dry: 'let the top half of the pot dry before watering',
  full_dry: 'let the pot dry out completely before watering',
};

const SEASON_LABELS = {
  winter: 'winter (dormant — growth and water use are at their lowest)',
  spring: 'spring (waking up, growth accelerating)',
  summer: 'summer (peak growing season, highest water use)',
  fall: 'fall (slowing down toward dormancy)',
};

const EVENT_LABELS = {
  water: 'watered',
  skip: 'watering deliberately skipped',
  still_wet: 'marked "still wet" — the soil was still wet when the app said to water',
  too_busy: 'marked "too busy" — the watering ran late for human reasons',
};

function daysAgoPhrase(n) {
  const d = Math.round(n);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

/**
 * @param {object} p validated /api/diagnose body (the image is sent separately)
 */
export function diagnoseUserPrompt(p) {
  const facts = [
    `Plant name: ${p.name}`,
    p.scientific_name ? `Scientific name: ${p.scientific_name}` : null,
    `Light: ${p.light_type === 'grow' ? 'grow light (artificial, consistent year-round)' : 'natural light from a window'}`,
    `Potting medium: ${SOIL_LABELS[p.soil_type] || p.soil_type}`,
    ...potLines(p, DIAGNOSE_POT_FALLBACK),
    `Moisture the app is aiming for: ${MOISTURE_LABELS[p.moisture_pref] || p.moisture_pref}`,
    `Season right now: ${SEASON_LABELS[p.season] || p.season}`,
    p.days_since_watered === null
      ? 'Last watered: never recorded in the app (it may still have been watered before it was added).'
      : `Last watered: ${daysAgoPhrase(p.days_since_watered)}.`,
    `The app's current watering interval for this plant: every ${Math.round(p.current_interval)} days.`,
    `Waterings logged so far: ${Math.round(p.watering_count)}.`,
    // Stated up front as well as in rule 7: the model is far more reliable about
    // fertilizer and tap water when it is told this as a fact than when it has to
    // infer it from the species name.
    p.carnivore === true || p.soil_type === 'carnivore_peat'
      ? 'This is a carnivorous bog plant: it must never dry out, must never be fertilized, ' +
        'and must never be given tap water.'
      : null,
    p.notes ? `Owner notes: ${p.notes}` : null,
  ].filter(Boolean);

  const events = p.recent_events.length
    ? p.recent_events
        .map((e) => `  - ${daysAgoPhrase(e.days_ago)}: ${EVENT_LABELS[e.type] || e.type}`)
        .join('\n')
    : '  (nothing recorded yet)';

  return `Assess the health of the plant in this photo.

What the owner's app knows about it:
${facts.join('\n')}

Recent care events, most recent first:
${events}

How to read those events — this matters:
- "watered" is just a watering.
- "watering deliberately skipped" means the owner judged it did not need water.
- "still wet" is real evidence about the PLANT: when the schedule said to water, the
  owner found the soil still wet. Repeated "still wet" events mean the plant is being
  scheduled too often, or this pot and medium dry out more slowly than assumed.
- "too busy" is evidence about the OWNER, not the plant. The watering ran late for
  human reasons. Never read it as the plant tolerating drought or needing less water.

How to read the pot — the pot decides how fast the water actually leaves, so the same
gap between waterings means different things in different pots:
- unglazed terracotta breathes and wicks moisture out through its walls, so the medium
  dries FASTER than the interval alone suggests. A long gap there is more likely to
  have dried the plant out; soggy soil in a terracotta pot is a strong overwatering
  signal, because even a porous pot could not keep up.
- a small pot holds a small reservoir and runs out sooner. A large pot stays wet deep
  in the middle long after the surface looks dry, so it dries SLOWER.
- glazed ceramic and plastic seal the water in, so the medium stays wet LONGER.
- NO drainage hole means excess water cannot escape at all: the medium stays wet far
  longer, root rot is the leading risk, and overwatering is much more likely than the
  interval alone would suggest.
Where the pot is not described above, look at it in the photo before assuming.

Return JSON with exactly these keys. The angle brackets describe what each value
must be — they are NOT example values, and you must not copy them:
{
  "summary": <string, at most 200 characters>,
  "watering_verdict": <"likely_overwatered" | "likely_underwatered" | "watering_ok" | "unclear">,
  "observations": <array of 0-4 short strings>,
  "likely_causes": <array of 0-3 objects: { "cause": <string>, "confidence": <0.0-1.0> }>,
  "actions": <array of 0-3 short strings>,
  "confidence": <number 0.0-1.0>,
  "not_a_plant": <true or false>
}

Rules — obey these exactly:

1. Reason from BOTH the photo and the watering record above. Where the two disagree
   (the record looks fine but the plant looks bad, or the reverse), say so in
   "summary" instead of picking one and ignoring the other.

2. If the photo is dark, blurry, too far away, or shows only part of the plant, say
   so in "summary" and lower "confidence". An honest "unclear" is a better answer
   than a confident guess. Never describe anything you cannot actually see.

3. "observations" (0-4 short strings): only what is VISIBLE in the photo — leaf
   colour and pattern, yellowing, browning, spots, crisping edges, drooping, new
   growth, the soil surface, visible pests, the pot itself. Short phrases, no advice.
   Describe what IS there, never a list of absences: "glossy dark green leaves", not
   "no yellowing", "no spots", "no pests". If only one thing is worth noting, say one.

4. "likely_causes" (0-3): best first. "cause" at most 80 characters; "confidence" is
   your own 0-1 certainty in THAT cause. One well-supported cause beats three
   guesses. Use an empty array if the evidence supports none.

5. "actions" (0-3 short strings): concrete next steps. Be conservative — phrase them
   as "Consider ...", "Check ...", "Move ...". Never "you must". No drastic advice
   (repotting, hard pruning) unless the evidence is strong.

6. Never name a medicine, drug, pesticide, fungicide, insecticide or any commercial
   product, and never give human medical advice. Generic horticultural advice only:
   "wipe the leaves", "improve airflow", "let it dry out further".

7. If this is a carnivorous plant (Nepenthes, Sarracenia, Dionaea, Drosera,
   Pinguicula, Utricularia), never suggest fertilizer and never suggest tap water.

8. "watering_verdict": answer "likely_overwatered" or "likely_underwatered" only when
   the photo and the record actually point that way. Use "watering_ok" when watering
   is not the problem (including when the plant simply looks healthy), and "unclear"
   when you genuinely cannot tell.
   A record that simply follows the app's own interval is NORMAL — the app is not
   watering the plant wrongly just by keeping to its own schedule. Never call it
   overwatering on the schedule alone. Say "likely_overwatered" only when the photo
   shows it (yellowing lower leaves, mushy stems, soggy or mouldy soil surface) or
   repeated "still wet" events say the pot is not drying; say "likely_underwatered"
   only when the photo shows it (limp or crisping leaves, soil shrunk from the pot
   rim) or the plant has clearly gone far past its interval. If the plant looks
   healthy and nothing in the record contradicts that, the answer is "watering_ok".
   Weigh the gap since the last watering against how fast THIS pot dries, not against
   the interval in isolation.

9. "not_a_plant": true ONLY if the photo does not show a plant at all (a person, a
   pet, a room, a screenshot, an unreadable blur). When it is true, set
   "watering_verdict" to "unclear", leave all three arrays empty, and use "summary"
   to say what the photo appears to show instead.

10. "summary": one or two plain sentences, at most 200 characters, written for an
    ordinary plant owner. No jargon, no hedging boilerplate.`;
}

export const DIAGNOSE_RETRY_NUDGE =
  'Your previous reply did not match the required JSON schema. Return ONLY the JSON object, ' +
  'with every key present, "watering_verdict" spelled exactly as one of the four allowed ' +
  'strings, "observations" and "actions" arrays of plain strings, "likely_causes" an array of ' +
  '{"cause","confidence"} objects, and every confidence a number between 0 and 1. Keep the same ' +
  'findings you just gave — only the format was wrong.';
