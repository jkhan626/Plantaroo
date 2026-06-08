# Plantaroo (native iOS app)

Expo + React Native + TypeScript rewrite of the Plantaroo plant-care tracker.
Multi-user, App-Store-bound. Same Firebase backend as the web app
(`plantaroo-204ca`) so accounts and data sync across web + mobile.

→ **Launch / console steps: see [SETUP.md](./SETUP.md).**

## Quick start
```bash
npm install --legacy-peer-deps     # ALWAYS --legacy-peer-deps (Expo 54 + React 19)
npm run typecheck                  # tsc --noEmit
npx expo start --dev-client        # needs a dev build (native modules) — not Expo Go
```

## Architecture
```
App.tsx                      providers + auth gate + navigation + notif wiring
src/
  firebase.ts                Firebase init (AsyncStorage auth persistence)
  theme.ts                   dark design tokens (ported from the web CSS)
  types.ts                   Plant / HistoryEntry domain types
  data/db.ts                 db* API → Firestore + in-memory cache + AsyncStorage
                             mirror (offline-first) + change emitter
  logic/
    constants.ts             soil table, rooms, option labels
    schedule.ts              learning interval, clamp, seasonal, next-due  (ported verbatim)
    fertilize.ts             feed-due / distilled rules
    profiles.ts              local plant+herb DB (~350 entries) + lookup     ← $0, offline
    actions.ts               water / skip / repot / edit-date / undo handlers
    notify.ts                local watering reminders (no server)
  lib/
    auth.ts                  Apple + Google sign-in, account deletion
    photo.ts                 capture/pick → resize → base64 data URI
  ui/                        hooks, icons, Toast, PlantCard, components, Header, …
  navigation/                tab bar + param types
  screens/                   SignIn, ToDo, Plants, History, PlantDetail, AddPlant, Settings
assets/                      icon / splash / notification / marks (+ _gen generator)
legal/privacy.html           privacy policy → host at jamasha.com/plantaroo/privacy
```

## Design notes
- **Local-first plant profiles** — no Claude API. `localProfileLookup` resolves
  ~350 plants/herbs for free, instantly, offline. Unknown plants fall back to
  editable manual defaults. Extend by adding rows to `logic/profiles.ts`.
- **The learning model is ported verbatim** — baseline blended as a prior
  (weight 2) + rolling last-5 gaps, clamped 0.5×–2× the soil-adjusted baseline;
  seasonal multiplier applied at display only, never stored. Don't "fix" this.
- **Storage**: reads come from the in-memory cache; all writes go through
  `dbPut/dbAdd/dbDelete`. Integer ids via `genId()` (Firestore doc id = String(id)).
- **No emoji, no colored pill badges** — SVG icons, status as subtle colored text.
