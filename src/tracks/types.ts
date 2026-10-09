/**
 * Strecken werden als Daten beschrieben: Streckenverlauf (geschlossener Spline durch Kontrollpunkte)
 * plus Listen von Objekten. Positionen entlang der Strecke als Anteil der Runde (0–1),
 * seitlicher Versatz d in Metern (positiv = links in Laufrichtung).
 */

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
}

export interface HurdleDef {
  s: number;
}

export interface BaleDef {
  s: number;
  d: number;
}

export interface MudDef {
  s: number;
  /** Länge in Metern entlang der Strecke. */
  length: number;
  d: number;
  /** Breite in Metern. */
  width: number;
}

export interface BoltStationDef {
  s: number;
  /** Seitliche Positionen der einzelnen Blitze. */
  ds: number[];
}

export type LandmarkType = 'stall' | 'silo' | 'teich' | 'traktor' | 'tribuene' | 'windrad';

export interface LandmarkDef {
  type: LandmarkType;
  s: number;
  /** Seitlicher Abstand von der Streckenmitte (positiv = links). */
  d: number;
  /** Zusätzliche Drehung in Grad. */
  rot?: number;
}

export interface DecorDef {
  seed: number;
  trees: number;
  bushes: number;
  flowers: number;
  chickens: number;
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
  hurdles: HurdleDef[];
  bales: BaleDef[];
  mud: MudDef[];
  bolts: BoltStationDef[];
  landmarks: LandmarkDef[];
  decor: DecorDef;
}
