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
    p.pot_size ? `Pot size: ${p.pot_size}` : null,
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
  waterings for THIS SPECIES in a standard well-draining potting mix under
  average indoor conditions during the growing season. The app multiplies this
  baseline by its own soil factor and seasonal factor at display time, so do NOT
  bake the potting medium or the time of year into this number. Give the plain
  species baseline. For a sense of the real spread: bog and carnivorous plants
  sit around 1-3, thirsty tropicals and ferns around 4-6, most common
  houseplants around 7-10, semi-succulent plants like Hoya and ZZ around 14-21,
  and cacti and true succulents around 21-45.

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
  light, potting medium, and room shaped the advice.

- "tips" (array of 0 to 3 short strings): concrete, non-obvious care notes for this
  specific plant and setup. No generic filler. Never contradict the fields above —
  if "feed_every_n_waterings" is 0, no tip may mention fertilizing.

Use the light, potting medium, room, and pot size ONLY to shape "rationale",
"tips", and genuine edge cases (for example: carnivores need distilled water;
orchids use orchid_30_10_10; succulents feed rarely). They must not change
"species_baseline_days".`;
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
