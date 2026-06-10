/** Domain types — mirror the field names used by the original web app's data model. */

export type MoisturePref = 'moist' | 'light_dry' | 'moderate_dry' | 'full_dry';
export type FertType = 'balanced' | 'orchid_30_10_10' | 'high_phosphorus' | 'none';
export type WaterSource = 'tap_ok' | 'distilled_or_rain';
export type LightType = 'natural' | 'grow';
export type SoilType =
  | 'chunky_aroid'
  | 'orchid_bark'
  | 'sphagnum_moss'
  | 'regular_perlite'
  | 'cactus_gritty'
  | 'carnivore_peat';

/** The 6-field care profile resolved from the local DB (or manual entry). */
export interface PlantProfile {
  species_baseline_days: number;
  moisture_pref: MoisturePref;
  feed_every_n_waterings: number;
  fert_type: FertType;
  carnivore: boolean;
  water_source: WaterSource;
  /** Optional task defaults (Phase 2) — 0/undefined means the task is off. */
  mist_every_days?: number;
  clean_every_days?: number;
}

export interface Plant extends PlantProfile {
  id: number;
  name: string;
  room: string;
  light_type: LightType;
  soil_type: SoilType;
  photo: string | null; // data URI (base64) or null
  current_interval: number;
  recent_valid_gaps: number[];
  last_watered: string | null; // ISO timestamp
  last_fertilized: string | null;
  last_fed_at_count: number;
  no_fert_until: string | null; // ISO timestamp
  watering_count: number;
  notes: string;
  created_at: string;
  /** Care-task anchors (Phase 2) — all optional; due dates are computed, never stored. */
  last_misted?: string | null;
  last_cleaned?: string | null;
  last_pruned?: string | null;
  last_repotted?: string | null;
}

export type HistoryType =
  | 'Watered'
  | 'Watered + Fed'
  | 'Skipped'
  | 'Repotted'
  | 'Misted'
  | 'Cleaned'
  | 'Pruned';

export type LateReason = 'Still wet' | 'Too busy' | null;

export interface HistoryEntry {
  id: number;
  plantId: number;
  plantName: string;
  date: string; // ISO timestamp
  type: HistoryType;
  lateReason: LateReason;
}

/** Growth journal entry (Phase 4) — own doc so plant docs stay small. */
export interface JournalEntry {
  id: number;
  plant_id: number;
  date: string; // ISO timestamp
  photo: string | null; // data URI (~800px JPEG) or null for note-only
  note: string;
}

export type Store = 'plants' | 'history' | 'profileCache' | 'journal';
