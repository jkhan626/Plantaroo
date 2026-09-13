/**
 * Local AI service client — photo identification + AI-tailored care profiles.
 * Talks to the local-ai server (Ollama-backed) over Jamal's Tailscale net.
 * Every call requires a signed-in Firebase user (Authorization: Bearer <ID token>).
 *
 * Contract: never throw to the UI. Every export resolves to a typed result
 * so callers can render a quiet fallback instead of an error.
 */
import { currentUser } from './auth';
import type { MoisturePref, FertType, WaterSource, SoilType, LightType, PotSize, PotMaterial } from '../types';

export const LOCAL_AI_URL = 'https://jamal.taila00dc9.ts.net';

export type LocalAiFailureReason = 'offline' | 'rate_limited' | 'busy' | 'not_plant' | 'error';

export type LocalAiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: LocalAiFailureReason; retryAfterS?: number };

export interface IdentifyCandidate {
  common_name: string;
  scientific_name: string;
  confidence: number; // 0–1
}

export interface IdentifyResult {
  candidates: IdentifyCandidate[];
  notes: string;
}

export interface AiProfile {
  species_baseline_days: number;
  moisture_pref: MoisturePref;
  feed_every_n_waterings: number;
  fert_type: FertType;
  carnivore: boolean;
  water_source: WaterSource;
  mist_every_days: number | null;
  clean_every_days: number | null;
  rationale: string;
  tips: string[];
}

export interface ProfileParams {
  name: string;
  scientific_name?: string;
  light_type: LightType;
  soil_type: SoilType;
  room?: string;
  pot_size?: PotSize;
  pot_material?: PotMaterial;
  pot_drainage?: boolean;
  notes?: string;
}

export type WateringVerdict = 'likely_overwatered' | 'likely_underwatered' | 'watering_ok' | 'unclear';

export interface DiagnoseEvent {
  type: 'water' | 'skip' | 'still_wet' | 'too_busy';
  days_ago: number;
}

export interface DiagnoseParams {
  image: string; // data URI, jpeg, 768px
  name: string;
  scientific_name?: string;
  light_type: LightType;
  soil_type: SoilType;
  moisture_pref: MoisturePref;
  days_since_watered: number | null;
  current_interval: number;
  watering_count: number;
  recent_events: DiagnoseEvent[]; // <=10, most recent first
  season: 'winter' | 'spring' | 'summer' | 'fall';
  notes?: string; // <=300 chars
  pot_size?: PotSize;
  pot_material?: PotMaterial;
  pot_drainage?: boolean;
  carnivore?: boolean;
}

export interface DiagnoseCause {
  cause: string;
  confidence: number; // 0-1
}

export interface DiagnoseResult {
  summary: string;
  watering_verdict: WateringVerdict;
  observations: string[];
  likely_causes: DiagnoseCause[];
  actions: string[];
  confidence: number; // 0-1
  not_a_plant: boolean;
}

const MOISTURE_PREFS: MoisturePref[] = ['moist', 'light_dry', 'moderate_dry', 'full_dry'];
const FERT_TYPES: FertType[] = ['balanced', 'orchid_30_10_10', 'high_phosphorus', 'none'];
const WATER_SOURCES: WaterSource[] = ['tap_ok', 'distilled_or_rain'];
const WATERING_VERDICTS: WateringVerdict[] = [
  'likely_overwatered',
  'likely_underwatered',
  'watering_ok',
  'unclear',
];

async function authHeaders(): Promise<Record<string, string> | null> {
  const user = currentUser();
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  } catch {
    return null;
  }
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  if (externalSignal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), ms);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

function reasonFromStatus(status: number, body: any): LocalAiFailureReason {
  const code = body && typeof body === 'object' ? body.error : undefined;
  if (status === 429 || code === 'rate_limited') return 'rate_limited';
  if (status === 503 || code === 'busy') return 'busy';
  if (status === 504 || code === 'model_timeout') return 'busy';
  return 'error';
}

/** GET /health, cached for 60s so callers can cheaply gate UI on availability. */
let healthCache: { at: number; ok: boolean } | null = null;

export async function localAiAvailable(): Promise<boolean> {
  const now = Date.now();
  if (healthCache && now - healthCache.at < 60_000) return healthCache.ok;
  try {
    const ok = await withTimeout(async (signal) => {
      const res = await fetch(`${LOCAL_AI_URL}/health`, { signal });
      if (!res.ok) return false;
      const body = await res.json().catch(() => null);
      return !!body?.ok;
    }, 4_000);
    healthCache = { at: now, ok };
    return ok;
  } catch {
    healthCache = { at: now, ok: false };
    return false;
  }
}

