# Plantaroo 2.0 — Upgrade Plan (iOS app)

Goal: make the **native iOS app** (`app/`) genuinely compete with Planta, Greg, and
PictureThis while staying **strictly $0 to run** — no metered API usage, no new servers.
Everything new is bundled data, on-device logic, or Firebase free tier.

**Scope decided 2026-06-09 (rev. same day):**
- Target is the **iOS app only**. The web `index.html` is retired — Jamal has fully
  migrated to the native app; no feature work lands there.
- **Strictly $0.** AI vision (photo plant-ID, photo diagnosis) stays out of scope.
  We compete instead on schedule intelligence, care breadth, bundled plant knowledge,
  and native iOS polish — and a **rule-based symptom troubleshooter** covers most of
  what "AI diagnosis" actually delivers, for free.

---

## Competitive context (June 2026)

| | Planta ($36/yr) | Greg | PictureThis | Plantaroo today | Plantaroo 2.0 |
|---|---|---|---|---|---|
| Adaptive schedule learns from real behavior | ✗ (static) | ✓ | ✗ | ✓ | ✓ |
| Push/local reminders | ✓ | ✓ | ✓ | ✓ (local, 9am) | ✓ (richer: actions, badge) |
| Misting / cleaning / pruning / repot tasks | ✓ (premium) | partial | ✗ | **✗** | ✓ |
| Growth photo journal | ✗ | ✓ | ✗ | **✗** | ✓ |
| Rich per-plant care info (light, humidity, toxicity) | ✓ | ✓ | ✓ | **✗** (6 fields) | ✓ (bundled, offline) |
| Problem diagnosis | ✓ (AI, paid) | ✗ | ✓ (AI, paid) | **✗** | ✓ (rule-based, free) |
| Home-screen widget | ✓ | ✓ | ✗ | **✗** | ✓ |
| Onboarding that sells the app | ✓ | ✓ | ✓ | **✗** (empty list) | ✓ |
| Price | $7.99/mo | freemium | $29.99/yr | $0 | $0 |

The core algorithm (event-anchored rolling-5-gap learning, `app/src/logic/schedule.ts`)
already beats Planta's static schedules. The upgrade is about **breadth** (more care
types, journal), **depth** (plant knowledge, troubleshooting), **feel** (today flow,
animation, onboarding), and **presence** (widget, badge, notification actions).

---

## Phase 0 — Housekeeping (before anything ships wide)

Small, unblocking items found in the current build:

- **Google OAuth client IDs** are still `PASTE_...` placeholders in `app/app.json` —
  Google sign-in is dead until filled. Fill or hide the button.
- **Apple token revocation** on account deletion (App Store 5.1.1 follow-up noted in
  `app/SETUP.md`) — implement the revocation call so deletion is fully compliant.
- **Drop the Android `RECORD_AUDIO` permission** unless something actually needs it.
- Bump `version`/`buildNumber` strategy: decide OTA-vs-build cadence per phase below
  (phases marked **[build]** need a new EAS build — ask Jamal first, limited quota;
  everything else ships OTA via `eas update`).

## Phase 1 — UI & usability overhaul

The app is already iOS-quiet and polished; this phase takes it from "clean tracker" to
"app you enjoy opening." All JS — ships OTA.

1. **Today flow / care queue** (To Do tab evolution): due plants become a one-tap
   blitz flow — big card, water/skip/snooze, satisfying check animation
   (`react-native-reanimated` spring + haptic), done-count progress line
   ("3 of 7 done"). Morning routine in under 30 seconds.
2. **Swipe gestures on cards:** swipe right to water (with resistance + haptic
   detent), swipe left for skip/detail. Buttons remain for discoverability.
   (`react-native-gesture-handler` is already in the dependency tree via bottom-sheet.)
3. **Plant detail redesign:** hero photo header (larger, edge-to-edge with gradient
   scrim), care facts as a horizontal stat strip (interval, moisture, light, feed
   cadence), schedule visual (next-due ring or bar showing position in the interval),
   collapsed history inline. Tap-to-edit stays.
