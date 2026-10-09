/**
 * Streckenelemente zur Laufzeit: Untergründe, Hürden, Hindernisse, Reifen, Schanzen, Tore,
 * rollende Stämme, Windräder, Brücken, Lawinen und Abkürzungen.
 * Bewegte Elemente hängen nur von der Rennzeit ab (deterministisch, keine eigenen Zustände).
 */
import { ELEMENTS } from '../config/balance';
import type { HurdleKind, ObstacleKind, ShortcutDef, SurfaceType, TrackData } from '../tracks/types';
import type { Track } from './track';

export interface ZoneRt {
  type: SurfaceType;
  /** Beginn in Metern */
  s: number;
  length: number;
  d0: number;
  d1: number;
  current: number;
}

export interface HurdleRt {
  s: number;
  height: number;
  kind: HurdleKind;
  gap: [number, number] | null;
}

export interface ObstacleRt {
  x: number;
  z: number;
  s: number;
  d: number;
  r: number;
  h: number;
  kind: ObstacleKind;
}

export interface ShortcutRt {
  def: ShortcutDef;
  fromS: number;
  toS: number;
  /** Länge der Hauptstrecke, die übersprungen wird */
  skip: number;
  /** Weg als Punkte (Welt), inkl. Ein- und Ausstieg */
  px: number[];
  pz: number[];
  /** Kumulierte Länge entlang des Wegs */
  cum: number[];
  length: number;
}

const SURFACE_PRIORITY: Record<SurfaceType, number> = { loch: 6, lava: 5, tiefwasser: 4, wasser: 3, eis: 2, matsch: 1, sand: 0 };

export class Elements {
  readonly zones: ZoneRt[] = [];
  readonly hurdles: HurdleRt[] = [];
  readonly obstacles: ObstacleRt[] = [];
  readonly shortcuts: ShortcutRt[] = [];

  constructor(
    readonly track: Track,
    readonly data: TrackData,
  ) {
    const L = track.length;
    const hw = track.halfWidth;
    for (const z of data.zones) {
      const w = z.width ?? hw * 2 + 4;
      const d = z.d ?? 0;
      this.zones.push({ type: z.type, s: z.s * L - z.length / 2, length: z.length, d0: d - w / 2, d1: d + w / 2, current: z.current ?? 0 });
    }
    for (const h of data.hurdles) {
      const kind = h.kind ?? 'huerde';
      this.hurdles.push({ s: h.s * L, height: ELEMENTS.hurdleHeight[kind], kind, gap: h.gap ?? null });
    }
    for (const o of data.obstacles) {
      const kind = o.kind ?? 'heuballen';
      const p = track.pointAt(o.s * L, o.d);
      this.obstacles.push({ x: p.x, z: p.z, s: o.s * L, d: o.d, r: ELEMENTS.obstacle[kind].r, h: ELEMENTS.obstacle[kind].h, kind });
    }
    for (const sc of data.shortcuts ?? []) this.shortcuts.push(this.buildShortcut(sc));
  }

