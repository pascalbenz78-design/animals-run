/** Lokales Speichern im Browser (Einstellungen, Bestzeiten). Alles in try/catch: kann fehlschlagen. */
import type { Quality } from './render/trackView';

// v2: Bauernhof wurde auf ~35-s-Runden verkürzt, alte Bestzeiten passen nicht mehr
// v3: Auto-Lauf neu standardmässig an, Strecken überarbeitet
const KEY = 'animals-run-v3';

export interface Settings {
  quality: Quality;
  autoRun: boolean;
  controlHints: boolean;
  /** Lenken am Handy: Joystick oder zwei Tasten */
  touchSteer: 'stick' | 'tasten';
  lastAnimal: string;
  lastTrack: string;
  /** Name im Mehrspieler */
  playerName: string;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  /** Intro beim Start zeigen */
  intro: boolean;
  /** Bekannte Spielernamen auf diesem Gerät (für «Wer spielt?») */
  players: string[];
}

export interface SaveData {
  settings: Settings;
  /** Bestzeiten: Schlüssel «strecke» (mit Gegnern) bzw. «strecke#solo» (Zeitfahren) → Zeit, Tier, Name */
  bestTimes: Record<string, { time: number; animalId: string; name?: string }>;
  bestLaps: Record<string, { time: number; animalId: string; name?: string }>;
  /** Bester Schlussrang je Cup */
  cupBest: Record<string, { place: number; animalId: string }>;
}

function defaultQuality(): Quality {
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return touch ? 'mittel' : 'hoch';
}

function defaults(): SaveData {
  return {
    settings: { quality: defaultQuality(), autoRun: true, controlHints: true, touchSteer: 'stick', lastAnimal: 'lenni', lastTrack: 'bauernhof', playerName: '', musicVolume: 0.6, sfxVolume: 0.8, muted: false, intro: true, players: [] },
    bestTimes: {},
    bestLaps: {},
    cupBest: {},
  };
}

let cache: SaveData | null = null;

/** Unmögliche Zeiten (z. B. aus Tests) nie als Rekord speichern: Runden ab 10 s, Rennen ab 30 s */
const MIN_LAP = 10;
const MIN_RACE = 30;

function plausible(map: Record<string, { time: number; animalId: string; name?: string }>, min: number) {
  for (const k of Object.keys(map)) if (!(map[k]?.time >= min)) delete map[k];
  return map;
}

export function load(): SaveData {
  if (cache) return cache;
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SaveData>;
      cache = {
        settings: { ...d.settings, ...(p.settings ?? {}) },
        bestTimes: plausible(p.bestTimes ?? {}, MIN_RACE),
        bestLaps: plausible(p.bestLaps ?? {}, MIN_LAP),
        cupBest: p.cupBest ?? {},
      };
      // Bisheriger Mehrspieler-Name kommt in die Liste «Wer spielt?»
      const s = cache.settings;
      if (!Array.isArray(s.players)) s.players = [];
      if (s.playerName && !s.players.includes(s.playerName)) s.players.push(s.playerName);
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

export type RecordEntry = { time: number; animalId: string; name?: string } | null;

/** Schlüssel der Bestzeiten: Zeitfahren (allein) hat eine eigene Liste */
export function recordKey(trackId: string, solo: boolean): string {
  return solo ? trackId + '#solo' : trackId;
}

/** Name nachträglich setzen («Nicht du? Ändern») – nur bei den Rekorden mit genau dieser Zeit */
export function renameRecords(key: string, raceTime: number | null, lapTime: number | null, name: string) {
  const d = load();
  if (raceTime !== null && d.bestTimes[key]?.time === raceTime) d.bestTimes[key].name = name || undefined;
  if (lapTime !== null && d.bestLaps[key]?.time === lapTime) d.bestLaps[key].name = name || undefined;
  save();
}

/** Spielername wählen (und in die Liste aufnehmen) */
export function setPlayer(name: string) {
  const s = load().settings;
  const n = name.trim().slice(0, 14);
  s.playerName = n;
  if (n && !s.players.includes(n)) s.players.push(n);
  save();
}

export function removePlayer(name: string) {
  const s = load().settings;
  s.players = s.players.filter((p) => p !== name);
  if (s.playerName === name) s.playerName = '';
  save();
}

/** Rekorde einer Strecke (ganzes Rennen und beste Runde) */
export function trackRecords(trackId: string): { race: RecordEntry; lap: RecordEntry } {
  const d = load();
  return { race: d.bestTimes[trackId] ?? null, lap: d.bestLaps[trackId] ?? null };
}

/** Alle Bestzeiten und Cup-Ergebnisse löschen (Einstellungen bleiben) */
export function resetRecords() {
  const d = load();
  d.bestTimes = {};
  d.bestLaps = {};
  d.cupBest = {};
  save();
}

/** Bestzeit einer Strecke für eine Runde (oder null). */
export function bestLap(trackId: string): number | null {
  return load().bestLaps[trackId]?.time ?? null;
}

/** Rundenzeit sofort eintragen. Gibt die bisherige Bestzeit zurück und ob es eine neue ist. */
export function submitLap(trackId: string, animalId: string, time: number, name = ''): { previous: number | null; isNew: boolean } {
  const d = load();
  const previous = d.bestLaps[trackId]?.time ?? null;
  const isNew = time >= MIN_LAP && (previous === null || time < previous);
  if (isNew) {
    d.bestLaps[trackId] = { time, animalId, name: name || undefined };
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
export function submitTime(trackId: string, animalId: string, time: number, bestLap: number, name = ''): boolean {
  const d = load();
  let isNew = false;
  const prev = d.bestTimes[trackId];
  if (time >= MIN_RACE && (!prev || time < prev.time)) {
    d.bestTimes[trackId] = { time, animalId, name: name || undefined };
    isNew = true;
  }
  const pl = d.bestLaps[trackId];
  if (isFinite(bestLap) && bestLap >= MIN_LAP && (!pl || bestLap < pl.time)) d.bestLaps[trackId] = { time: bestLap, animalId, name: name || undefined };
  save();
  return isNew;
}
