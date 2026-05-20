# Plantaroo

Adaptive plant care app — an event-anchored watering/fertilizing tracker that learns from real behavior. Competes with Planta but fixes the core flaw: schedules are anchored to actual watering events and learn from real behavior.

## Architecture

- **Frontend:** Single `index.html` file — all HTML/CSS/JS inline, no build tools, no npm required for the UI
- **Backend:** Express server (`server/index.js`) proxying Claude API calls (keeps API key server-side in `.env`)
- **Storage:** IndexedDB (raw API, no libraries) — client-side, works offline, stores plants + photos + history
- **Hosting:** GitHub Pages at https://jkhan626.github.io/Plantaroo/ (frontend), Render at https://plantaroo-api.onrender.com (API proxy)
- **AI:** Claude Sonnet 4.6 for one-time plant profile lookup on add (6-field structured JSON)

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
- **Plant detail view:** Tap any card → full profile, care info, schedule, notes, per-plant history, quick actions
- **Watering:** Dedicated water button on each card (pulses when due/overdue), undo toast
- **Learning rule:** Rolling average of last 5 valid watering gaps, clamped 0.5x–2x baseline
- **Late watering:** Inline prompt — "Still wet" (learn from it) vs "Too busy" (discard gap)
- **Skip:** Resets schedule anchor without corrupting the learning model
- **Repot:** Sets 2-week fertilizer suppression
- **Search + Sort:** By name, due date, or room in All Plants
- **Filters:** Room chips + grow light / natural light toggle
- **Seasonal multiplier:** 1.3x Nov–Feb, 1.15x Sep–Oct for natural light plants; always 1.0 for grow light
- **Fertilizing:** Rides on watering count (every Nth watering), never a separate schedule
- **Water source badges:** "Distilled" badge on carnivorous plants
- **Dynamic stats header:** Plant count, due count, current season
- **Photos:** Camera capture, stored as base64 in IndexedDB
- **28 pre-seeded plants** (Jamal's collection from Planta, organized by room)

## Key rules

- **API key is server-side only.** Never expose in client code.
- `.env` is in `.gitignore` — never commit it.
- `learned_interval` and `seasonal_multiplier` are always separate. Multiplier applied at display time, never stored.
- Late "too busy" gaps discarded from learning. "Still wet" gaps are valid evidence.
- `next_due`, feed flags, seasonal adjustments are **computed, never stored**.
- Single `index.html` pattern (like the CSCS study hub) — no React, no build tools.

## IndexedDB schema

- Database: `PlantarooDB`, version 1
- Stores: `plants` (keyPath: id, autoIncrement), `history` (keyPath: id, indexes: plantId, date), `profileCache` (keyPath: cacheKey)
- Plant fields: name, room, light_type, soil_type, photo, species_baseline_days, moisture_pref, feed_every_n_waterings, fert_type, carnivore, water_source, current_interval, recent_valid_gaps[], last_watered, last_fertilized, last_fed_at_count, no_fert_until, watering_count, notes, created_at

## Commands

```bash
node server/index.js    # Start API proxy on port 3001 (only needed for adding plants)
```

The app itself is just `index.html` — open in browser or access via GitHub Pages.