4. **Card status line:** at-a-glance secondary line under the name — "Water due ·
   feed this time" / "Mist today" (ready for Phase 2 task types).
5. **List transitions & micro-motion:** layout animations on water/reorder
   (Reanimated layout transitions), skeleton rows during first cloud hydrate,
   pull-to-refresh on Plants, press-state polish pass on every touchable.
6. **Onboarding (first launch):** 2–3 screen intro (what makes the schedule adaptive),
   then "Add your first plant" with the search-as-you-type local DB front and center —
   the 350-profile instant match IS the wow moment; stage notification permission ask
   until after the first plant is added (contextual prompts convert far better).
7. **Empty/edge states pass:** every tab + filtered-empty already exist — refine copy
   and add a designed "first plant added, here's what happens next" state.

## Phase 2 — Expanded care tasks

Planta paywalls this; Plantaroo's version rides the existing event-anchored engine
(`app/src/logic/actions.ts` + `schedule.ts`).

- **New task types:** misting (humidity lovers), leaf cleaning (big-leaf plants,
  ~monthly), pruning check (seasonal), repot check (~12–18 months since
  `created_at` / last repot).
- **Data model:** optional per-plant fields (`mist_every_days`, `last_misted`,
  `clean_every_days`, `last_cleaned`, `last_pruned`, …). Next-due stays **computed,
  never stored**. Plants without a task type never show it — zero noise for the 80%
  of plants that only need water.
- **Profiles DB extension:** add misting/cleaning defaults to
  `app/src/logic/profiles.ts` rows (generated by Claude Code on subscription — $0).
  Calatheas/ferns/carnivores get misting; ficus/monstera/rubber plants get leaf
  cleaning.
