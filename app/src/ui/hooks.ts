import { useEffect, useState, useCallback } from 'react';
import { subscribe, getPlants, getHistory } from '../data/db';
import type { Plant, HistoryEntry } from '../types';

/** Re-render whenever the data layer emits a change. */
export function useStore(): number {
  const [v, setV] = useState(0);
  useEffect(() => subscribe(() => setV((x) => x + 1)), []);
  return v;
}

export function usePlants(): Plant[] {
  useStore();
  return getPlants();
}

export function useHistory(): HistoryEntry[] {
  useStore();
  return getHistory();
}

export function usePlant(id: number | undefined): Plant | undefined {
  useStore();
  if (id == null) return undefined;
  return getPlants().find((p) => p.id === id);
}

/** Force a re-render imperatively (used after async writes if needed). */
export function useForceUpdate() {
  const [, setV] = useState(0);
  return useCallback(() => setV((x) => x + 1), []);
}
