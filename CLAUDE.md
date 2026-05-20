# Plantaroo

Adaptive plant care app — an event-anchored watering/fertilizing tracker that learns from real behavior. Competes with Planta but fixes the core flaw: schedules are anchored to actual watering events and learn from real behavior.

## Architecture

- **Frontend:** Single `index.html` file — all HTML/CSS/JS inline, no build tools, no npm for the UI (same pattern as the CSCS study hub)
- **Backend:** Express server (`server/index.js`) proxying Claude API calls — keeps API key server-side
- **Storage:** IndexedDB (raw API, no libraries) — client-side, works offline, stores plants + photos + history
- **Hosting:**
  - Frontend: GitHub Pages at https://jkhan626.github.io/Plantaroo/
  - API: Render.com at https://plantaroo-api.onrender.com (needs user to deploy — see Deployment section)
- **AI:** Claude Sonnet 4.6 — one-time plant profile lookup on add (6-field structured JSON)

## Project structure

```
├── index.html               # THE APP — single file, all CSS/JS inline (~2800 lines)
├── server/index.js           # Express API proxy (POST /api/plant-profile, GET /health)
├── render.yaml               # Render.com deployment blueprint
├── .env                      # ANTHROPIC_API_KEY (gitignored, never in client code)
├── .gitignore
├── package.json              # Server deps (express, @anthropic-ai/sdk, dotenv, cors)
├── CLAUDE.md
└── plant-app-spec.md         # Original design spec
```

## Features

- **3-tab UI:** To Do (actionable items) / All Plants (full list) / History (log)
- **Plant detail view:** Tap card → full profile, care info, schedule, notes, per-plant history, quick actions
- **Watering:** Dedicated water button on each card (pulses when due/overdue), undo toast
- **Learning rule:** Rolling average of last 5 valid watering gaps, clamped 0.5x–2x baseline
- **Late watering:** Inline prompt — "Still wet" (learn) vs "Too busy" (discard gap)
- **Skip:** Resets schedule anchor without corrupting the learning model
- **Repot:** Sets 2-week fertilizer suppression
- **Search + Sort:** By name, due date, or room in All Plants
- **Filters:** Room chips + grow light / natural light toggle
- **Seasonal multiplier:** 1.3x Nov–Feb, 1.15x Sep–Oct for natural light; always 1.0 for grow light
- **Fertilizing:** Rides on watering count (every Nth watering), never a separate schedule
- **Distilled water reminders:** Inline text on carnivorous plant cards
- **Dynamic stats header:** Plant count, due count, current season
- **Photos:** Camera capture, stored as base64 in IndexedDB
- **28 pre-seeded plants** (Jamal's collection from Planta, organized by room)
- **API fallback:** If API unreachable, user can manually set profile values; failed lookups are never cached

## Design principles

- **No colored pill badges** — status shown as subtle colored text (iOS style)
- **No emoji in the UI** — SVG icons throughout
- **iOS design patterns:** 14px border-radius, 48px photos, clean rows, generous whitespace
- **Font weights:** 400 (body), 500 (labels), 600 (names/buttons), 700 (titles) — never 800
- **Quiet by default:** Only things needing attention draw the eye

## Key rules

- **API key is server-side only.** Never expose in client code.
- `.env` is in `.gitignore` — never commit it.
- `learned_interval` and `seasonal_multiplier` are always separate. Multiplier applied at display time, never stored.
- Late "too busy" gaps discarded from learning. "Still wet" gaps are valid evidence.
- `next_due`, feed flags, seasonal adjustments are **computed, never stored**.
- Single `index.html` pattern — no React, no build tools.
- Failed API profile lookups are NOT cached — only successful responses.

## Data model

### IndexedDB schema
- Database: `PlantarooDB`, version 1
- Stores: `plants` (keyPath: id, autoIncrement), `history` (keyPath: id, indexes: plantId, date), `profileCache` (keyPath: cacheKey)

### Plant fields
name, room, light_type, soil_type, photo, species_baseline_days, moisture_pref, feed_every_n_waterings, fert_type, carnivore, water_source, current_interval, recent_valid_gaps[], last_watered, last_fertilized, last_fed_at_count, no_fert_until, watering_count, notes, created_at

### Valid option values
- **moisture_pref:** moist, light_dry, moderate_dry, full_dry
- **fert_type:** balanced, orchid_30_10_10, high_phosphorus, none
- **water_source:** tap_ok, distilled_or_rain
- **light_type:** grow, natural
- **soil_type:** chunky_aroid, orchid_bark, sphagnum_moss, regular_perlite, cactus_gritty, carnivore_peat

## Commands

```bash
node server/index.js         # Start API proxy on port 3001 (local dev)
```

The app itself is just `index.html` — open in browser or access via GitHub Pages.

## Deployment

### Frontend (already live)
GitHub Pages: https://jkhan626.github.io/Plantaroo/

### API server (Render.com)
1. Go to https://render.com → sign up with GitHub
2. New + → Web Service → connect Plantaroo repo
3. Name: `plantaroo-api`, Build: `npm install`, Start: `node server/index.js`
4. Add env var: `ANTHROPIC_API_KEY` = your key
5. Create — URL will be https://plantaroo-api.onrender.com
6. Frontend already points to this URL (var API_BASE in index.html)
