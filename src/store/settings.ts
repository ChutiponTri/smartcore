import { useSyncExternalStore } from 'react';
import type { SessionConfig } from '../scoring/session';
import { DEFAULT_CONFIG } from '../scoring/session';

export type Settings = {
  muted: boolean;
  patientId: string | null;
  config: SessionConfig;
};

const KEY = 'smartcore.settings';

function load(): Settings {
  const base: Settings = { muted: false, patientId: null, config: DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return { ...base, ...parsed, config: { ...DEFAULT_CONFIG, ...parsed.config } };
    }
  } catch {
    /* storage unavailable: fall back to defaults */
  }
  return base;
}

let state = load();
const listeners = new Set<() => void>();

export const settings = {
  get: () => state,
  set(patch: Partial<Settings>) {
    state = { ...state, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, settings.get);
}
