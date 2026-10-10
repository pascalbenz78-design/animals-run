/**
 * Zentrale Konfiguration aller Zahlenwerte (Tempo, Dauer, Reichweiten …).
 * Einheiten: Meter, Sekunden, Meter pro Sekunde. Hier darf und soll angepasst werden.
 */

/** Feste Simulationsrate (Schritte pro Sekunde). */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export const RACE = {
  laps: 3,
  animalsPerRace: 8,
  /** Dauer des Countdowns «3 – 2 – 1 – Los!» in Sekunden. */
  countdownSeconds: 3,
  /** Abstand der Startreihen und seitlicher Versatz in der Startaufstellung. */
  gridRowSpacing: 4.5,
  gridLateral: 3.2,
  /** Erste Startreihe so weit hinter der Ziellinie. */
  gridFirstRowBehind: 5,
  /** Startplatz des menschlichen Spielers (1 = ganz vorne). */
  playerGridPosition: 5,
  /** Kontrollpunkte pro Runde (gegen Abkürzen). */
  checkpointsPerLap: 8,
  /** Nach so vielen Sekunden wird ein gestürztes Tier am letzten Kontrollpunkt eingesetzt. */
  respawnDelay: 1.5,
  /** Cup-Punkte für Platz 1–8 */
  cupPoints: [15, 12, 10, 8, 6, 4, 2, 1],
  /** Höchstens so lange wird nach dem Zieleinlauf aller Menschen auf die Computer gewartet. */
  waitForOthersSeconds: 12,
};

export const PHYSICS = {
  gravity: 24,
  /** Bremsung, wenn «Vorwärts» losgelassen wird (Auslaufen). */
  coastDecel: 7,
  /** Bremsung, wenn das Tier schneller ist als erlaubt (z. B. im Matsch). */
  overSpeedDecel: 14,
  /** Lenkkraft in der Luft (Anteil). */
  airSteer: 0.45,
  /** Abstand zur Bande (Zaun) zusätzlich zum Tier-Radius. */
  wallMargin: 0.2,
  /** Tempo-Verlust pro Sekunde, wenn man an der Bande entlangschrammt (Anteil). */
  wallScrapeLoss: 1.2,
  /** Zusätzliche Kurvenhaftung (m/s²) während eines Schubs, pro 100 % Schub – für alle Tiere gleich viel. */
  boostGripAdd: 12,
  /** Wie stark Tiere einander wegstossen (0–1). */
  bumpStrength: 0.6,
};

/** Umrechnung der Grundwerte (Skala 1–5) in Spielwerte. Index 0 bleibt ungenutzt. */
export const STAT_SCALE = {
  /** Höchsttempo in m/s. */
  topSpeed: [0, 15.0, 15.4, 15.6, 16.1, 16.6],
  /** Beschleunigung in m/s². */
  accel: [0, 3.5, 4.5, 5.8, 7.4, 9.5],
  /** Sprung-Startgeschwindigkeit in m/s (Sprunghöhe = v² / 2g). */
  jumpVelocity: [0, 6.6, 7.1, 7.6, 8.1, 8.6],
  /** Tempo-Faktor beim Schwimmen. */
  swimFactor: [0, 0.45, 0.55, 0.65, 0.75, 0.85],
  /** Drehrate in rad/s bei langsamem Tempo. */
  turnRate: [0, 1.8, 2.0, 2.3, 2.6, 3.0],
  /** Bodenhaftung in Kurven (m/s²): Drehrate höchstens Haftung / Tempo. Kleiner = grösserer Kurvenradius. */
  grip: [0, 7.6, 9.1, 9.6, 10.6, 10.9],
};

export const ENERGY = {
  max: 100,
  /**
   * Verbrauch pro Sekunde bei vollem Tempo: ein voller Tank reicht ca. 38 s.
   * Jede Strecke hat 2 Ladestationen pro Runde (höchstens ca. 22 s auseinander):
   * Wer eine verpasst, wird langsamer; wer zwei verpasst, läuft auf Reserve.
   */
  drainPerSecond: 2.6,
  /** Faktor bergauf (Steigung > uphillSlope). */
  uphillFactor: 1.6,
  uphillSlope: 0.04,
  /** Faktor beim Schwimmen (ab Phase 3). */
  swimFactor: 2.0,
  /** Unter dieser Energie wird das Tier langsamer … */
  slowThreshold: 30,
  /** … bis zu diesem Tempo-Faktor bei Energie 0. */
  emptySpeedFactor: 0.65,
  /** Energie, die ein Blitz auffüllt. */
  boltRefill: 75,
  /** Nach so vielen Sekunden erscheint ein eingesammelter Blitz wieder. */
  boltRespawn: 3,
  boltRadius: 1.9,
};

