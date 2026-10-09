/** Lokales Speichern im Browser (Einstellungen, Bestzeiten). Alles in try/catch: kann fehlschlagen. */
import type { Quality } from './render/trackView';

const KEY = 'animals-run-v1';

export interface Settings {
  quality: Quality;
  autoRun: boolean;
  controlHints: boolean;
  lastAnimal: string;
  lastTrack: string;
}

export interface SaveData {
  settings: Settings;
  /** Bestzeiten: Schlüssel «strecke» → Zeit und Tier */
  bestTimes: Record<string, { time: number; animalId: string }>;
  bestLaps: Record<string, { time: number; animalId: string }>;
}

function defaultQuality(): Quality {
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return touch ? 'mittel' : 'hoch';
}

function defaults(): SaveData {
  return {
    settings: { quality: defaultQuality(), autoRun: false, controlHints: true, lastAnimal: 'lenni', lastTrack: 'bauernhof' },
    bestTimes: {},
    bestLaps: {},
  };
}

let cache: SaveData | null = null;

export function load(): SaveData {
  if (cache) return cache;
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SaveData>;
      cache = {
        settings: { ...d.settings, ...(p.settings ?? {}) },
        bestTimes: p.bestTimes ?? {},
        bestLaps: p.bestLaps ?? {},
      };
      return cache;
    }
  } catch {
    // Speicher nicht verfügbar – mit Standardwerten weiter
  }
  cache = d;
  return cache;
}

export function save() {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // ignorieren (z. B. privater Modus)
  }
}

export function settings(): Settings {
  return load().settings;
}

export function updateSettings(p: Partial<Settings>) {
  Object.assign(load().settings, p);
  save();
}

/** Bestzeit eintragen; gibt true zurück, wenn es eine neue Bestzeit ist. */
export function submitTime(trackId: string, animalId: string, time: number, bestLap: number): boolean {
  const d = load();
  let isNew = false;
  const prev = d.bestTimes[trackId];
  if (!prev || time < prev.time) {
    d.bestTimes[trackId] = { time, animalId };
    isNew = true;
  }
  const pl = d.bestLaps[trackId];
  if (isFinite(bestLap) && (!pl || bestLap < pl.time)) d.bestLaps[trackId] = { time: bestLap, animalId };
  save();
  return isNew;
}
