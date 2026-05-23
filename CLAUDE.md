# Plantaroo

Adaptive plant care app — an event-anchored watering/fertilizing tracker that learns from real behavior. Competes with Planta but fixes the core flaw: schedules are anchored to actual watering events and learn from real behavior.

## Architecture

- **Frontend:** Single `index.html` file — all HTML/CSS/JS inline, no build tools, no npm for the UI (same pattern as the CSCS study hub)
- **Backend:** Express server (`server/index.js`) proxying Claude API calls — keeps API key server-side
- **Storage:** **Firebase Firestore** is the source of truth (durable + syncs across devices). Firestore's `persistentLocalCache` keeps the app offline-first. Data lives under `users/{uid}/...`. The classic script keeps the legacy `db*` API (`dbGetAll/dbGet/dbAdd/dbPut/dbDelete`) but it now reads from an in-memory session cache and writes through to Firestore — see the "DATA LAYER" comment block in `index.html`. The Firebase SDK + auth are wired in a `<script type="module">` at the bottom of `index.html` (exposes `window.FB`).
  - **Why the move from IndexedDB:** client-only IndexedDB got evicted by iOS Safari (~7-day cap for non-installed sites), wiping data; a now-deleted `migrateWateringDates()` also reset watering dates if its localStorage guard was lost. Firestore + Google sign-in fixes both.
- **Auth:** Google sign-in (Firebase Auth, `signInWithPopup`) gates the app. A returning user's session persists (offline too) via `browserLocalPersistence`. Account/sign-out button is in the header.
- **Hosting:**
  - Frontend: GitHub Pages at https://jkhan626.github.io/Plantaroo/
  - API: Render.com at https://plantaroo-api.onrender.com (needs user to deploy — see Deployment section)
- **AI:** Claude Sonnet 4.6 — one-time plant profile lookup on add (6-field structured JSON)

## Project structure

```
├── index.html               # THE APP — single file, all CSS/JS inline (~3000 lines)
├── server/index.js           # Express API proxy (POST /api/plant-profile, GET /health)
├── render.yaml               # Render.com deployment blueprint
├── firebase.json             # Firebase config (points at firestore.rules)
├── firestore.rules           # Firestore security rules (per-user isolation)
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
- **Photos:** Camera capture, resized to 200px / JPEG q0.7 (~10–30 KB), stored as base64 inside the plant doc (well under Firestore's 1 MB/doc limit)
- **28 pre-seeded plants** (Jamal's collection from Planta, organized by room) — only seeded if the user's cloud is empty AND no local data to import
- **First-sign-in import:** if the cloud is empty, existing legacy IndexedDB plants + history + photos are migrated up so nothing is lost
- **Cross-device sync:** sign in with the same Google account on phone + desktop; data loads from the cloud (refreshes on app open)
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
- **Firebase web config is NOT a secret** (it's public by design); per-user isolation is enforced by `firestore.rules`. Keep the config in `index.html`.
- **IDs stay integers**, client-generated via `genId()` (the UI relies on `parseInt`/`data-*`); the Firestore doc id is `String(id)`.
- Reads come from the in-memory `_cache`; **all writes go through `dbPut/dbAdd/dbDelete`** so the cache and Firestore stay in sync. Don't read Firestore directly in feature code — use the `db*` API.
- `learned_interval` and `seasonal_multiplier` are always separate. Multiplier applied at display time, never stored.
- Late "too busy" gaps discarded from learning. "Still wet" gaps are valid evidence.
- `next_due`, feed flags, seasonal adjustments are **computed, never stored**.
- Single `index.html` pattern — no React, no build tools. Firebase loads via CDN ESM imports in the module script.
- Failed API profile lookups are NOT cached — only successful responses.
- **Never re-add a migration that overwrites `last_watered`/`current_interval` unconditionally** — that bug wiped real data.

## Data model

### Firestore schema
- Per-user subtree: `users/{uid}/plants/{idStr}`, `users/{uid}/history/{idStr}`, `users/{uid}/profileCache/{cacheKey}`
- Doc id = `String(id)` for plants/history (integer `id` field preserved in the doc); `cacheKey` for profileCache
- `initializeFirestore` uses `ignoreUndefinedProperties: true` + `persistentLocalCache` (offline)
- Legacy (pre-migration) IndexedDB `PlantarooDB` is still read once on first sign-in for the import, then no longer used
- **`public/summary` (world-readable):** a tiny **names-free** doc the nightly "Plantaroo Watering" Notion routine reads. Written by `writeWateringSummary()` (in `index.html`, called from `render()`, only when contents change). Fields: `totalPlants`, `neverWateredCount`, `dueDates[]` (computed next-due `YYYY-MM-DD` per watered plant — anonymous, absolute), `newestWateringDaysAgo`, `updatedAt`. **Privacy: only counts + dates — never plant names/notes/rooms/photos.** Made readable by the `/public/{doc}` rule in `firestore.rules` (world read, owner write). Exists because cloud routines can't auth as Jamal to read `users/{uid}/**`. See `Claude Agent/agents/plantaroo-watering.md`.

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

### Firebase / Firestore (one-time setup)
1. https://console.firebase.google.com → **Add project** (e.g. `plantaroo`). Google Analytics optional.
2. **Build → Firestore Database → Create database** → Production mode → pick a region.
3. **Build → Authentication → Get started → Sign-in method → Google → Enable** (set a support email) → Save.
4. **Authentication → Settings → Authorized domains → Add domain:** `jkhan626.github.io` (localhost is already allowed for local testing).
5. **Project settings (gear) → General → Your apps → Web (`</>`)** → register app → copy the `firebaseConfig` object.
6. Paste those values into the `firebaseConfig` block in `index.html` (bottom module script, marked `PASTE_...`).
7. Deploy security rules: `firebase login` then `firebase deploy --only firestore:rules` (uses `firebase.json` + `firestore.rules`). Or paste `firestore.rules` into Firestore → Rules → Publish.

### Frontend (already live)
GitHub Pages: https://jkhan626.github.io/Plantaroo/ (auto-deploys on push to `main`)

### API server (Render.com)
1. Go to https://render.com → sign up with GitHub
2. New + → Web Service → connect Plantaroo repo
3. Name: `plantaroo-api`, Build: `npm install`, Start: `node server/index.js`
4. Add env var: `ANTHROPIC_API_KEY` = your key
5. Create — URL will be https://plantaroo-api.onrender.com
6. Frontend already points to this URL (var API_BASE in index.html)