export const OBSTACLES = {
  hurdleHeight: 0.85,
  /** Tempo nach dem Anstossen an eine Hürde (Anteil). */
  hurdleSpeedKeep: 0.35,
  hurdleStumble: 0.6,
  baleRadius: 1.25,
  baleHeight: 1.3,
  baleSpeedKeep: 0.5,
  baleStumble: 0.35,
  /** Höchsttempo im Matsch (Anteil). */
  mudFactor: 0.62,
};

/** Grösse der Tiere (Kollisionsradius in Metern) nach Tierart. */
export const BODY_RADIUS = {
  pferd: 0.9,
  katze: 0.65,
  hund: 0.75,
  hamster: 0.45,
} as const;

/** Computergegner. */
export const AI: {
  levels: Record<'leicht' | 'mittel' | 'schwer', { lineNoise: number; speedFactor: number; jumpError: number; jumpMissChance: number; boltSeek: number; powerSkill: 'zufall' | 'gezielt' | 'taktisch'; dodgeQuake: number; avoidHazards: boolean; useShortcuts: number }>;
  lookAheadBase: number;
  lookAheadPerSpeed: number;
  boltSeekEnergy: number;
  steerDeadzone: number;
  rubberBandPerPlace: number;
} = {
  levels: {
    leicht: { lineNoise: 2.0, speedFactor: 0.9, jumpError: 0.14, jumpMissChance: 0.25, boltSeek: 0.3, powerSkill: 'zufall', dodgeQuake: 0, avoidHazards: false, useShortcuts: 0 },
    mittel: { lineNoise: 0.9, speedFactor: 0.97, jumpError: 0.06, jumpMissChance: 0.06, boltSeek: 0.85, powerSkill: 'gezielt', dodgeQuake: 0.45, avoidHazards: false, useShortcuts: 0.5 },
    schwer: { lineNoise: 0.35, speedFactor: 1.0, jumpError: 0.03, jumpMissChance: 0.01, boltSeek: 1, powerSkill: 'taktisch', dodgeQuake: 0.9, avoidHazards: true, useShortcuts: 1 },
  },
  /** Vorausschau zur Ideallinie: fester Teil + Anteil der Geschwindigkeit. */
  lookAheadBase: 6,
  lookAheadPerSpeed: 0.55,
  /** Ab dieser Energie suchen Computergegner Ladestationen. */
  boltSeekEnergy: 85,
  /** Lenk-Toleranz in rad (verhindert Zittern). */
  steerDeadzone: 0.035,
  /** Leichte, einstellbare Aufholhilfe: zusätzliches Tempo pro Platz Rückstand zum besten Menschen. */
  rubberBandPerPlace: 0.008,
};

/** Kamera und Darstellung. */
export const VIEW = {
  camDistance: 7.2,
  camHeight: 3.0,
  camLookAhead: 3,
  camLookHeight: 1.3,
  camFollow: 7,
  fovBase: 62,
  fovSpeedBonus: 10,
  /** Maximale Pixel-Ratio je Grafikstufe. */
  pixelRatio: { hoch: 2, mittel: 1.5, niedrig: 1 },
  shadowMapSize: { hoch: 2048, mittel: 1024, niedrig: 0 },
  /** Anteil der Dekoration (Bäume usw.) je Grafikstufe. */
  decorDensity: { hoch: 1, mittel: 0.7, niedrig: 0.4 },
};

/** Persönliche Icons und Aufholhilfe. */
export const ICONS = {
  /** So viele Icons laden die Superkraft. */
  needed: 3,
  /** Abholradius */
  radius: 1.8,
  /** Nach so vielen Sekunden erscheint ein eingesammeltes Icon für dieses Tier wieder. */
  respawn: 10,
  /**
   * Aufholhilfe: Anzahl zusätzlicher Icon-Punkte pro Runde, die ein Tier je nach Platz sieht
   * (Index = Platz 1–8). Platz 1 sieht nur die normalen Punkte.
   */
  extraByPlace: [0, 0, 1, 2, 3, 4, 5, 7, 9],
  /** Maximale Anzahl zusätzlicher Punkte (werden automatisch über die Runde verteilt). */
  extraMax: 9,
};

