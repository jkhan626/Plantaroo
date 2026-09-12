# Plantaroo local AI bridge

A small Express server that gives the Plantaroo iOS app two AI features at $0 running cost, by
calling a vision model running locally in [Ollama](https://ollama.com) on Jamal's Windows PC:

- **`POST /api/identify`** — a photo in, plant candidates out.
- **`POST /api/profile`** — a plant name plus the owner's setup in, a Plantaroo care profile out.

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
  -> per-uid daily quota
  -> route
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

Inside `/api/identify` the same logic applies to the GPU: only cheap checks (payload length, data-URI
mime, base64 magic bytes) happen before the concurrency gate, and the base64 **decode** waits until a
generation slot is actually held. Otherwise eight queued requests would each sit on megabytes of
decoded image for the whole 15 s wait.

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
  "pot_size": "10 inch",
  "notes": "Near a south window"
}
```

- `light_type`: `grow` | `natural`
- `soil_type`: `chunky_aroid` | `orchid_bark` | `sphagnum_moss` | `regular_perlite` | `cactus_gritty` | `carnivore_peat`
- `name` ≤ 80 chars, `room` / `pot_size` ≤ 40, `notes` ≤ 300

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

**`species_baseline_days` is the species baseline only** — the days between waterings in a standard
well-draining mix under average indoor conditions during the growing season. The app applies its own
soil factor and seasonal multiplier on top, so the model is explicitly told not to bake soil or
season into that number. Light, soil, room and pot size shape `rationale`, `tips`, and genuine edge
cases (carnivores need distilled water, orchids use `orchid_30_10_10`, succulents feed rarely).

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
| > 20 identifies or > 80 profiles per uid per rolling 24 h | 429 | `{ "error": "rate_limited", "retry_after_s": N }` |
| 2 generations in flight and 8 already queued, or still waiting after 15 s | 503 | `{ "error": "busy" }` |
| Ollama slower than 50 s (identify) / 25 s + 15 s retry (profile) | 504 | `{ "error": "model_timeout" }` |
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

The app client allows **70 s for identify** and **60 s for profile**. Every server path fits inside
that:

| | queue wait | generation | worst case | client cap |
|---|---|---|---|---|
| identify | ≤ 15 s | ≤ 50 s | **65 s** | 70 s |
| profile | ≤ 15 s | ≤ 25 s + one ≤ 15 s retry | **55 s** | 60 s |

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

# profile, over Funnel
curl -s -X POST https://jamal.taila00dc9.ts.net/api/profile \
  -H "authorization: Bearer $ID_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Pothos","light_type":"grow","soil_type":"regular_perlite"}'
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

No server, no network, no Ollama: it pins the client-IP derivation table above (forwarded IP wins,
garbage falls back to the socket address, a non-loopback peer ignores the header) and the
`DEV_ALLOW_NO_AUTH` rule that it must not follow.

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

Fixture photos come from **Wikimedia Commons only** (stable `Special:FilePath` URLs, freely licensed)
and are downloaded into the gitignored `test/fixtures/` on first use — there is no dependency on the
untracked repo-root `plant-images.json`.

The per-IP limiter check runs **last** and empties that bucket on purpose, so wait ~60 s between
runs or the next one starts rate-limited. It empties the loopback client bucket (the smoke test sends
no `X-Forwarded-For`), and spends ~30 of the 240 global tokens, so several back-to-back runs can also
brush the global backstop.

The first model call after a pull or a reboot is the slow one — the weights have to load into VRAM.
Warm calls are several times faster.
