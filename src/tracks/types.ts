/**
 * Strecken werden als Daten beschrieben: Streckenverlauf (geschlossener Spline durch Kontrollpunkte)
 * plus Listen von Objekten (Baukasten). Positionen entlang der Strecke als Anteil der Runde (0–1),
 * seitlicher Versatz d in Metern (positiv = links in Laufrichtung).
 */

/** Gestaltung der Umgebung (Bäume, Pflanzen, Tiere am Rand, Hügel) */
export type DecorStyle = 'wiese' | 'turnier' | 'strand' | 'herbst' | 'wueste' | 'alpen' | 'dschungel' | 'vulkan';

/** Partikel in der Luft */
export type WeatherType = 'keins' | 'pollen' | 'laub' | 'sand' | 'schnee' | 'regen' | 'asche';

export interface TrackTheme {
  skyTop: number;
  skyHorizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  ambient: number;
  /** Richtung, aus der die Sonne scheint (wird normalisiert). */
  sunDir: [number, number, number];
  ground: number;
  groundAlt: number;
  trackColor: number;
  trackEdge: number;
  fence: number;
  /** Nacht: Sterne am Himmel, Lava leuchtet */
  night?: boolean;
  /** Farbe der Wasserflächen */
  water?: number;
}

export type HurdleKind = 'huerde' | 'oxer' | 'steilwand' | 'zaun' | 'stamm';

export interface HurdleDef {
  s: number;
  kind?: HurdleKind;
  /** Lücke [d0, d1], durch die kleine Tiere (Hamster) hindurchpassen */
  gap?: [number, number];
}

export type ObstacleKind = 'heuballen' | 'stein' | 'kaktus' | 'sandburg' | 'schneeball' | 'fels' | 'baumstumpf' | 'gluehfels';

/** Rundes Hindernis auf der Bahn (man kann ausweichen oder darüber springen) */
export interface ObstacleDef {
  s: number;
  d: number;
  kind?: ObstacleKind;
}

export type SurfaceType = 'matsch' | 'wasser' | 'tiefwasser' | 'eis' | 'sand' | 'lava' | 'loch';

/** Untergrund-Fläche auf der Bahn */
export interface ZoneDef {
  type: SurfaceType;
  /** Mitte der Fläche (Anteil der Runde) */
  s: number;
  /** Länge in Metern entlang der Strecke */
  length: number;
  /** Seitliche Mitte (Standard 0) */
  d?: number;
  /** Breite in Metern (Standard: ganze Bahn) */
  width?: number;
  /** Strömung in m/s entlang der Strecke (negativ = gegen die Laufrichtung) */
  current?: number;
}

export interface BoltStationDef {
  s: number;
  /** Seitliche Positionen der einzelnen Blitze. */
  ds: number[];
}

/** Icon-Punkt (jedes Tier sieht dort sein eigenes Icon) */
export interface IconPointDef {
  s: number;
  d: number;
}

/** Reihe Item-Kisten quer über die Strecke */
export interface ItemRowDef {
  s: number;
  ds: number[];
  /** Im Laubhaufen versteckt */
  hidden?: boolean;
}

/** Reifen zum Durchspringen (Belohnung: kurzer Schub) */
export interface HoopDef {
  s: number;
  d: number;
}

/** Sprungschanze; als Geysir nur zeitweise aktiv */
export interface RampDef {
  s: number;
  d: number;
  width: number;
  kind?: 'schanze' | 'geysir' | 'duene';
}

/** Tor, das sich regelmässig öffnet und schliesst */
export interface GateDef {
  s: number;
  /** Zyklus in Sekunden */
  period: number;
  /** Anteil des Zyklus, in dem das Tor offen ist */
  open: number;
  phase?: number;
}

/** Baumstamm quer über die Bahn, der hin und her rollt */
export interface RollingLogDef {
  s: number;
  /** Rollweg in Metern */
  range: number;
  period: number;
  phase?: number;
}

/** Windrad: ein Flügel dreht sich knapp über dem Boden über die Bahn */
export interface SpinnerDef {
  s: number;
  d: number;
  /** Länge des Flügels */
  radius: number;
  /** Sekunden pro Umdrehung */
  period: number;
}

