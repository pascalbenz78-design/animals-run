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
  /** Wie stark Tiere einander wegstossen (0–1). */
  bumpStrength: 0.6,
};

/** Umrechnung der Grundwerte (Skala 1–5) in Spielwerte. Index 0 bleibt ungenutzt. */
export const STAT_SCALE = {
  /** Höchsttempo in m/s. */
  topSpeed: [0, 14.6, 15.1, 15.6, 16.1, 16.6],
  /** Beschleunigung in m/s². */
  accel: [0, 3.5, 4.5, 5.8, 7.4, 9.5],
  /** Sprung-Startgeschwindigkeit in m/s (Sprunghöhe = v² / 2g). */
  jumpVelocity: [0, 6.6, 7.1, 7.6, 8.1, 8.6],
  /** Tempo-Faktor beim Schwimmen. */
  swimFactor: [0, 0.45, 0.55, 0.65, 0.75, 0.85],
  /** Drehrate in rad/s bei langsamem Tempo. */
  turnRate: [0, 1.8, 2.0, 2.3, 2.6, 3.0],
  /** Bodenhaftung in Kurven (m/s²): Drehrate höchstens Haftung / Tempo. Kleiner = grösserer Kurvenradius. */
  grip: [0, 6.0, 7.2, 8.4, 9.6, 10.8],
};

export const ENERGY = {
  max: 100,
  /** Verbrauch pro Sekunde bei vollem Tempo. */
  drainPerSecond: 0.8,
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
export const AI = {
  levels: {
    leicht: { lineNoise: 2.0, speedFactor: 0.9, jumpError: 0.14, jumpMissChance: 0.25, boltSeek: 0.3 },
    mittel: { lineNoise: 0.9, speedFactor: 0.97, jumpError: 0.06, jumpMissChance: 0.06, boltSeek: 0.85 },
    schwer: { lineNoise: 0.35, speedFactor: 1.0, jumpError: 0.03, jumpMissChance: 0.01, boltSeek: 1 },
  },
  /** Vorausschau zur Ideallinie: fester Teil + Anteil der Geschwindigkeit. */
  lookAheadBase: 6,
  lookAheadPerSpeed: 0.55,
  /** Ab dieser Energie suchen Computergegner Ladestationen. */
  boltSeekEnergy: 85,
  /** Lenk-Toleranz in rad (verhindert Zittern). */
  steerDeadzone: 0.035,
  /** Leichte, einstellbare Aufholhilfe: zusätzliches Tempo pro Platz Rückstand zum besten Menschen. */
  rubberBandPerPlace: 0.0,
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
