/** Lokales Speichern im Browser (Einstellungen, Bestzeiten). Alles in try/catch: kann fehlschlagen. */
import type { Quality } from './render/trackView';

// v2: Bauernhof wurde auf ~35-s-Runden verkürzt, alte Bestzeiten passen nicht mehr
// v3: Auto-Lauf neu standardmässig an, Strecken überarbeitet
const KEY = 'animals-run-v3';

export interface Settings {
  quality: Quality;
  autoRun: boolean;
  controlHints: boolean;
  lastAnimal: string;
  lastTrack: string;
  /** Name im Mehrspieler */
  playerName: string;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export interface SaveData {
  settings: Settings;
  /** Bestzeiten: Schlüssel «strecke» → Zeit und Tier */
  bestTimes: Record<string, { time: number; animalId: string }>;
  bestLaps: Record<string, { time: number; animalId: string }>;
  /** Bester Schlussrang je Cup */
  cupBest: Record<string, { place: number; animalId: string }>;
}

function defaultQuality(): Quality {
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return touch ? 'mittel' : 'hoch';
}

function defaults(): SaveData {
  return {
    settings: { quality: defaultQuality(), autoRun: true, controlHints: true, lastAnimal: 'lenni', lastTrack: 'bauernhof', playerName: '', musicVolume: 0.6, sfxVolume: 0.8, muted: false },
    bestTimes: {},
    bestLaps: {},
    cupBest: {},
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
        cupBest: p.cupBest ?? {},
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

/** Bestzeit einer Strecke für eine Runde (oder null). */
export function bestLap(trackId: string): number | null {
  return load().bestLaps[trackId]?.time ?? null;
}

/** Rundenzeit sofort eintragen. Gibt die bisherige Bestzeit zurück und ob es eine neue ist. */
export function submitLap(trackId: string, animalId: string, time: number): { previous: number | null; isNew: boolean } {
  const d = load();
  const previous = d.bestLaps[trackId]?.time ?? null;
  const isNew = previous === null || time < previous;
  if (isNew) {
    d.bestLaps[trackId] = { time, animalId };
    save();
  }
  return { previous, isNew };
}

/** Cup-Ergebnis eintragen; gibt true zurück, wenn es das beste bisher ist. */
export function submitCup(cupId: string, animalId: string, place: number): boolean {
  const d = load();
  const prev = d.cupBest[cupId];
  if (prev && prev.place <= place) return false;
  d.cupBest[cupId] = { place, animalId };
  save();
  return true;
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
