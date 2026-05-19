# Adaptive Plant Care App — Complete Build Spec

A self-correcting watering/fertilizing tracker. Fixes the core flaw in Planta:
the schedule is anchored to **actual watering events** and **learns from real
behavior**, instead of nagging off a fixed predictive model that ignores skips
and piles up overdue tasks.

---

## Core principles

1. **Event-anchored, not calendar-anchored.** `next_due = last_watered + (current_interval × seasonal_multiplier)`. Skip a watering, everything downstream shifts. No phantom waterings, no task pile-up.
2. **The schedule learns.** `current_interval` is a rolling average of recent *valid* watering gaps, not a fixed number.
3. **Fertilizing rides on watering.** No separate fertilizer schedule. Feed on every Nth watering. One action, one trip.
4. **Tactile-first.** The app reminds you to *check*; you log what you actually did; the math bends around reality.

---

## Tech / security notes

- API key is **server-side only**, in a `.env` file (add to `.gitignore`), accessed through a backend proxy route. **Never expose the key to the client** — no key in JS bundles, no `fetch()` to Anthropic directly from React.
- Front-end calls your own endpoint (e.g. `/api/plant-profile`); backend adds the key and forwards to Anthropic.
- Use model `claude-sonnet-4-6` for plant-profile lookups (structured 6-field extraction; cheap per call; one call per plant add).
- Plant data + photos persist client-side in **IndexedDB** (works with no server, survives reload).

---

## Adding a plant

User inputs only:
- Name (e.g. "Alocasia Frydek")
- Room / location (dropdown)
- **Light type: Grow light | Natural light** (stored field — drives seasonal math, also a filter)
- Soil type (dropdown — drives the local multiplier)
- Photo (user-captured, see Photos section)

App calls the Anthropic API once on add via the backend proxy. **Force strict
JSON, no prose, no markdown fences.** API returns exactly six fields:

```json
{
  "species_baseline_days": 11,
  "moisture_pref": "light_dry",
  "feed_every_n_waterings": 2,
  "fert_type": "balanced",
  "carnivore": false,
  "water_source": "tap_ok"
}
```

- `moisture_pref`: "moist" | "light_dry" | "moderate_dry" | "full_dry"
- `fert_type`: "balanced" | "orchid_30_10_10" | "high_phosphorus" | "none"
- `water_source`: "tap_ok" | "distilled_or_rain"

Show the returned profile; let the user override any field before saving.
Cache by species+soil so identical plants (e.g. second Pothos) reuse the profile.

---

## Fixed local soil table (NOT from API)

`effective_starting_interval = species_baseline_days × soil_multiplier`

| Soil type | Multiplier |
|---|---|
| Forbidden Cereal / chunky aroid | 0.45× |
| Pure orchid bark | 0.5× |
| Sphagnum moss | 0.7× |
| Regular potting + perlite | 1.0× (baseline) |
| Cactus / succulent gritty | 1.3× |
| Carnivore peat/perlite | kept-wet mode (interval top-up, not dry-down) |

Only the *starting* interval. Once history exists, the learned interval takes
over and the API/soil guess barely matters.

---

## The learning rule (the heart of it)

Every watering computes the gap since the last watering, then:

| Situation | Action |
|---|---|
| On time | Valid → add gap to rolling average |
| Early | Valid → add gap to rolling average (no guard, keep simple) |
| Late + "still wet" | Valid → push interval up toward this gap (plant is slower than thought) |
| Late + "too busy" | **Discard the gap entirely.** Reset anchor to now. Interval unchanged. |

`current_interval` = rolling average of last ~5 valid gaps.

**Why the asymmetry matters:** a "still wet" late watering is real evidence the
plant dries slower — learn from it. A "busy" late watering tells you nothing
(plant sat dry an unknown amount) — averaging it in would slowly starve the
plant as the schedule chases your busy weeks. Discard it.

**The only question the app ever asks:** on a late watering —
*"Still wet, or were you too busy?"* Everything else is silent.

**Clamp** the *learned* interval to 0.5×–2× of the starting interval so one
anomalous reading can't permanently wreck the schedule. Apply the seasonal
multiplier (below) *after* the clamp.

---

## Seasonal adjustment (display-time multiplier, never baked in)

Keep `learned_interval` and `seasonal_multiplier` strictly separate:

```
learned_interval    = rolling avg of valid gaps   (clean, year-round, unchanged by season)
seasonal_multiplier = 1.3  if (light_type == natural AND month in Nov–Feb)
                       1.15 if (light_type == natural AND month in Sep–Oct)   [optional softer shoulder]
                       1.0  otherwise  (always 1.0 for grow-light plants)
next_due = last_watered + (clamp(learned_interval) × seasonal_multiplier)
```