export async function identifyPlant(
  imageDataUri: string,
  opts?: { signal?: AbortSignal },
): Promise<LocalAiResult<IdentifyResult>> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, reason: 'offline' };
  try {
    const res = await withTimeout(
      (signal) =>
        fetch(`${LOCAL_AI_URL}/api/identify`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ image: imageDataUri }),
          signal,
        }),
      70_000,
      opts?.signal,
    );
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, reason: reasonFromStatus(res.status, body), retryAfterS: body?.retry_after_s };
    const validated = validateIdentifyResult(body);
    if (!validated) return { ok: false, reason: 'error' };
    if (validated.candidates.length === 0) return { ok: false, reason: 'not_plant' };
    return { ok: true, data: validated };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export async function generateProfile(
  params: ProfileParams,
  opts?: { signal?: AbortSignal },
): Promise<LocalAiResult<AiProfile>> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, reason: 'offline' };
  try {
    const res = await withTimeout(
      (signal) =>
        fetch(`${LOCAL_AI_URL}/api/profile`, {
          method: 'POST',
          headers,
          body: JSON.stringify(params),
          signal,
        }),
      60_000,
      opts?.signal,
    );
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, reason: reasonFromStatus(res.status, body), retryAfterS: body?.retry_after_s };
    const validated = validateAiProfile(body);
    if (!validated) return { ok: false, reason: 'error' };
    return { ok: true, data: validated };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export async function diagnosePlant(
  params: DiagnoseParams,
  opts?: { signal?: AbortSignal },
): Promise<LocalAiResult<DiagnoseResult>> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, reason: 'offline' };
  try {
    const res = await withTimeout(
      (signal) =>
        fetch(`${LOCAL_AI_URL}/api/diagnose`, {
          method: 'POST',
          headers,
          body: JSON.stringify(params),
          signal,
        }),
      70_000,
      opts?.signal,
    );
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, reason: reasonFromStatus(res.status, body), retryAfterS: body?.retry_after_s };
    const validated = validateDiagnoseResult(body);
    if (!validated) return { ok: false, reason: 'error' };
    return { ok: true, data: validated };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

// ---- validation helpers — coerce/reject defensively before trusting the model output ----

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateIdentifyResult(body: any): IdentifyResult | null {
  if (!body || !Array.isArray(body.candidates)) return null;
  const candidates: IdentifyCandidate[] = [];
  for (const c of body.candidates) {
    if (!c || typeof c.common_name !== 'string' || !c.common_name.trim()) continue;
    const confidence = isFiniteNumber(c.confidence) ? Math.max(0, Math.min(1, c.confidence)) : 0;
    candidates.push({
      common_name: c.common_name.trim(),
      scientific_name: typeof c.scientific_name === 'string' ? c.scientific_name.trim() : '',
      confidence,
    });
  }
  return { candidates: candidates.slice(0, 3), notes: typeof body.notes === 'string' ? body.notes : '' };
}

function validateAiProfile(body: any): AiProfile | null {
  if (!body) return null;
  if (!isFiniteNumber(body.species_baseline_days)) return null;
  const baseline = Math.round(Math.max(1, Math.min(90, body.species_baseline_days)));
  if (!MOISTURE_PREFS.includes(body.moisture_pref)) return null;
  if (!isFiniteNumber(body.feed_every_n_waterings)) return null;
  const feedEvery = Math.round(Math.max(0, Math.min(30, body.feed_every_n_waterings)));
  if (!FERT_TYPES.includes(body.fert_type)) return null;
  if (typeof body.carnivore !== 'boolean') return null;
  if (!WATER_SOURCES.includes(body.water_source)) return null;
  const mist =
    body.mist_every_days === null || body.mist_every_days === undefined
      ? null
      : isFiniteNumber(body.mist_every_days)
        ? Math.round(Math.max(1, Math.min(90, body.mist_every_days)))
        : null;
  const clean =
    body.clean_every_days === null || body.clean_every_days === undefined
      ? null
      : isFiniteNumber(body.clean_every_days)
        ? Math.round(Math.max(1, Math.min(90, body.clean_every_days)))
        : null;
  return {
    species_baseline_days: baseline,
    moisture_pref: body.moisture_pref,
    feed_every_n_waterings: feedEvery,
    fert_type: body.fert_type,
    carnivore: body.carnivore,
    water_source: body.water_source,
    mist_every_days: mist,
    clean_every_days: clean,
    rationale: typeof body.rationale === 'string' ? body.rationale : '',
    tips: Array.isArray(body.tips) ? body.tips.filter((t: unknown) => typeof t === 'string') : [],
  };
}

function validateDiagnoseResult(body: any): DiagnoseResult | null {
  if (!body || typeof body.summary !== 'string') return null;
  const verdict = WATERING_VERDICTS.includes(body.watering_verdict) ? body.watering_verdict : 'unclear';
  const observations = Array.isArray(body.observations)
    ? body.observations.filter((o: unknown) => typeof o === 'string').slice(0, 8)
    : [];
  const likely_causes = Array.isArray(body.likely_causes)
    ? body.likely_causes
        .filter((c: any) => c && typeof c.cause === 'string')
        .map((c: any) => ({
          cause: c.cause,
          confidence: isFiniteNumber(c.confidence) ? Math.max(0, Math.min(1, c.confidence)) : 0,
        }))
        .slice(0, 3)
    : [];
  const actions = Array.isArray(body.actions)
    ? body.actions.filter((a: unknown) => typeof a === 'string').slice(0, 8)
    : [];
  const confidence = isFiniteNumber(body.confidence) ? Math.max(0, Math.min(1, body.confidence)) : 0;
  return {
    summary: body.summary,
    watering_verdict: verdict,
    observations,
    likely_causes,
    actions,
    confidence,
    not_a_plant: body.not_a_plant === true,
  };
}
