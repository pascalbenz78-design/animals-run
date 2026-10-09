/**
 * Streckengeometrie (ohne Three.js): Der Streckenverlauf wird aus den Kontrollpunkten als
 * geschlossener Catmull-Rom-Spline berechnet und im Abstand von 1 m abgetastet.
 * Bietet Projektion Welt → (s, d) und zurück sowie die Ideallinie für Computergegner.
 */
import type { TrackData } from '../tracks/types';

const SAMPLE_SPACING = 1;

export interface Projection {
  idx: number;
  /** Strecke entlang der Mittellinie in Metern (0 … length). */
  s: number;
  /** Seitlicher Abstand (positiv = links). */
  d: number;
}

export class Track {
  readonly data: TrackData;
  readonly length: number;
  readonly count: number;
  readonly halfWidth: number;
  /** Mittellinie */
  readonly px: Float32Array;
  readonly pz: Float32Array;
  readonly py: Float32Array;
  /** Einheits-Tangente */
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  /** Krümmung (rad/m, positiv = Rechtskurve) */
  readonly curvature: Float32Array;
  /** Steigung dy/ds */
  readonly slope: Float32Array;
  /** Ideallinie: seitlicher Versatz pro Abtastpunkt */
  readonly racingLine: Float32Array;
  /** Krümmung der Ideallinie (Betrag, rad/m) */
  readonly racingCurvature: Float32Array;