- **Grow-light plants → seasonal_multiplier always 1.0.** Their light doesn't change in winter, so their dry-down doesn't either. (This is most of the collection.)
- **Natural-light plants → stretch in fall/winter.**
- **Critical:** the multiplier is applied fresh at display time based on today's date. It is NEVER folded into the stored learned interval. (If folded in, winter's stretched gaps would feed the rolling average and the model would underwater the plant all summer.)

---

## Fertilizing (rides on watering)

- Count watering events. Flag feed on every `feed_every_n_waterings`.
- When a feed is due, the plant card says **"water + feed"**; otherwise **"water only."**
- `fert_type` per plant (balanced default; orchid 30-10-10 for Moth Orchid; high-phos for Wax Plant in bloom; **none** for carnivores).
- `no_fert_until` date auto-set on repot: 2 weeks (established) / 4–6 weeks (new acquisition). Suppresses the feed flag until passed.
- Fall/winter: optionally double `feed_every_n_waterings` or pause for low-light / full-dry plants.

---

## Per-plant data model

```
name
room
light_type                   (grow | natural — drives seasonal math + filter)
soil_type
photo                        (user-captured, IndexedDB)
species_baseline_days        (API)
moisture_pref                (API)
feed_every_n_waterings       (API)
fert_type                    (API)
carnivore                    (API)
water_source                 (API)
current_interval             (starts API×soil, then learned)
recent_valid_gaps[]          (rolling, max ~5)
last_watered                 (the anchor)
last_fertilized
no_fert_until                (auto-set on repot)
```

`next_due`, seasonal multiplier, "is this watering also a feed," and
"water+feed vs water only" are all **computed, never stored** — that's what
keeps it honest on skips and across seasons.

---

## UI — match the Planta screenshots

Visual style (copied from the user's Planta screenshots):
- Near-black background (#000 / very dark grey), white primary text, muted grey secondary
- Each plant is a row: **circular photo thumbnail** left, name + greyed location stacked center, chevron right
- Status as small soft rounded pills under the name — green "in 3 days" pill for upcoming; colored task icons for what's due now
- Floating rounded bottom nav bar; rounded search/sort/settings cluster top-right
- Generous row spacing, quiet, highly scannable. The design should feel like *less* than Planta, not more — no anxiety-inducing overdue badge pile.

### Bottom nav — 3 tabs

1. **Today** (home) — only what needs water/feed today, grouped by room. Each line says "water" or "water + feed." This is the default landing tab.
2. **All Plants** — every plant. **Filter bar at the top:** location chips (Office, Bedroom, Living Room, Front Window, Side Window) + a light-type toggle (Grow light / Natural light). Tappable rounded pills, multi-select, matching the dark style.
3. **History / Log** — waterings, feeds, repots, nematode treatments per plant.

(Skip Planta's diagnose / community / shop tabs — 3 tabs only.)

### Photos

- Each plant stores a user-taken photo shown as the circular row thumbnail.
- Camera capture via `<input type="file" accept="image/*" capture="environment">` (opens phone camera directly).
- Store as base64/blob in **IndexedDB** so it persists with no server.

### Interaction

- Logging a watering = one tap.
- Only a *late* tap triggers the single question — a **quiet inline prompt, never a blocking modal**: "Still wet, or were you too busy?"
- Optimize for **one-handed phone use** (plants in the other hand).

---

## Seed reference — moisture groups (user's collection)

- **Moist:** Pitcher Plant, Cape Sundew (distilled only, carnivore — never feed), Episcia, Moth Orchid, Thai Constellation
- **Light dry (top inch):** all Philodendrons, all Alocasias, Syngonium, Watermelon Ivy, both Begonias, all Pothos, Corn Plant, Umbrella Tree, White Bird of Paradise, Inch Plant
- **Moderate dry (top half):** Monkey Mask
- **Full dry (whole pot):** ZZ Plant, Snake Plant, Wax Plant — being "late" here is irrelevant

---

## Design instruction to paste alongside this spec

> Use the frontend-design skill. Match the visual style of the provided Planta
> screenshots: near-black background, circular plant thumbnails, name + greyed
> location stacked, soft rounded status pills, floating rounded bottom nav.
> Three tabs: Today / All Plants / History. All Plants has a top filter bar
> with location chips and a grow-light vs natural-light toggle. Plant photos
> are user-captured via phone camera, stored in IndexedDB. Optimize for
> one-handed phone use and instant scannability of what's due. The
> late-watering question is a quiet inline prompt, never a blocking modal.