  private buildShortcut(def: ShortcutDef): ShortcutRt {
    const t = this.track;
    const L = t.length;
    const edge = t.halfWidth - 1;
    const pts: [number, number][] = [];
    const a = t.pointAt(def.from * L, def.side * edge);
    pts.push([a.x, a.z]);
    for (const [s, d] of def.via ?? []) {
      const p = t.pointAt(s * L, d);
      pts.push([p.x, p.z]);
    }
    const b = t.pointAt(def.to * L, def.side * edge);
    pts.push([b.x, b.z]);
    // Weg glätten (Zwischenpunkte), damit er sich natürlich anfühlt
    const px: number[] = [];
    const pz: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3));
      for (let k = 0; k < n; k++) {
        px.push(x0 + ((x1 - x0) * k) / n);
        pz.push(z0 + ((z1 - z0) * k) / n);
      }
    }
    px.push(b.x);
    pz.push(b.z);
    const cum = [0];
    for (let i = 1; i < px.length; i++) cum.push(cum[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]));
    const fromS = def.from * L;
    const toS = def.to * L;
    return { def, fromS, toS, skip: t.delta(fromS, toS) > 0 ? t.delta(fromS, toS) : t.delta(fromS, toS) + L, px, pz, cum, length: cum[cum.length - 1] };
  }

  /** Untergrund bei (s, d) – die «gefährlichste» Fläche gewinnt. */
  surfaceAt(s: number, d: number): ZoneRt | null {
    let best: ZoneRt | null = null;
    for (const z of this.zones) {
      const rel = this.track.delta(z.s, s);
      if (rel < 0 || rel > z.length || d < z.d0 || d > z.d1) continue;
      if (!best || SURFACE_PRIORITY[z.type] > SURFACE_PRIORITY[best.type]) best = z;
    }
    return best;
  }

  // ---- Bewegte Elemente (nur abhängig von der Zeit) ----

  gateOpen(i: number, time: number): boolean {
    const g = this.data.gates![i];
    const ph = (((time + (g.phase ?? 0)) % g.period) + g.period) % g.period;
    return ph < g.period * g.open;
  }

  /** Öffnungsgrad 0 (zu) … 1 (offen), für die Darstellung */
  gateAmount(i: number, time: number): number {
    const g = this.data.gates![i];
    const ph = (((time + (g.phase ?? 0)) % g.period) + g.period) % g.period;
    const openT = g.period * g.open;
    const ramp = 0.6;
    return ph < openT ? Math.min(1, ph / ramp, (openT - ph) / ramp) : 0;
  }

  /** Lage (s in Metern) eines rollenden Stamms */
  logS(i: number, time: number): number {
    const l = this.data.logs![i];
    const ph = ((time + (l.phase ?? 0)) / l.period) * Math.PI * 2;
    return l.s * this.track.length + l.range * (0.5 - 0.5 * Math.cos(ph));
  }

  /** Mittelpunkt und Spitze des Windrad-Flügels (Welt) */
  spinnerArm(i: number, time: number): { cx: number; cz: number; tx: number; tz: number } {
    const sp = this.data.spinners![i];
    const c = this.track.pointAt(sp.s * this.track.length, sp.d);
    const a = (time / sp.period) * Math.PI * 2;
    return { cx: c.x, cz: c.z, tx: c.x + Math.cos(a) * sp.radius, tz: c.z + Math.sin(a) * sp.radius };
  }

  /** Seitliche Verschiebung einer schaukelnden Brücke */
  bridgeOffset(i: number, time: number): number {
    const b = this.data.bridges![i];
    return b.sway * Math.sin((time / b.period) * Math.PI * 2);
  }

  /** Brücke an dieser Stelle (Index) oder −1 */
  bridgeAt(s: number): number {
    const br = this.data.bridges ?? [];
    for (let i = 0; i < br.length; i++) {
      const b = br[i];
      const rel = this.track.delta(b.s * this.track.length - b.length / 2, s);
      if (rel >= 0 && rel <= b.length) return i;
    }
    return -1;
  }

  /**
   * Lawine: Zustand zur Zeit `time`, wenn die Rennleitung in Runde `lap` ist.
   * warn = Grollen (Vorwarnung), front = seitliche Lage der Schneewalze (oder null).
   */
  avalanche(i: number, time: number, lap: number): { warn: boolean; front: number | null } {
    const av = this.data.avalanches![i];
    if (lap < av.fromLap || time < 0) return { warn: false, front: null };
    const A = ELEMENTS.avalanche;
    const ph = time % av.period;
    if (ph < A.warn) return { warn: true, front: null };
    const k = (ph - A.warn) / A.sweep;
    if (k > 1) return { warn: false, front: null };
    const hw = this.track.halfWidth + 3;
    return { warn: false, front: hw - k * hw * 2 };
  }

  geyserActive(time: number, i: number): boolean {
    const G = ELEMENTS.geyser;
    const ph = (((time + i * 1.7) % G.period) + G.period) % G.period;
    return ph < G.active;
  }

  /** Projektion eines Punkts auf einen Abkürzungsweg: Anteil u (0–1) und seitlicher Abstand e */
  projectShortcut(k: number, x: number, z: number): { u: number; e: number; along: number } {
    const sc = this.shortcuts[k];
    let best = { u: 0, e: Infinity, along: 0 };
    for (let i = 0; i < sc.px.length - 1; i++) {
      const ax = sc.px[i];
      const az = sc.pz[i];
      const bx = sc.px[i + 1];
      const bz = sc.pz[i + 1];
      const vx = bx - ax;
      const vz = bz - az;
      const l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      const qx = ax + vx * t;
      const qz = az + vz * t;
      const e = Math.hypot(x - qx, z - qz);
      if (e < best.e) {
        const along = sc.cum[i] + Math.sqrt(l2) * t;
        best = { u: along / sc.length, e, along };
      }
    }
    return best;
  }

  /** Punkt auf dem Abkürzungsweg bei Weglänge `along` */
  shortcutPoint(k: number, along: number): { x: number; z: number } {
    const sc = this.shortcuts[k];
    const a = Math.max(0, Math.min(sc.length, along));
    for (let i = 0; i < sc.px.length - 1; i++) {
      if (a <= sc.cum[i + 1] || i === sc.px.length - 2) {
        const seg = sc.cum[i + 1] - sc.cum[i] || 1;
        const t = (a - sc.cum[i]) / seg;
        return { x: sc.px[i] + (sc.px[i + 1] - sc.px[i]) * t, z: sc.pz[i] + (sc.pz[i + 1] - sc.pz[i]) * t };
      }
    }
    return { x: sc.px[0], z: sc.pz[0] };
  }

  /** Darf ein Tier diese Abkürzung benutzen? */
  shortcutAllowed(k: number, radius: number, alt: number): boolean {
    const kind = this.shortcuts[k].def.kind;
    if (kind === 'klein') return radius <= ELEMENTS.smallRadius;
    if (kind === 'sprung') return alt >= 0.6;
    return true;
  }
}