- **Winter feed pause** (spec'd in `plant-app-spec.md`, never built): Nov–Feb for
  natural-light plants, double `feed_every_n_waterings` (or pause) — computed at
  display time like the seasonal multiplier, never stored.
- **UI:** secondary task rows on due cards (To Do + the Phase 1 care queue), new
  history event types (`Misted`, `Cleaned`, `Pruned`), history filter chips by
  action type, notifications include non-water tasks in the 9am digest
  (`app/src/logic/notify.ts`).
- Ships OTA.

## Phase 3 — Plant knowledge & troubleshooting (the $0 answer to AI features)

This is where Plantaroo matches the *value* of PictureThis/Planta's paid AI without
the cost: all knowledge is **bundled at build time**, generated by Claude Code on
subscription, offline forever.

1. **Rich profile fields** added to `profiles.ts` (or a parallel `careInfo.ts` keyed
   by the same names to keep the hot lookup lean): `light_needs` (low/medium/bright
   indirect/full sun), `humidity_pref`, `difficulty` (easy/moderate/fussy),
   `pet_toxic` (cats/dogs/none), `temp_range`, and 2–3 sentence `care_notes`.
2. **Plant detail "Care" section** renders the rich info — light placement advice,
   humidity guidance, **pet-toxicity warning** (subtle red text per design rules —
   huge for the cat/dog-owner segment, a top App Store review theme for competitors).
3. **Symptom troubleshooter ("What's wrong with my plant?"):** a rule-based decision
   tree — pick symptom (yellow leaves, brown tips, drooping, leggy growth, pests,
   mushy stems…) → 2–3 follow-up questions → diagnosis + fix, **informed by the
   plant's own data** ("You water every 4 days but Hoyas prefer drying out — likely
   overwatering"). That last part is something even PictureThis can't do, because it
   doesn't know real watering history. Pure bundled logic, ~40–60 rules.
4. **Difficulty/placement hints at add time:** "fussy — likes high humidity" badge in
   the add flow, so plant choice itself gets smarter.
- Ships OTA. Biggest content-generation effort, smallest code risk.

## Phase 4 — Growth journal

- **Per-plant photo timeline:** journal entries (photo and/or note + date) in a new
  subcollection `users/{uid}/journal/{idStr}` (fields: `id`, `plant_id`, `date`,
  `photo`, `note`). Separate docs keep plant docs far from Firestore's 1 MB cap;
  journal photos can afford ~800px (`expo-image-manipulator`, already a dependency)
  since each entry is its own doc.
- **Detail-view timeline:** scrollable photo strip oldest→newest; "then vs now"
  side-by-side for first/latest photos.
- **Milestone capture moments:** after repotting (and every ~30 days since last
  entry), the water flow offers a one-tap "Add a growth photo?" — gentle,
  dismissible, quiet-by-default.
- Journal entries appear in the History tab; wire through the existing `db*` layer
  (`app/src/data/db.ts`) + AsyncStorage mirror; add the subcollection to
  `firestore.rules` (owner-only) and the account-deletion wipe.
- Ships OTA (rules deploy via `firebase deploy --only firestore:rules`).

## Phase 5 — iOS platform presence **[build]**

The features that make the app feel installed-and-alive on the phone. Requires a new
native build — **confirm with Jamal before any `eas build`**.

1. **App icon badge** = due count (`expo-notifications` `setBadgeCountAsync`,
   updated on every reschedule) — actually OTA-able, ship it early with Phase 1 or 2.
2. **Notification actions:** "Mark watered" / "Snooze 1 day" buttons on the reminder
   via notification categories — handle in the response listener, write through the
   normal `waterPlant` action. (JS API, but test on a dev build.)
3. **Home-screen widget** (the real build driver): small/medium WidgetKit widget
   showing today's due count + next plants, via `@bacons/apple-targets` config plugin
   with a Swift widget reading a shared App Group JSON the app writes on every
   reschedule. Lock-screen accessory widget variant nearly free once the target
   exists. This is a visible, daily-touchpoint differentiator Greg charges for.
4. **Quick actions** (`expo-quick-actions` already installed): "Water due plants" /
   "Add plant" from the icon long-press — verify wired, finish if stubbed.
5. **Data export:** Settings row → share sheet with JSON (and CSV for plants) of the
   user's full subtree. Cheap trust feature; reviewers and power users ask for it.

---

## Sequencing & effort

| Phase | Depends on | Ships via | Rough size |
|---|---|---|---|
| 0. Housekeeping | — | OTA + config | S |
| 1. UI & usability | — | OTA | L (2–3 sessions) |
| 2. Care tasks | 1 (card/queue UI slots) | OTA | M |
| 3. Knowledge + troubleshooter | — | OTA | M (mostly content gen) |
| 4. Journal | — | OTA + rules deploy | M |
| 5. Platform presence | — (badge can ride Phase 1) | **EAS build** | M–L |

Recommended order: **0 → 1 → 2 → 3 → 4 → 5.** Phases 3 and 4 are independent of each
other and can swap; Phase 5 last so one build picks up everything native at once
(widget + notification-category testing + any new permissions).

## Out of scope (decided)

- Claude-vision plant ID & photo diagnosis — metered API money; the Phase 3
  troubleshooter is the $0 substitute. Revisit only if the $0 stance changes.
- Community/social features, weather-based outdoor adjustments, sensor integrations.
- The web `index.html` app — retired; no further feature work.
- Android polish beyond "doesn't crash" — iOS is the product for now.

## Invariants that must survive the upgrade

- Learning-model rules unchanged: rolling 5 valid gaps, clamp 0.5×–2× baseline,
  "too busy" gaps discarded, `learned_interval` and seasonal multiplier never mixed.
- `next_due`, feed flags, seasonal adjustments, and all new task due-dates are
  **computed, never stored**. Integer IDs via `genId()`; Firestore doc id =
  `String(id)`.
- All writes through `dbPut/dbAdd/dbDelete` (cache + Firestore + AsyncStorage mirror
  stay in sync); reads come from the in-memory cache.
- Per-user Firestore isolation (`firestore.rules`); new subcollections (journal) are
  owner-only and included in account deletion.
- Profiles/knowledge DB is bundled and generated by Claude Code on subscription —
  never a runtime API call. Strictly $0 to run.
- Design rules: no colored pills, no emoji, SVG icons, font weights ≤700, quiet by
  default — nothing demands attention unless it needs it.
- **Never re-add a migration that overwrites `last_watered`/`current_interval`
  unconditionally.** Ask Jamal before any `eas build` (limited quota).