/** Schaukel-/Hängebrücke über Wasser oder Schlucht */
export interface BridgeDef {
  s: number;
  length: number;
  width: number;
  /** Seitliches Schaukeln in Metern */
  sway: number;
  period: number;
  /** Was unter der Brücke ist */
  below: 'wasser' | 'schlucht';
}

/** Lawine: rollt in den angegebenen Runden in Abständen quer über die Bahn */
export interface AvalancheDef {
  s: number;
  length: number;
  fromLap: number;
  period: number;
}

/** Lianen über der Bahn: wer hineinspringt, schwingt mit Schub weiter (z. B. über Matsch) */
export interface LianaDef {
  s: number;
  /** Seitliche Mitte und Breite des Lianenvorhangs */
  d: number;
  width: number;
}

/** Welle: rollt in Abständen vom Meer (rechts) quer über die Bahn und schiebt Tiere zur Seite */
export interface WaveDef {
  s: number;
  length: number;
  period: number;
  phase?: number;
}

/** Abkürzung abseits der Bahn */
export interface ShortcutDef {
  /** Einstieg und Ausstieg (Anteil der Runde) */
  from: number;
  to: number;
  /** Seite: 1 = links, −1 = rechts */
  side: 1 | -1;
  /** Zusätzlicher Wegpunkt [s, d] (d ausserhalb der Bahn) */
  via?: [number, number][];
  /**
   * offen: für alle · klein: nur kleine Tiere (Hamster) ·
   * sprung: nur mit hohem Sprung erreichbar · versteckt: nur mit Spürnase sichtbar
   */
  kind: 'offen' | 'klein' | 'sprung' | 'versteckt';
}

export type LandmarkType =
  | 'stall'
  | 'silo'
  | 'teich'
  | 'traktor'
  | 'tribuene'
  | 'windrad'
  | 'richterturm'
  | 'leuchtturm'
  | 'strandkorb'
  | 'hochsitz'
  | 'pyramide'
  | 'oase'
  | 'chalet'
  | 'seilbahn'
  | 'tempel'
  | 'wasserfall'
  | 'vulkan';

export interface LandmarkDef {
  type: LandmarkType;
  s: number;
  /** Seitlicher Abstand von der Streckenmitte (positiv = links). */
  d: number;
  /** Zusätzliche Drehung in Grad. */
  rot?: number;
  /** Grösse (Standard 1) */
  scale?: number;
}

export interface DecorDef {
  seed: number;
  style: DecorStyle;
  trees: number;
  bushes: number;
  flowers: number;
  /** Kleine Tiere am Rand (Hühner, Möwen, Eichhörnchen …) */
  critters: number;
  /** Anzahl Hügel am Horizont. */
  hills: number;
}

export interface TrackData {
  id: string;
  name: string;
  subtitle: string;
  /** Kontrollpunkte [x, z, Höhe]. Die Strecke ist geschlossen. */
  points: [number, number, number][];
  /** Die Strecke wird auf diese Rundenlänge (m) skaliert. */
  targetLength: number;
  /** Breite der Laufbahn in Metern. */
  width: number;
  theme: TrackTheme;
  /** Partikel; ab welcher Runde (z. B. Sandsturm ab Runde 2) */
  weather?: { type: WeatherType; fromLap?: number; storm?: boolean };
  hurdles: HurdleDef[];
  obstacles: ObstacleDef[];
  zones: ZoneDef[];
  bolts: BoltStationDef[];
  /** Normale Icon-Punkte pro Runde (die Aufholhilfe ergänzt automatisch weitere) */
  icons: IconPointDef[];
  items: ItemRowDef[];
  hoops?: HoopDef[];
  ramps?: RampDef[];
  gates?: GateDef[];
  logs?: RollingLogDef[];
  spinners?: SpinnerDef[];
  bridges?: BridgeDef[];
  avalanches?: AvalancheDef[];
  lianas?: LianaDef[];
  waves?: WaveDef[];
  shortcuts?: ShortcutDef[];
  landmarks: LandmarkDef[];
  decor: DecorDef;
}
