# Plantaroo

Adaptive plant care app — an event-anchored watering/fertilizing tracker that learns from real behavior.

## Architecture

- **Frontend:** React + Vite (mobile-first web app, dark UI matching Planta style)
- **Backend:** Express server proxying Claude API calls (keeps API key server-side)
- **Storage:** IndexedDB via Dexie (client-side, works offline, stores plants + photos + history)
- **AI:** Claude Sonnet 4.6 for one-time plant profile lookup on add (6-field structured JSON)

## Project structure

```
├── server/index.js          # Express API proxy (POST /api/plant-profile)
├── src/
│   ├── main.jsx             # React entry
│   ├── App.jsx              # Root component, tab routing, plant state
│   ├── db.js                # Dexie DB, CRUD, soil table, constants
│   ├── scheduling.js        # Learning rule, seasonal multiplier, status calc
│   ├── index.css            # Global dark theme styles
│   └── components/
│       ├── TodayTab.jsx     # Due-today view grouped by room
│       ├── AllPlantsTab.jsx  # All plants with room + light-type filters
│       ├── HistoryTab.jsx   # Watering/feed log with plant filter
│       ├── PlantCard.jsx    # Plant row: photo, name, status pills, water tap, delete
│       ├── AddPlant.jsx     # Add plant modal: form → API profile → save
│       └── BottomNav.jsx    # 3-tab floating nav (Today / All Plants / History)
├── .env                     # ANTHROPIC_API_KEY (gitignored, never in client code)
├── vite.config.js           # Dev proxy /api → localhost:3001
└── package.json             # Run both: `npm run dev`
```

## Key rules

- **API key is server-side only.** Never import, reference, or bundle it in client code.
- `.env` is in `.gitignore` — never commit it.
- `learned_interval` and `seasonal_multiplier` are always separate. The multiplier is applied at display time, never stored.
- Late watering "too busy" gaps are discarded from the learning model. "Still wet" gaps are valid and stretch the interval.
- Fertilizing rides on watering count, no separate schedule.
- `next_due`, feed flags, and seasonal adjustments are computed, never stored.

## Commands

```bash
npm install          # Install all deps
npm run dev          # Start both frontend (5173) and backend (3001)
npm run dev:client   # Frontend only
npm run dev:server   # Backend only
npm run build        # Production build
```
