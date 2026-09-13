# Plantaroo local AI bridge

A small Express server that gives the Plantaroo iOS app two AI features at $0 running cost, by
calling a vision model running locally in [Ollama](https://ollama.com) on Jamal's Windows PC:

- **`POST /api/identify`** — a photo in, plant candidates out.
- **`POST /api/profile`** — a plant name plus the owner's setup and pot in, a Plantaroo care
  profile out.
- **`POST /api/diagnose`** — a photo plus the plant's real watering history in, a health check out.

The app reaches it over **Tailscale Funnel** (`https://jamal.taila00dc9.ts.net` → `localhost:3100`),
so every request is treated as public internet traffic: a per-IP token bucket in front of everything,
a valid Firebase ID token required on `/api/*`, per-user daily quotas, hard caps on body size, image
bytes and pixel dimensions, and at most two model generations at a time with a bounded wait queue.

Nothing here touches `app/` or `server/` — it is a standalone service.

## Requirements

- Node 20+
- Ollama installed and running (`http://127.0.0.1:11434`)
- The model pulled: `ollama pull qwen2.5vl:7b` (~6 GB, fits the RTX A2000's 12 GB VRAM)

## Setup

```bash
cd local-ai
npm install
cp .env.example .env     # then edit if you want non-default values
```

## Run

```bash
node server.js           # or: npm start
```

`start.cmd` does the same thing and `cd`s to its own folder first, so it works as the action of a
Windows scheduled task. On this machine that task is **"Plantaroo Local AI"**, which runs
`start-hidden.vbs` (no console window) and redirects output to `server.log`:

```powershell
Stop-ScheduledTask -TaskName "Plantaroo Local AI"
# Find it BY PORT. `Stop-ScheduledTask` does not kill the node process: the task's
# action (wscript -> cmd -> node) has already exited, so node is orphaned and no
# longer a task descendant. And its command line is just "node server.js" — the
# folder appears only in its working directory — so filtering CommandLine for
# "local-ai" matches nothing and silently leaves the old server running.
Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Start-ScheduledTask -TaskName "Plantaroo Local AI"
Start-Sleep -Seconds 5
(Invoke-WebRequest http://127.0.0.1:3100/health -UseBasicParsing).Content   # {"ok":true,"ollama":true}
```

The server binds `127.0.0.1:3100` by default. Tailscale Funnel forwards to localhost, so there is no
reason to expose the port on the LAN. Set `HOST=0.0.0.0` in `.env` only if you need that.

## Request pipeline

The middleware order is load-bearing, not incidental:

```
cors
  -> per-client token bucket    (30 req/min per client IP, ALL routes incl. /health)
  -> global token bucket        (240 req/min across all clients, same coverage)
  -> GET /health                (no auth, no body parser)
  -> requireAuth                (HEADERS ONLY — runs before any body is read)
  -> Content-Type: json check   (after auth, so anonymous callers get a bare 401)
  -> express.json (4 MB limit)
  -> route
       validate body / cheap image checks
         -> per-uid daily quota    (charged only once the body is known to be good)
         -> GPU gate
         -> base64 decode
         -> generate
```

Auth before the body parser is deliberate: an unauthenticated 4 MB POST must cost a 401 and nothing
else — no JSON parse, no multi-megabyte string built on an attacker's behalf. Three things make that
observable:

- the status is **401, not 413** — if `express.json` ran first it would have size-checked the body
  and answered `413 image_too_large` (which is exactly what it used to do);
- the 401 comes back in single-digit milliseconds rather than after the upload finishes;
- `express.json`'s `verify` hook logs one `{"evt":"body_read","bytes":N}` line per parsed body, and
  no such line appears for a rejected request. `GET /api/status` totals the same numbers in
  `counters.json_bodies` / `counters.json_bytes`.

**The per-uid daily quota is charged late, on purpose.** It is not middleware: each route spends a
token by hand, *after* its body validation and cheap image precheck have passed and *before* the GPU
gate. A request that fails validation costs a `400` and no quota — an app bug that sends the wrong
enum, or a retry loop on a malformed body, cannot quietly eat a user's 20 diagnoses for the day.
Nothing is given away by the reordering: a flood of invalid bodies from a valid token is still bounded
by the per-client (30/min) and global (240/min) buckets at the very front of the pipeline, which do
not care whether a request is well-formed, and nothing expensive — a GPU slot, a base64 decode, a
generation — can happen on an uncharged request. `npm run test:quota` pins the ordering.

Inside `/api/identify` and `/api/diagnose` the same logic applies to the GPU: only cheap checks
(payload length, data-URI mime, base64 magic bytes) happen before the concurrency gate, and the
base64 **decode** waits until a generation slot is actually held. Otherwise eight queued requests
would each sit on megabytes of decoded image for the whole 15 s wait.

## Endpoints

### `GET /health` (no auth)

```json
{ "ok": true, "ollama": true }
```

`ollama` is `true` only when the daemon answers **and** the configured model is present locally. The
probe result is cached for 15 seconds, so hammering `/health` does not turn into an equal number of
requests to the Ollama daemon. The body is intentionally just these two fields — an unauthenticated
caller learns liveness and nothing about the machine (no model name, no uptime).

### `GET /api/status` (auth required)

The diagnostic version of `/health`: model name and presence, uptime, Node version, live GPU gate
state (`active` / `waiting` / `max_queue`), the configured timeouts, both rate limiters' state
(`ip_limit` / `global_limit`), the caller's derived `client_ip`, request counters, and the Firebase
cert-cache state.

### `POST /api/identify`

Request:

```json
{ "image": "data:image/jpeg;base64,/9j/4AAQ..." }
```

`image` may be a data URI or bare base64. JPEG and PNG only; the decoded image must be ≤ 2 MB **and**
≤ 4096 px on each side (dimensions are read straight from the PNG `IHDR` chunk or the JPEG `SOFn`
marker — a 2 MB payload can still be a 20000 × 20000 canvas, and the vision model's cost scales with
pixels, not bytes).

Response:

```json
{
  "candidates": [
    { "common_name": "Monstera Deliciosa", "scientific_name": "Monstera deliciosa", "confidence": 0.95 }
  ],
  "notes": "Deeply lobed, fenestrated leaves on thick petioles."
}
```

1–3 candidates, best first. If the photo is not a plant, `candidates` is `[]` and `notes` says why.
The image is never written to disk and never logged.

### `POST /api/profile`

Request (`name`, `light_type` and `soil_type` are required):

```json
{
  "name": "Monstera Deliciosa",
  "scientific_name": "Monstera deliciosa",
  "light_type": "natural",
  "soil_type": "chunky_aroid",
  "room": "Living room",
  "pot_size": "medium",
  "pot_material": "terracotta",
  "pot_drainage": true,
  "notes": "Near a south window"
}
```

- `light_type`: `grow` | `natural`
- `soil_type`: `chunky_aroid` | `orchid_bark` | `sphagnum_moss` | `regular_perlite` | `cactus_gritty` | `carnivore_peat`
- `name` ≤ 80 chars, `room` ≤ 40, `notes` ≤ 300

**Pot (all three optional, absent = unknown):**

| Field | Values | Meaning |
|---|---|---|
| `pot_size` | `small` \| `medium` \| `large` | under 4 in / 10 cm · 4–8 in · over 8 in |
| `pot_material` | `terracotta` \| `plastic` \| `glazed` \| `other` | `terracotta` means unglazed and porous |
| `pot_drainage` | `true` \| `false` | whether the pot has a drainage hole |

`pot_size` used to be free text (`"10 inch"`) and is now an **enum** — anything else is a `400`. All
three are validated strictly: `pot_drainage` must be a real JSON boolean, not `"true"`. Whatever is
left out stays unknown, and the prompt tells the model to assume the ordinary case for just that
part (and a medium plastic pot with drainage when nothing at all was given).

Response:

```json
{
  "species_baseline_days": 7,
  "moisture_pref": "light_dry",
  "feed_every_n_waterings": 4,
  "fert_type": "balanced",
  "carnivore": false,
  "water_source": "tap_ok",
  "mist_every_days": null,
  "clean_every_days": 30,
  "rationale": "Natural light and a chunky aroid mix dry fast, so water when the top inch is dry.",
  "tips": ["Wipe the leaves monthly", "Give it something to climb"]
}
```

**`species_baseline_days` is the baseline for this plant _in its pot_** — the days between waterings
in a standard well-draining mix under average indoor conditions during the growing season, in the pot
described by the request (or a medium plastic pot with drainage when none was given). The app applies
its own soil factor and seasonal multiplier on top, so the model is still explicitly told **not** to
bake the potting medium or the season into that number.

The pot is the one setup field that legitimately moves the baseline, because it decides how fast the
water actually leaves:

| Pot | Effect on `species_baseline_days` |
|---|---|
| unglazed terracotta (porous, wicks water out) | **shorter** |
| small (little reservoir) | **shorter** |
| large (deep reservoir) | **longer** |
| glazed ceramic or plastic (sealed) | **longer** than terracotta |
| no drainage hole | **longer** still, and the advice turns cautious |

The model is also told not to stack those into an absurd number: a small terracotta pot rarely more
than halves the species figure, a large glazed pot with no drainage rarely more than doubles it.
Light, soil and room still shape only `rationale`, `tips`, and genuine edge cases (carnivores need
distilled water, orchids use `orchid_30_10_10`, succulents feed rarely) — never the baseline. When any
pot detail is given, `rationale` must mention the pot; when the pot has **no drainage hole**, one tip
must warn about it.

### `POST /api/diagnose`

A photo health check. Same auth, same image rules as `/api/identify` (data URI or bare base64,
JPEG/PNG, ≤ 2 MB decoded, ≤ 4096 px a side). The difference is that the model is also handed the
plant's real watering record, so it can reason about the photo and the history together rather than
guessing from pixels alone.

Request (everything except `scientific_name` and `notes` is required):

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "name": "Citrus Seedling",
  "scientific_name": "Citrus aurantium",
  "light_type": "natural",
  "soil_type": "regular_perlite",
  "moisture_pref": "light_dry",
  "days_since_watered": 1,
  "current_interval": 5,
  "watering_count": 41,
  "recent_events": [
    { "type": "water", "days_ago": 1 },
    { "type": "still_wet", "days_ago": 6 },
    { "type": "too_busy", "days_ago": 24 }
  ],
  "season": "summer",
  "pot_size": "small",
  "pot_material": "terracotta",
  "pot_drainage": true,
  "carnivore": false,
  "notes": "One leaf has gone pale yellow with green veins."
}
```

| Field | Rule |
|---|---|
| `image` | required; identical rules to `/api/identify` |
| `name` | required, ≤ 80 chars |
| `scientific_name` | optional, ≤ 120 chars |
| `light_type` | `grow` \| `natural` |
| `soil_type` | the six `SoilType` values (see `/api/profile`) |
| `moisture_pref` | `moist` \| `light_dry` \| `moderate_dry` \| `full_dry` |
| `days_since_watered` | number ≥ 0, or `null` for "never watered in the app" |
| `current_interval` | number ≥ 1 — the app's current learned/base interval in days |
| `watering_count` | number ≥ 0 |
| `recent_events` | array, **≤ 10**, most recent first; `{ "type": "water"\|"skip"\|"still_wet"\|"too_busy", "days_ago": number }`. Optional — absent means `[]` |
| `season` | `winter` \| `spring` \| `summer` \| `fall` |
| `pot_size` | optional, `small` \| `medium` \| `large` — the same three enums as `/api/profile` |
| `pot_material` | optional, `terracotta` \| `plastic` \| `glazed` \| `other` |
| `pot_drainage` | optional, `true` \| `false` |
| `carnivore` | optional, `true` \| `false` — the flag the app already stores for this plant |
| `notes` | optional, ≤ 300 chars |

**The pot is context for the watering verdict, not decoration.** The pot decides how fast the water
actually leaves, so the same nine-day gap means different things in different pots, and the prompt
says so: unglazed terracotta wicks moisture out through its walls and dries **faster** than the
interval alone suggests (which also makes soggy soil in a terracotta pot a strong overwatering
signal); a small pot runs out sooner; a large one stays wet deep in the middle long after the surface
looks dry; glazed ceramic and plastic seal the water in; and **no drainage hole** means excess water
cannot escape at all, so root rot leads the list of risks. The model is told to weigh the gap since
the last watering against how fast *this* pot dries rather than against the interval in isolation.

Unlike `/api/profile`, anything the app leaves out is **not** filled in with an assumption: diagnose
has the photo, so the model is told to read the pot there first and only fall back to "an ordinary
medium plastic pot with a drainage hole" when it cannot see one.

`carnivore` is the flag the app already stores on the plant. It is only ever an *extra* signal — the
server treats the plant as carnivorous if the flag is `true` **or** the potting medium is
`carnivore_peat` **or** the name matches a bog genus, so `carnivore: false` cannot switch the
protection off for something that is plainly a Venus fly trap. When any of the three fires, the
prompt states it as a fact up front as well as relying on rule 7.

Request validation is strict: a bad enum, a string where a number belongs, or an 11th event is a
`400` with a `detail` naming the field (`recent_events[3].type must be one of: ...`) rather than
something quietly reinterpreted. Model *output* is the opposite — coerced and clamped, never
rejected for a near-miss.

**The event types are explained to the model,** because two of them mean opposite things:

| Event | What the model is told |
|---|---|
| `water` | a watering |
| `skip` | the owner deliberately skipped a scheduled watering |
| `still_wet` | the schedule said water, the owner found the soil **still wet**. Real evidence about the *plant*: it is being scheduled too often, or this pot and medium dry more slowly than assumed |
| `too_busy` | the watering ran late for **human** reasons. Evidence about the *owner*, not the plant — never to be read as the plant tolerating drought |

Response:

```json
{
  "summary": "The plant shows signs of overwatering with pale yellow leaves. Check watering frequency.",
  "watering_verdict": "likely_overwatered",
  "observations": ["Pale yellow leaf with green veins"],
  "likely_causes": [{ "cause": "Repeated 'still wet' events", "confidence": 0.8 }],
  "actions": ["Check soil moisture", "Consider a longer watering interval"],
  "confidence": 0.8,
  "not_a_plant": false
}
```

| Field | Guarantee |
|---|---|
| `summary` | non-empty, ≤ 200 chars, trimmed on a word boundary |
| `watering_verdict` | exactly one of `likely_overwatered`, `likely_underwatered`, `watering_ok`, `unclear` |
| `observations` | ≤ 4 strings, ≤ 120 chars each, deduped, no empties |
| `likely_causes` | ≤ 3 `{cause, confidence}`, `cause` ≤ 80 chars, `confidence` 0–1, **sorted best first**, deduped |
| `actions` | ≤ 3 strings, ≤ 140 chars each, deduped |
| `confidence` | 0–1 (a percentage is rescaled; a non-numeric answer falls back to 0.5) |
| `not_a_plant` | boolean |

**`not_a_plant: true`** forces `watering_verdict: "unclear"` and empties all three arrays, whatever
else the model said; `summary` explains what the photo appears to show instead. It is the one place a
value is invented rather than coerced: if the model flags "not a plant" but leaves `summary` blank,
the server fills in a fixed sentence rather than answering `502` — "that isn't a plant" is a
complete, useful reply and the user should get it.

The prompt tells the model to reason from **both** the photo and the record, to say so when the photo
is ambiguous rather than guess, to be conservative ("Consider …", "Check …", never "you must"), never
to name a medicine, pesticide or commercial product, and never to suggest fertilizer or tap water for
a carnivorous plant. That last one is enforced in code as well: when **any** of the three signals fires
(the request's `carnivore: true`, a `carnivore_peat` potting medium, or a name or scientific name
matching a carnivorous genus or common name), any `action` recommending fertilizer or tap water is
dropped (an action *warning against* them survives), and any `likely_cause` mentioning either is
dropped outright — "nutrient deficiency from never fertilizing" reads as a warning but is really an
argument for feeding, which is the one thing a bog plant's owner must not be told.

One more guardrail worth knowing about: the model's first instinct was to answer `likely_overwatered`
for a visibly healthy plant purely because it had been watered on schedule. The prompt now says
explicitly that a record which simply follows the app's own interval is **normal**, and that an
over/under verdict needs the photo or a `still_wet` / late-watering pattern behind it.

Unusable model output gets one corrective retry, then `502 { "error": "model_output_invalid" }`. The
retry deliberately re-sends **text only, not the photo**: the model has already made its findings and
only has to re-emit them in the right shape, and a second vision-encode pass would not fit the
timeout budget.

Logging is deliberately minimal here — a health check is about the user's own plant and its problems,
so the success line carries `uid`, `ms` and `verdict` and nothing else. No plant name, no summary, no
observations, and (as everywhere) never the image.

### Server-side clamping

The model is never trusted. Integers are rounded into range, enums must match exactly (a short alias
list absorbs near-misses), `mist_every_days` and `clean_every_days` are `null` or **1–90** (the same
range the app clamps them to), `species_baseline_days` is 1–90, and `rationale` is trimmed to 220
characters on a word boundary. Unusable model output gets one corrective retry, then
`502 { "error": "model_output_invalid" }`.

**The carnivore rule is absolute.** Whenever `carnivore` comes back `true`, the server overwrites the
model's answer with all five of these, every time, with no exceptions:

| Field | Forced value |
|---|---|
| `moisture_pref` | `moist` |
| `species_baseline_days` | clamped to **≤ 3** |
| `water_source` | `distilled_or_rain` |
| `fert_type` | `none` |
| `feed_every_n_waterings` | `0` |

Bog plants (Nepenthes, Sarracenia, Dionaea, Drosera, Pinguicula, Utricularia) must never dry out and
must never be fed or given tap water. The model routinely answers `light_dry` with a 7-day baseline
while its own rationale says "keep constantly moist"; letting that reach the app would kill the
plant. Tips that the forced fields have made false (feeding advice, "use tap water", misting when
`mist_every_days` is null) are dropped from `tips` for the same reason.

## Auth

Every `/api/*` route needs `Authorization: Bearer <Firebase ID token>`.

Tokens are verified as RS256 against Google's published X.509 certs
(`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`), cached
by `kid` for the duration of the response's `Cache-Control: max-age` and refetched (throttled) when
an unknown `kid` shows up. `aud` must equal `FIREBASE_PROJECT_ID`, `iss` must be
`https://securetoken.google.com/<project>`, `sub` must be non-empty, and the token must not be
expired. **No service account or private key is needed.**

If a cert refetch fails but a previous cert set is in hand, the server **keeps using the cached
certs** and logs a warning (`reason: "cert_refresh_failed"`), retrying no more than every 30 s.
Firebase's signing keys stay valid well past the cache window, so a Google outage or a DNS blip must
not turn into a total auth outage. The only fail-closed case is having no certs at all — a cold start
with no network.

Failures return `401 { "error": "unauthorized" }` with no detail.

### `DEV_ALLOW_NO_AUTH` — the one real footgun

`DEV_ALLOW_NO_AUTH=1` **disables auth for loopback callers, and Funnel-proxied requests ARE
loopback** — `tailscaled` terminates the public TLS connection on this machine and proxies to
`127.0.0.1`, so a request from anywhere on the internet is indistinguishable from one typed on the
console. Loopback here means "reached this process", not "came from this machine".

Two guards make that concrete. First, the exemption uses the **raw socket address** — never the
derived client IP — and is additionally refused whenever an `X-Forwarded-For` header is present at
all, even an empty or malformed one: a header means a proxy is in the path, so the caller is not
sitting at the console. Those requests get a normal `401` and log `reason: "no_bearer_proxied"`.

**Never set this on the exposed machine.** Second guard: the server refuses to start (exit 1) when
`DEV_ALLOW_NO_AUTH=1` and `tailscale funnel status` reports anything other than `No serve config`. If
the tailscale binary cannot be found it warns instead of failing; if the check cannot be read at all
(timeout) it fails closed. Override the binary path with `TAILSCALE_EXE`.

## Limits and errors

| Condition | Status | Body |
|---|---|---|
| > 30 requests per minute from one client IP (all routes, incl. `/health`) | 429 | `{ "error": "rate_limited", "retry_after_s": N }` |
| > 240 requests per minute across all clients (all routes, incl. `/health`) | 429 | `{ "error": "rate_limited", "retry_after_s": N }` |
| Bad/missing token | 401 | `{ "error": "unauthorized" }` |
| Invalid field / enum / non-JSON body | 400 | `{ "error": "bad_request", "detail": "..." }` |
| Decoded image > 2 MB, > 4096 px a side, or body > 4 MB | 413 | `{ "error": "image_too_large" }` |
| > 20 identifies, > 80 profiles or > 20 diagnoses per uid per rolling 24 h (three separate buckets; **only requests that passed validation are counted**) | 429 | `{ "error": "rate_limited", "retry_after_s": N }` |
| 2 generations in flight and 8 already queued, or still waiting after 15 s | 503 | `{ "error": "busy" }` |
| Ollama slower than 50 s (identify) / 25 s + 15 s retry (profile) / 35 s + 15 s retry (diagnose) | 504 | `{ "error": "model_timeout" }` |
| Model returned unusable JSON after one retry | 502 | `{ "error": "model_output_invalid" }` |
| Ollama down or erroring | 502 | `{ "error": "model_unavailable" }` |

### Rate limiters: per-client and global

Two token buckets, both ahead of auth, so they are the only limits that apply to unauthenticated
traffic:

| Bucket | Capacity | Key | Purpose |
|---|---|---|---|
| per-client | 30 / min | derived client IP | one caller cannot starve the others |
| global | 240 / min | fixed (all requests) | backstop that does not trust any header |

A burst of 30 from one client is fine, then it refills at one every two seconds; the global bucket
refills at four per second. Per-client is checked first, so an already-rejected request does not spend
a global token. Client buckets are tracked in a bounded LRU of 5000 keys, so an unbounded key space
(which is what the internet is, now that Funnel is unwrapped) still cannot grow memory without limit.

#### How the client IP is derived (`lib/clientip.js`)

`tailscaled` terminates the public TLS connection **on this machine** and proxies to `127.0.0.1`, so
`socket.remoteAddress` is loopback for every Funnel request. Keying on it meant the entire internet
shared one 30 req/min bucket. Tailscale serve/funnel does set `X-Forwarded-For` (plus
`X-Forwarded-Proto` and `X-Forwarded-Host`) to the real client address, so that is what the key comes
from:

| Peer (`socket.remoteAddress`) | `X-Forwarded-For` | Key used |
|---|---|---|
| loopback | a valid IP literal | that IP |
| loopback | several hops | the **last** hop (the one the trusted proxy wrote) |
| loopback | absent | the socket address |
| loopback | garbage / empty / `addr:port` / hostname | the socket address |
| not loopback | anything | the socket address — **header ignored** |

The **last** value is the right one: the trusted proxy (`tailscaled`) writes the last hop whether it
replaces the inbound header or appends to it, so that hop is the address it observed and can never be
supplied by the client. Candidates are trimmed and validated with
`net.isIP` before use, so a malformed header cannot mint arbitrary bucket keys — it falls back to the
shared loopback bucket instead.

Scope is deliberately narrow. Express `trust proxy` stays **off**, so `req.ip` / `req.ips` /
`req.protocol` keep reporting raw socket facts and no framework behaviour quietly starts depending on a
header. The derived IP feeds the rate limiters and the `ip` field in the structured logs
(`rate_limited`, `auth_fail`) — nothing else. It never gates authorization, and it is not what
`DEV_ALLOW_NO_AUTH` looks at (see below). If a future ingress ever *appended* to `X-Forwarded-For`
instead of replacing it, the worst case is a flooder splitting itself across many per-client buckets —
which is precisely what the global bucket is there to catch.

The last hop is the one the trusted proxy wrote whether it replaces or appends, so it is never
attacker-chosen. A header arriving with **more than one hop** is still logged as
`reason: "forwarded_for_multi_hop"` for visibility (a second proxy, or an appending ingress).

Rate-limit rejections and that warning are logged at most once per 5 s per kind, with a
`suppressed_since_last` count, so a flood is visible in `server.log` without being able to fill the
disk. `GET /api/status`
shows both buckets' configuration, the number of tracked client keys, the caller's own derived IP, and
the `ip_limited` / `global_limited` counters.

### Timeout budget

The app client allows **70 s for identify**, **60 s for profile** and **70 s for diagnose**. Every
server path fits inside that:

| | queue wait | generation | worst case | client cap |
|---|---|---|---|---|
| identify | ≤ 15 s | ≤ 50 s | **65 s** | 70 s |
| profile | ≤ 15 s | ≤ 25 s + one ≤ 15 s retry | **55 s** | 60 s |
| diagnose | ≤ 15 s | ≤ 35 s + one ≤ 15 s retry | **65 s** | 70 s |

Diagnose fits the same 65 s worst case as identify despite also retrying, because its retry re-sends
text only — no second vision-encode pass.

`server.requestTimeout` and `server.headersTimeout` are both 80 s, just outside the worst case.
**Changing any of these means changing the client's timeouts to match.**

If the client hangs up mid-request, the Ollama call is aborted via an `AbortController` and the GPU
slot is released immediately — a user who backgrounds the app must not hold one of two slots for 50 s
of generation nobody will read. A request that is already waiting in the gate queue is dropped from
it on disconnect rather than being handed a slot it cannot use.

Rate limits and the concurrency gate are in-memory, so a restart clears them. `keep_alive: -1` keeps
the model resident in VRAM between requests, which is what makes warm calls fast.

Logs are single-line JSON on stdout: uid, derived client `ip`, latency, body byte count, and the top
candidate name — never the image, never a prompt, never a stack trace to the client.

## Env vars

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3100` | listen port |
| `HOST` | `127.0.0.1` | bind address |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama base URL |
| `MODEL` | `qwen2.5vl:7b` | model used by both endpoints |
| `FIREBASE_PROJECT_ID` | `plantaroo-204ca` | accepted token audience/issuer |
| `DEV_ALLOW_NO_AUTH` | `0` | `1` = no auth for loopback callers. Funnel traffic IS loopback — never set on the exposed machine |
| `TAILSCALE_EXE` | `C:\Program Files\Tailscale\tailscale.exe` | binary used by the `DEV_ALLOW_NO_AUTH` startup guard |

## Testing with curl

```bash
# health (no auth)
curl -s http://127.0.0.1:3100/health

# detailed status (auth)
curl -s -H "authorization: Bearer $ID_TOKEN" http://127.0.0.1:3100/api/status

# identify
B64=$(base64 -w0 test/fixtures/monstera.jpg)
curl -s -X POST http://127.0.0.1:3100/api/identify \
  -H "authorization: Bearer $ID_TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"image\":\"data:image/jpeg;base64,$B64\"}"

# profile, over Funnel, with pot details
curl -s -X POST https://jamal.taila00dc9.ts.net/api/profile \
  -H "authorization: Bearer $ID_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Pothos","light_type":"grow","soil_type":"regular_perlite",
       "pot_size":"small","pot_material":"terracotta","pot_drainage":true}'

# diagnose
B64=$(base64 -w0 test/fixtures/chlorosis.jpg)
curl -s -X POST http://127.0.0.1:3100/api/diagnose \
  -H "authorization: Bearer $ID_TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"image\":\"data:image/jpeg;base64,$B64\",
       \"name\":\"Citrus Seedling\",\"light_type\":\"natural\",
       \"soil_type\":\"regular_perlite\",\"moisture_pref\":\"light_dry\",
       \"days_since_watered\":1,\"current_interval\":5,\"watering_count\":41,
       \"recent_events\":[{\"type\":\"still_wet\",\"days_ago\":6}],
       \"season\":\"summer\",\"pot_size\":\"small\",
       \"pot_material\":\"terracotta\",\"pot_drainage\":true}"
```

Simulating a Funnel client from loopback — useful for checking that the per-client bucket really is
per-client. The first burst 429s while the second, claiming a different client, still gets 200:

```bash
for i in $(seq 1 35); do
  curl -s -o /dev/null -w '%{http_code} ' -H 'X-Forwarded-For: 203.0.113.9' \
    http://127.0.0.1:3100/health
done; echo
curl -s -o /dev/null -w 'other client: %{http_code}\n' -H 'X-Forwarded-For: 198.51.100.7' \
  http://127.0.0.1:3100/health
```

(Reaching the server over Funnel makes this moot — `tailscaled` sets the header itself and replaces
anything the client sent.)

## Unit tests

```bash
npm test                            # node --test test/unit.mjs
```

No server, no network, no Ollama (58 tests). It pins the client-IP derivation table above (forwarded
IP wins, garbage falls back to the socket address, a non-loopback peer ignores the header), the
`DEV_ALLOW_NO_AUTH` rule that it must not follow, and the validation/clamping layer: the pot enums on
**both** `/api/profile` and `/api/diagnose` (including that `pot_drainage: false` survives as `false`
rather than collapsing into "unknown"), the whole `/api/diagnose` request contract, and every clamp on
diagnose output — the 200-char summary, the verdict aliases, the 4/3/3 caps with dedupe, best-first
cause ordering, confidence coercion, the `not_a_plant` override, and the carnivore advice filter.

For the diagnose pot and carnivore context specifically it checks that the pot reaches the prompt as
*drying* context (not just as a listed fact), that an unspecified pot sends the model to the photo
while `/api/profile` keeps its own "assume a medium plastic pot" wording, that a carnivore is stated
as a fact when the flag **or** the `carnivore_peat` medium says so, and that the three-signal
`carnivore` rule holds — including that `carnivore: false` cannot unset a Venus fly trap.

## Quota-ordering check

```bash
npm run test:quota                  # or: node test/quota-order.mjs
```

Pins the one rule that unit tests cannot reach — **a per-uid daily quota is spent only by requests
that passed validation** — because the thing being asserted is the order of statements inside an
Express route, and `server.js` starts listening at import time.

It spawns its **own** server and never touches the live one: port `3199`, `DEV_ALLOW_NO_AUTH=1` with
`TAILSCALE_EXE` pointed at a path that does not exist (so the Funnel guard takes its "cannot verify"
branch and warns instead of refusing to start), and `OLLAMA_URL` pointed at a closed port so a request
that gets past the quota fails immediately with `502 model_unavailable` instead of holding the GPU for
35 s. That `502` is the proof: it means the request was charged and reached generation.

Per endpoint (`/api/diagnose` and `/api/identify`, both 20/day), in a fresh server process so their
per-client buckets cannot pool:

1. five malformed bodies → `400` each, and they must cost no quota;
2. twenty well-formed bodies → `502` each, and **none** may be `429` (with the limiter in front of
   validation the last five were, because the rejects had already spent five tokens);
3. one more → `429` with `retry_after_s` and a `Retry-After` header, proving the allowance is real
   and exactly 20 valid calls fit inside it.

26 requests per endpoint stays under the per-client bucket's 30/min. `/api/profile` is not covered —
its 80/day allowance would need 86 requests — but its charge site is line-for-line the same.

## Smoke test

```bash
npm run smoke                       # or: node test/smoke.mjs
ID_TOKEN=<firebase id token> npm run smoke
BASE_URL=https://jamal.taila00dc9.ts.net ID_TOKEN=<token> npm run smoke
```

It auto-detects one of three modes and says which it picked:

- **TOKEN** — `ID_TOKEN` is set and accepted. Runs everything, and works against the
  production-mode server and over Funnel.
- **DEV** — the server is running with `DEV_ALLOW_NO_AUTH=1` (detected by probing `/api/status`
  unauthenticated). Runs everything.
- **NO-TOKEN** — neither. `/api/identify` and `/api/profile` are reported as `[SKIP]` with an
  explanation, and everything reachable without credentials is still checked.

Checks in every mode: `/health` returns `ok:true` + `ollama:true` and **only** those two keys, the
second `/health` is served from the 15 s cache, a missing and a garbage bearer token both get 401, an
oversized unauthenticated body gets **401 and not 413** (proving auth runs before the body parser), an
unknown route gets 404, and a 60-request burst trips the per-IP limiter with a `429` carrying
`retry_after_s`.

Additionally in TOKEN/DEV mode: three fixture identifies, a 2.4 MB image → 413, a 20000 × 20000 PNG in
2 KB → 413, four profiles (including plants no static database would carry, like Hoya Kerrii and
Alocasia Dragon Scale), every carnivore field asserted on a Cape Sundew, `mist`/`clean` in 1–90, and a
bad enum → 400.

Plus, for the pot and diagnose work:

- **the same plant in opposite pots** — one small unglazed terracotta pot with drainage, one large
  glazed pot without. The terracotta baseline must come back **shorter than or equal to** the glazed
  one, the terracotta rationale must mention the pot, and the no-drainage answer must warn about it
  somewhere. Free-text `pot_size: "4 inch"` must be a 400.
- **two diagnose photos** — the healthy monstera fixture (expected to read as fine) and a Wikimedia
  photo of a potted citrus seedling with clear interveinal chlorosis, sent with a history containing
  two `still_wet` events. Every field of the response is asserted against the caps in the table
  above, including that `likely_causes` comes back best-first.
- **diagnose request validation** — a bad `recent_events[].type` and a missing `season` each get a
  `400` naming the field.

Fixture photos come from **Wikimedia Commons only** (stable `Special:FilePath` URLs, freely licensed)
and are downloaded into the gitignored `test/fixtures/` on first use — there is no dependency on the
untracked repo-root `plant-images.json`. The diagnose fixture is
`Chlorose ferrique sur Citrus aurantium.jpg`, saved as `chlorosis.jpg`.

The per-IP limiter check runs **last** and empties that bucket on purpose, so wait ~60 s between
runs or the next one starts rate-limited. It empties the loopback client bucket (the smoke test sends
no `X-Forwarded-For`), and spends ~30 of the 240 global tokens, so several back-to-back runs can also
brush the global backstop.

The first model call after a pull or a reboot is the slow one — the weights have to load into VRAM.
Warm calls are several times faster.
