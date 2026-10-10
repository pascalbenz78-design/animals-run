/**
 * Abgleich des Rennzustands: Der Gastgeber nimmt regelmässig einen Schnappschuss der Simulation auf,
 * die Mitspieler übernehmen ihn und rechnen ihre eigenen, noch nicht bestätigten Eingaben nach
 * (Client-Vorhersage mit Korrektur).
 */
import type { RaceSim } from '../game/simulation';
import type { AnimalState, Hazard, RacePhase } from '../game/types';

/** Felder, die nur für die Darstellung zwischen zwei Schritten gebraucht werden */
type LocalOnly = 'prevX' | 'prevZ' | 'prevAlt' | 'prevHeading';
export type AnimalSnap = Omit<AnimalState, LocalOnly>;

export interface Snapshot {
  tick: number;
  time: number;
  phase: RacePhase;
  leaderLap: number;
  doneTimer: number;
  hazardId: number;
  animals: AnimalSnap[];
  bolts: number[];
  boxes: number[];
  hazards: Hazard[];
  hurdleHit: number[];
  /** Zuletzt verwendete Eingabe (Bitfeld) je Tier – für die Vorhersage der anderen Menschen */
  inputs: number[];
}

export function captureSnapshot(sim: RaceSim, inputs: number[]): Snapshot {
  return {
    tick: sim.tick,
    time: sim.time,
    phase: sim.phase,
    leaderLap: sim.leaderLap,
    doneTimer: sim.doneTimer,
    hazardId: sim.hazardId,
    animals: sim.animals.map((a) => {
      const { prevX: _x, prevZ: _z, prevAlt: _a, prevHeading: _h, ...rest } = a;
      return { ...rest, iconTimers: [...a.iconTimers] };
    }),
    bolts: sim.bolts.map((b) => b.timer),
    boxes: sim.itemBoxes.map((b) => b.timer),
    hazards: sim.hazards.map((h) => ({ ...h })),
    hurdleHit: [...sim.hurdleHit],
    inputs,
  };
}

/**
 * Schnappschuss in die lokale Simulation übernehmen. Die bisherigen Positionen werden zu
 * «vorherigen» Positionen, damit die Darstellung nicht springt (der Rest wird sanft ausgeglichen).
 */
export function applySnapshot(sim: RaceSim, s: Snapshot) {
  sim.tick = s.tick;
  sim.time = s.time;
  sim.phase = s.phase;
  sim.leaderLap = s.leaderLap;
  sim.doneTimer = s.doneTimer;
  sim.hazardId = s.hazardId;
  s.animals.forEach((src, i) => {
    const a = sim.animals[i];
    if (!a) return;
    Object.assign(a, src);
    a.iconTimers = [...src.iconTimers];
    a.prevX = a.x;
    a.prevZ = a.z;
    a.prevAlt = a.alt;
    a.prevHeading = a.heading;
  });
  s.bolts.forEach((t, i) => sim.bolts[i] && (sim.bolts[i].timer = t));
  s.boxes.forEach((t, i) => sim.itemBoxes[i] && (sim.itemBoxes[i].timer = t));
  sim.hazards.length = 0;
  for (const h of s.hazards) sim.hazards.push({ ...h });
  s.hurdleHit.forEach((v, i) => (sim.hurdleHit[i] = v));
  sim.events.length = 0;
}
