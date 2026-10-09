/** Gemeinsame Typen der Simulation. Bewusst reine Daten, damit sie später übers Netz gehen können. */
import type { PowerId } from '../animals/animals';

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

export type ItemId = 'turbo' | 'schnecke' | 'schild' | 'matsch';
export const ITEM_IDS: ItemId[] = ['turbo', 'schnecke', 'schild', 'matsch'];

export type SimEventType =
  | 'jump'
  | 'land'
  | 'stumble'
  | 'bolt'
  | 'lap'
  | 'finish'
  | 'respawn'
  | 'countdown'
  | 'go'
  | 'icon'
  | 'powerReady'
  | 'power'
  | 'stunned'
  | 'blocked'
  | 'spin'
  | 'slowed'
  | 'item'
  | 'quakeWarn'
  | 'quake'
  | 'leapHit';

export interface SimEvent {
  type: SimEventType;
  animal: number;
  /** Zusatzwert (z. B. Runde, Countdown-Zahl, Item-Index) */
  value?: number;
  /** Verursacher (bei Treffern) */
  by?: number;
}

export type RacePhase = 'countdown' | 'running' | 'done';

/** Art des Schutzes (für die Darstellung) */
export type ShieldKind = '' | 'schild' | 'pflaster' | 'graben';

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
  /** Zeit der zuletzt beendeten Runde */
  lastLap: number;
  finished: boolean;
  finishTime: number;
  place: number;
  // Zustand
  energy: number;
  stumble: number;
  respawn: number;
  jumpHeld: boolean;
  powerHeld: boolean;
  inMud: boolean;
  /** Laufzyklus-Phase für die Animation */
  stride: number;
  // Superkraft
  power: PowerId;
  /** Gesammelte Icons (0–3) */
  icons: number;
  /** Pro Icon-Punkt: Sekunden bis das Icon für dieses Tier wieder erscheint */
  iconTimers: number[];
  /** Gerade aktive Superkraft ('' = keine) und Restzeit */
  active: PowerId | '';
  activeTime: number;
  /** Zusatzdaten der aktiven Kraft (Ziel, Richtung, getroffene Tiere als Bitmaske, Zähler) */
  activeTarget: number;
  activeDir: number;
  activeHits: number;
  activeCount: number;
  // Effekte (Restzeit in Sekunden)
  boost: number;
  boostFactor: number;
  stun: number;
  slow: number;
  slowFactor: number;
  spin: number;
  invuln: number;
  shield: ShieldKind;
  /** Kurzer Schutz nach einem Treffer */
  hitImmune: number;
  /** Zuletzt erhaltenes Item (für die Anzeige) */
  lastItem: ItemId | '';
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

export interface IconPoint {
  x: number;
  z: number;
  s: number;
  d: number;
  /** 0 = normaler Punkt; k > 0 = zusätzlicher Punkt der Aufholhilfe */
  rank: number;
}

export interface ItemBox {
  x: number;
  z: number;
  s: number;
  d: number;
  timer: number;
}

/** Apfel (Ray) oder Matschfalle (Item) auf der Strecke */
export interface Hazard {
  kind: 'apfel' | 'matsch';
  x: number;
  z: number;
  owner: number;
  /** Restliche Lebensdauer */
  life: number;
  /** Alter in Sekunden (für Schutz des Besitzers und Animation) */
  age: number;
  id: number;
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
