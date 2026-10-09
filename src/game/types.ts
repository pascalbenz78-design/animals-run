/** Gemeinsame Typen der Simulation. Bewusst reine Daten, damit sie später übers Netz gehen können. */

/** Eingabe-Objekt: steuert jedes Tier, egal ob Mensch, Computergegner oder Mitspieler im Netz. */
export interface Input {
  vorwaerts: boolean;
  links: boolean;
  rechts: boolean;
  springen: boolean;
  superkraft: boolean;
}

export const emptyInput = (): Input => ({ vorwaerts: false, links: false, rechts: false, springen: false, superkraft: false });

export type AiLevel = 'leicht' | 'mittel' | 'schwer';

export interface Entrant {
  animalId: string;
  human: boolean;
  aiLevel: AiLevel;
}

export type SimEventType = 'jump' | 'land' | 'stumble' | 'bolt' | 'lap' | 'finish' | 'respawn' | 'bump' | 'countdown' | 'go';

export interface SimEvent {
  type: SimEventType;
  animal: number;
  /** Zusatzwert (z. B. Runde oder Countdown-Zahl). */
  value?: number;
}

export type RacePhase = 'countdown' | 'running' | 'done';

export interface AnimalState {
  id: number;
  animalId: string;
  human: boolean;
  aiLevel: AiLevel;
  // Bewegung
  x: number;
  z: number;
  /** Höhe über dem Boden */
  alt: number;
  vy: number;
  heading: number;
  speed: number;
  grounded: boolean;
  // Vorheriger Schritt (für interpolierte Darstellung)
  prevX: number;
  prevZ: number;
  prevAlt: number;
  prevHeading: number;
  // Lage auf der Strecke
  idx: number;
  s: number;
  d: number;
  totalDist: number;
  cpPassed: number;
  lap: number;
  lapStart: number;
  bestLap: number;
  finished: boolean;
  finishTime: number;
  place: number;
  // Zustand
  energy: number;
  stumble: number;
  respawn: number;
  jumpHeld: boolean;
  inMud: boolean;
  /** Laufzyklus-Phase für die Animation */
  stride: number;
}

export interface Bolt {
  x: number;
  z: number;
  s: number;
  d: number;
  timer: number;
}

export interface Bale {
  x: number;
  z: number;
  s: number;
  d: number;
}

export interface ResultRow {
  animal: number;
  animalId: string;
  human: boolean;
  place: number;
  time: number;
  bestLap: number;
  /** Zeit geschätzt (Tier war bei Rennende noch nicht im Ziel) */
  estimated: boolean;
}