/** Superkräfte: Dauer, Stärke, Reichweite. */
export const POWERS = {
  turboGalopp: { duration: 4, boost: 1.6 },
  sprungAttacke: { range: 25, leapTime: 0.6, stun: 2, selfBoost: 1.25, selfBoostTime: 1.5 },
  apfelRegen: { duration: 3, count: 5, radius: 1.3, spin: 1.2, lifetime: 20, spread: [0, -2.6, 2.6, -1.3, 1.3] },
  schutzpflaster: { duration: 5 },
  wirbelsturm: { duration: 3, radius: 8, stun: 1.5 },
  maeusejagd: { duration: 5, boost: 1.35 },
  erdbeben: { warning: 0.5, radius: 40, stun: 1.5 },
  miauSchrei: { range: 30, halfAngle: 0.4, stun: 2, waveTime: 0.6 },
  spuernase: { duration: 4, boost: 1.15, trailLength: 60 },
  hamsterkugel: { duration: 5, boost: 1.2, pushStrength: 2.5 },
};

/** Wirkung von «gestoppt» und «Rutschen». */
export const EFFECTS = {
  /** Tempo-Faktor während des Rutschens (Apfel) */
  spinSpeed: 0.3,
  /** Kurzer Schutz nach einem Treffer, damit man nicht sofort wieder getroffen wird */
  hitImmunity: 1.0,
};

/** Allgemeine Items aus den Item-Kisten (wirken sofort beim Einsammeln). */
export const ITEMS = {
  boxRadius: 1.6,
  boxRespawn: 3,
  turbo: { duration: 2.5, boost: 1.4 },
  schnecke: { duration: 3, factor: 0.6 },
  schild: { duration: 5 },
  matsch: { duration: 1.5, factor: 0.3, radius: 1.4, lifetime: 25, ownerImmunity: 1.5 },
  /**
   * Wahrscheinlichkeiten [turbo, schnecke, schild, matsch] je Platz (Index 1–8).
   * Hinten eher hilfreiche Items, vorne eher die Falle.
   */
  odds: [
    [0, 0, 0, 0],
    [0.1, 0.0, 0.25, 0.65],
    [0.2, 0.1, 0.3, 0.4],
    [0.3, 0.2, 0.25, 0.25],
    [0.35, 0.3, 0.2, 0.15],
    [0.4, 0.35, 0.15, 0.1],
    [0.45, 0.4, 0.1, 0.05],
    [0.5, 0.4, 0.1, 0.0],
    [0.55, 0.4, 0.05, 0.0],
  ],
};

/** Streckenelemente (Phase 3). */
export const ELEMENTS = {
  /** Höhe der Hürdenarten */
  hurdleHeight: { huerde: 0.85, oxer: 1.0, steilwand: 1.15, zaun: 0.9, stamm: 0.7 },
  /** Radius und Höhe der runden Hindernisse */
  obstacle: {
    heuballen: { r: 1.25, h: 1.3 },
    stein: { r: 0.9, h: 0.9 },
    kaktus: { r: 0.7, h: 2.2 },
    sandburg: { r: 1.1, h: 1.0 },
    schneeball: { r: 1.0, h: 1.9 },
    fels: { r: 1.4, h: 1.6 },
    baumstumpf: { r: 0.8, h: 0.7 },
    gluehfels: { r: 1.0, h: 1.2 },
  },
  /** Tempo-Faktor je Untergrund (Trittsicherheit mildert Matsch, Eis und Sand) */
  surfaceSpeed: { matsch: 0.62, wasser: 0.7, sand: 0.84, eis: 1.0 },
  /** Eis: weniger Haftung und Beschleunigung, man rutscht weiter */
  ice: { grip: 0.42, accel: 0.6, coast: 0.25, slide: 2.2 },
  /** Kleine Tiere (Radius bis hier, d. h. der Hamster) passen durch enge Lücken und Abkürzungen «klein» */
  smallRadius: 0.5,
  hoop: { radius: 1.3, minAlt: 0.45, boost: 1.25, duration: 1.3 },
  ramp: { schanze: 11, duene: 8.5, geysir: 13 },
  /** Höhe der Rampen (Absprung von oben, damit die Tiere nicht durch die Rampe laufen) */
  rampHeight: { schanze: 0.9, duene: 1.1, geysir: 0 },
  /** Länge der Rampen in Laufrichtung */
  rampLength: { schanze: 3.2, duene: 5, geysir: 0 },
  /** Durch Lücken in Steilwänden passen alle ausser Pferden (Radius bis hier) */
  gapRadius: 0.8,
  geyser: { period: 4.5, active: 1.3 },
  gate: { stumble: 0.5 },
  log: { height: 0.75, radius: 0.55 },
  /** Windradflügel: fegt knapp über den Boden – man kann darüber springen */
  spinner: { height: 0.7, width: 0.45, immunity: 1.4 },
  avalanche: { warn: 2.0, sweep: 2.6, band: 2.2, stun: 1.5 },
  shortcut: { width: 5 },
};