  constructor(data: TrackData) {
    this.data = data;
    this.halfWidth = data.width / 2;

    // 1) Dicht abtasten
    const dense = sampleCatmullRom(data.points, 40);
    // 2) Auf Ziellänge skalieren (nur x/z)
    let len = polylineLength(dense);
    const scale = data.targetLength / len;
    for (const p of dense) {
      p[0] *= scale;
      p[1] *= scale;
    }
    len = polylineLength(dense);
    // 3) Gleichmässig neu abtasten
    const n = Math.round(len / SAMPLE_SPACING);
    this.count = n;
    this.length = n * SAMPLE_SPACING;
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.py = new Float32Array(n);
    resample(dense, len, n, this.px, this.pz, this.py);

    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.curvature = new Float32Array(n);
    this.slope = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      const dx = this.px[b] - this.px[a];
      const dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
      this.slope[i] = (this.py[b] - this.py[a]) / (2 * SAMPLE_SPACING);
    }
    for (let i = 0; i < n; i++) {
      const a = (i - 2 + n) % n;
      const b = (i + 2) % n;
      const ha = Math.atan2(this.tz[a], this.tx[a]);
      const hb = Math.atan2(this.tz[b], this.tx[b]);
      this.curvature[i] = wrapAngle(hb - ha) / (4 * SAMPLE_SPACING);
    }
    this.racingLine = this.computeRacingLine();
    this.racingCurvature = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Krümmung über drei Punkte im Abstand von 4 m (Umkreis-Formel)
      const [ax, az] = this.linePoint((i - 4 + n) % n);
      const [bx, bz] = this.linePoint(i);
      const [cx, cz] = this.linePoint((i + 4) % n);
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const ab = Math.hypot(bx - ax, bz - az);
      const bc = Math.hypot(cx - bx, cz - bz);
      const ca = Math.hypot(ax - cx, az - cz);
      this.racingCurvature[i] = Math.abs((2 * cross) / (ab * bc * ca || 1));
    }
  }

  private linePoint(i: number): [number, number] {
    const d = this.racingLine[i];
    return [this.px[i] + this.tz[i] * d, this.pz[i] - this.tx[i] * d];
  }

  /** Strecke s in [0, length) bringen. */
  wrap(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  /** Kürzeste Differenz b − a entlang der Runde (−L/2 … L/2). */
  delta(a: number, b: number): number {
    const L = this.length;
    let d = (b - a) % L;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return d;
  }

  indexAt(s: number): number {
    return Math.floor(this.wrap(s) / SAMPLE_SPACING) % this.count;
  }

  /** Weltposition für (s, d). */
  pointAt(s: number, d: number, out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }) {
    const w = this.wrap(s) / SAMPLE_SPACING;
    const i = Math.floor(w) % this.count;
    const j = (i + 1) % this.count;
    const f = w - Math.floor(w);
    const cx = this.px[i] + (this.px[j] - this.px[i]) * f;
    const cz = this.pz[i] + (this.pz[j] - this.pz[i]) * f;
    const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * f;
    const tz = this.tz[i] + (this.tz[j] - this.tz[i]) * f;
    const tl = Math.hypot(tx, tz) || 1;
    // Linke Normale = (tz, -tx)
    out.x = cx + (tz / tl) * d;
    out.z = cz + (-tx / tl) * d;
    out.y = this.py[i] + (this.py[j] - this.py[i]) * f;
    return out;
  }

  heightAt(s: number): number {
    const w = this.wrap(s) / SAMPLE_SPACING;
    const i = Math.floor(w) % this.count;
    const j = (i + 1) % this.count;
    const f = w - Math.floor(w);
    return this.py[i] + (this.py[j] - this.py[i]) * f;
  }

  /** Richtung der Strecke bei s (Winkel; Vorwärts = (cos, sin)). */
  headingAt(s: number): number {
    const i = this.indexAt(s);
    return Math.atan2(this.tz[i], this.tx[i]);
  }

  /**
   * Projiziert einen Weltpunkt auf die Strecke. Mit `hint` (letzter Index) wird nur lokal gesucht,
   * damit benachbarte Streckenteile (Haarnadelkurven) nicht verwechselt werden.
   */
  project(x: number, z: number, hint = -1, out: Projection = { idx: 0, s: 0, d: 0 }): Projection {
    const n = this.count;
    let best = 0;
    let bestD = Infinity;
    if (hint < 0) {
      for (let i = 0; i < n; i++) {
        const dx = x - this.px[i];
        const dz = z - this.pz[i];
        const dd = dx * dx + dz * dz;
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
    } else {
      for (let k = -15; k <= 15; k++) {
        const i = (hint + k + n) % n;
        const dx = x - this.px[i];
        const dz = z - this.pz[i];
        const dd = dx * dx + dz * dz;
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
    }
    // Feinprojektion auf das Segment vor oder nach dem besten Punkt
    const i = best;
    const tx = this.tx[i];
    const tz = this.tz[i];
    const dx = x - this.px[i];
    const dz = z - this.pz[i];
    let along = dx * tx + dz * tz;
    along = Math.max(-SAMPLE_SPACING, Math.min(SAMPLE_SPACING, along));
    out.idx = i;
    out.s = this.wrap(i * SAMPLE_SPACING + along);
    out.d = dx * tz - dz * tx;
    return out;
  }

  /**
   * Ideallinie per «Gummiband»-Glättung: Jeder Punkt wird wiederholt zur Mitte seiner Nachbarn
   * gezogen und auf die Streckenbreite begrenzt. Ergibt eine kurze, kurvenschneidende Linie.
   */
  private computeRacingLine(): Float32Array {
    const n = this.count;
    const d = new Float32Array(n);
    const limit = this.halfWidth - 2.2;
    const step = 6; // Nachbarabstand in Abtastpunkten (glatter)
    for (let iter = 0; iter < 160; iter++) {
      for (let i = 0; i < n; i++) {
        const a = (i - step + n) % n;
        const b = (i + step) % n;
        const ax = this.px[a] + this.tz[a] * d[a];
        const az = this.pz[a] - this.tx[a] * d[a];
        const bx = this.px[b] + this.tz[b] * d[b];
        const bz = this.pz[b] - this.tx[b] * d[b];
        const mx = (ax + bx) / 2 - this.px[i];
        const mz = (az + bz) / 2 - this.pz[i];
        const target = mx * this.tz[i] - mz * this.tx[i];
        d[i] = Math.max(-limit, Math.min(limit, d[i] + (target - d[i]) * 0.5));
      }
    }
    return d;
  }
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function sampleCatmullRom(pts: [number, number, number][], perSeg: number): number[][] {
  const out: number[][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const p: number[] = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        p[c] =
          0.5 *
          (2 * p1[c] +
            (-p0[c] + p2[c]) * t +
            (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 +
            (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
      }
      out.push(p);
    }
  }
  return out;
}

function polylineLength(p: number[][]): number {
  let l = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    l += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return l;
}

function resample(p: number[][], len: number, n: number, ox: Float32Array, oz: Float32Array, oy: Float32Array) {
  const step = len / n;
  let seg = 0;
  let segStart = 0;
  let segLen = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
  for (let i = 0; i < n; i++) {
    const target = i * step;
    while (segStart + segLen < target && seg < p.length - 1) {
      segStart += segLen;
      seg++;
      const a = p[seg];
      const b = p[(seg + 1) % p.length];
      segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const a = p[seg];
    const b = p[(seg + 1) % p.length];
    const f = segLen > 0 ? (target - segStart) / segLen : 0;
    ox[i] = a[0] + (b[0] - a[0]) * f;
    oz[i] = a[1] + (b[1] - a[1]) * f;
    oy[i] = a[2] + (b[2] - a[2]) * f;
  }
}
