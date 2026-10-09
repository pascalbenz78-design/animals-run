/**
 * Stilisierte Low-Poly-Tiermodelle aus Grundformen, animiert per Code
 * (Laufzyklus, Sprung, Ausgebremst-Sein mit Sternen, Rutschen, Jubeln).
 * Jedes bewegliche Teil ist ein einziges eingefärbtes Mesh (wenige Draw-Calls).
 */
import * as THREE from 'three';
import { G, mesh, part } from '../render/geo';
import type { AnimalDef, Appearance, Species } from './animals';

export interface AnimPose {
  /** Tempo in m/s */
  speed: number;
  topSpeed: number;
  grounded: boolean;
  alt: number;
  vy: number;
  /** Laufzyklus-Phase in rad */
  stride: number;
  /** Stolpern (Hürde, Ballen) */
  stumble: number;
  /** Gestoppt (Superkraft) */
  stun: number;
  /** Rutschen (Apfel) */
  spin: number;
  celebrate: boolean;
  /** Zeit in Sekunden (für Leerlauf-Animationen) */
  time: number;
}

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  /** Phasenversatz im Laufzyklus (0–1) */
  offset: number;
  front: boolean;
}

const EYE = 0x1a1410;
const WHITE = 0xffffff;
const PINK = 0xe8a4ad;

/** Höhe des Körpers, Sternenposition und Laufweise je Tierart */
const SPECIES_LAYOUT: Record<Species, { body: number; stars: [number, number]; amp: [number, number]; bob: number }> = {
  pferd: { body: 1.05, stars: [2.35, 0.9], amp: [0.2, 0.42], bob: 0.09 },
  katze: { body: 0.48, stars: [1.35, 0.55], amp: [0.3, 0.55], bob: 0.05 },
  hund: { body: 0.62, stars: [1.55, 0.6], amp: [0.28, 0.5], bob: 0.06 },
  hamster: { body: 0.16, stars: [1.05, 0.25], amp: [0.5, 0.6], bob: 0.06 },
};

export class AnimalModel {
  readonly root = new THREE.Group();
  /** Alles, was sich dreht/neigt (für Rutschen und Wirbelsturm) */
  readonly spinner = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly tail = new THREE.Group();
  private tailTip?: THREE.Group;
  private readonly legs: Leg[] = [];
  private readonly stars = new THREE.Group();
  private layout: (typeof SPECIES_LAYOUT)[Species];
  private readonly species: Species;
  private smoothPitch = 0;

  constructor(readonly def: AnimalDef) {
    this.species = def.species;
    this.layout = SPECIES_LAYOUT[def.species];
    this.root.add(this.spinner);
    this.spinner.add(this.body);
    const c = def.appearance;
    if (def.species === 'pferd') this.buildHorse(c);
    else if (def.species === 'katze') this.buildCat(c);
    else if (def.species === 'hund') this.buildDog(c);
    else this.buildHamster(c);
    this.buildStars();
    this.body.position.y = this.layout.body;
  }

  /** Bein mit Hüft- und Kniegelenk */
  private addLeg(
    x: number,
    y: number,
    z: number,
    upper: number,
    lower: number,
    r: [number, number, number],
    colUpper: number,
    colLower: number,
    foot: THREE.BufferGeometry[],
    offset: number,
    front: boolean,
  ) {
    const hip = new THREE.Group();
    hip.position.set(x, y, z);
    hip.add(mesh([part(G.cyl(r[0], r[1], upper, 6), colUpper, { pos: [0, -upper / 2, 0] })]));
    const knee = new THREE.Group();
    knee.position.set(0, -upper, 0);
    knee.add(mesh([part(G.cyl(r[1], r[2], lower, 6), colLower, { pos: [0, -lower / 2, 0] }), ...foot]));
    hip.add(knee);
    this.body.add(hip);
    this.legs.push({ hip, knee, offset, front });
  }

  private buildHorse(c: Appearance) {
    const hoof = c.hooves ?? 0x2b2018;
    const legCol = c.legs ?? c.body;
    const strong = c.build === 'kraeftig';
    const compact = c.build === 'kompakt';
    const w = strong ? 1.18 : compact ? 1.08 : 1;
    const len = compact ? 0.9 : strong ? 0.97 : 1;
    const legLen = strong || compact ? 0.92 : 1;

    // Rumpf
    const torso = [
      part(G.capsule(0.36, 1.0 * len, 3, 8), c.body, { pos: [0, 0.32, 0], rot: [Math.PI / 2, 0, 0], scale: [w, 1, 0.92 * w] }),
      part(G.ball(0.3 * w, 1), c.body, { pos: [0, 0.38, -0.55 * len] }), // Kruppe
      part(G.ball(0.32 * w, 1), c.body, { pos: [0, 0.36, 0.5 * len] }), // Brust
    ];
    for (const pt of [c.patches, c.patches2]) {
      if (!pt) continue;
      for (const [x, y, z, r] of pt.spots) {
        torso.push(part(G.ball(r, 1), pt.color, { pos: [x * w, 0.32 + y, z * len], scale: [0.55, 1, 1.2] }));
      }
    }
    if (c.dorsalStripe) torso.push(part(G.box(0.07, 0.03, 1.4 * len), c.dorsalStripe, { pos: [0, 0.69, -0.05] }));
    this.body.add(mesh(torso));

    // Hals und Kopf (gemeinsam nickend)
    this.head.position.set(0, 0.55, 0.62 * len);
    const neckCol = c.body;
    const headParts = [
      part(G.cyl(0.17 * w, 0.27 * w, 0.8, 7), neckCol, { pos: [0, 0.3, 0.12], rot: [0.55, 0, 0] }),
      part(G.box(0.3 * w, 0.32, 0.5), c.body, { pos: [0, 0.68, 0.42], rot: [0.75, 0, 0] }),
      part(G.box(0.24 * w, 0.24, 0.3), c.muzzle ?? c.body, { pos: [0, 0.5, 0.62], rot: [0.75, 0, 0] }),
      part(G.cone(0.07, 0.2, 4), c.body, { pos: [0.1, 0.95, 0.22], rot: [-0.2, 0, 0.2] }),
      part(G.cone(0.07, 0.2, 4), c.body, { pos: [-0.1, 0.95, 0.22], rot: [-0.2, 0, -0.2] }),
      part(G.ball(0.045), c.eyes ?? EYE, { pos: [0.155 * w, 0.76, 0.4] }),
      part(G.ball(0.045), c.eyes ?? EYE, { pos: [-0.155 * w, 0.76, 0.4] }),
      part(G.ball(0.03), 0x1a1a1a, { pos: [0.07, 0.42, 0.75] }),
      part(G.ball(0.03), 0x1a1a1a, { pos: [-0.07, 0.42, 0.75] }),
    ];
    if (c.face) headParts.push(part(G.box(0.1, 0.05, 0.42), c.face, { pos: [0, 0.75, 0.5], rot: [0.75, 0, 0] }));
    if (c.neckSpot) headParts.push(part(G.ball(0.13, 1), c.neckSpot, { pos: [0, 0.06, -0.04], scale: [1.4, 0.5, 1.2] }));
    if (c.standingMane) {
      // Stehmähne: aufrecht, aussen hell, innen dunkler Mittelstreifen
      for (let i = 0; i < 6; i++) {
        const y = 0.84 - i * 0.12;
        const z = 0.2 - i * 0.085;
        headParts.push(part(G.box(0.1, 0.16, 0.12), c.mane, { pos: [0, y, z], rot: [0.55, 0, 0] }));
        headParts.push(part(G.box(0.035, 0.18, 0.125), c.mane2 ?? 0x222222, { pos: [0, y + 0.01, z], rot: [0.55, 0, 0] }));
      }
    } else {
      // Mähne als Kamm entlang des Halses (bei Tinkern üppig und zweifarbig)
      const n = strong ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const col = c.mane2 && i % 2 ? c.mane2 : c.mane;
        const t = i / (n - 1);
        headParts.push(
          part(G.box(strong ? 0.2 : 0.08, strong ? 0.32 : 0.2, 0.2), col, {
            pos: [strong ? (i % 2 ? 0.07 : -0.07) : 0, 0.82 - t * 0.56, 0.18 - t * 0.4],
            rot: [0.5, 0, strong ? (i % 2 ? 0.3 : -0.3) : 0],
          }),
        );
      }
      headParts.push(part(G.box(strong ? 0.18 : 0.1, 0.12, 0.2), c.mane2 ?? c.mane, { pos: [0, 0.92, 0.36], rot: [0.9, 0, 0] }));
    }
    this.head.add(mesh(headParts));
    this.body.add(this.head);

    // Schweif
    this.tail.position.set(0, 0.5, -0.8 * len);
    const tw = strong ? 1.5 : 1;
    this.tail.add(
      mesh([
        part(G.cyl(0.07 * tw, 0.13 * tw, 0.35, 6), c.tail, { pos: [0, -0.05, -0.12], rot: [-0.9, 0, 0] }),
        part(G.cyl(0.13 * tw, 0.05 * tw, strong ? 0.75 : 0.6, 6), c.mane2 && strong ? c.mane2 : c.tail, { pos: [0, -0.45, -0.24], rot: [-0.25, 0, 0] }),
      ]),
    );
    this.body.add(this.tail);

    // Beine: vorne / hinten, je mit Knie-Gelenk; Tinker mit Fesselbehang
    const r: [number, number, number] = strong ? [0.13, 0.1, 0.09] : [0.11, 0.08, 0.065];
    const up = 0.55 * legLen;
    const lo = 0.55 * legLen;
    const legDefs: [number, number, number, boolean][] = [
      [0.2 * w, 0.62 * len, 0.0, true],
      [-0.2 * w, 0.62 * len, 0.12, true],
      [0.2 * w, -0.6 * len, 0.5, false],
      [-0.2 * w, -0.6 * len, 0.62, false],
    ];
    for (const [x, z, offset, front] of legDefs) {
      const foot = [part(G.cyl(r[2] + 0.02, r[2] + 0.03, 0.12, 6), hoof, { pos: [0, -lo - 0.05, 0.01] })];
      if (c.feathering) foot.push(part(G.cone(0.17, 0.3, 7), c.feathering, { pos: [0, -lo + 0.06, 0] }));
      this.addLeg(x, 0.2, z, up, lo, r, legCol, legCol, foot, offset, front);
    }
    // Kürzere Beine: Körper tiefer
    this.layout = { ...this.layout, body: this.layout.body - (1 - legLen) * 1.1 };
  }

  private buildCat(c: Appearance) {
    const belly = c.belly ?? c.body;
    const stripes = c.stripes;
    const torso = [
      part(G.capsule(0.25, 0.62, 3, 8), c.body, { pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0] }),
      part(G.capsule(0.19, 0.5, 2, 7), belly, { pos: [0, 0.08, 0.02], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.8] }),
    ];
    if (stripes) {
      // Tigerstreifen als schmale Bögen über den Rücken
      for (let i = 0; i < 5; i++) {
        const z = -0.4 + i * 0.19;
        torso.push(part(G.box(0.2, 0.03, 0.06), stripes, { pos: [0, 0.445, z] }));
        torso.push(part(G.box(0.16, 0.03, 0.055), stripes, { pos: [0.15, 0.39, z], rot: [0, 0, -0.75] }));
        torso.push(part(G.box(0.16, 0.03, 0.055), stripes, { pos: [-0.15, 0.39, z], rot: [0, 0, 0.75] }));
      }
    }
    if (c.patches) {
      for (const [x, y, z, r] of c.patches.spots) torso.push(part(G.ball(r, 1), c.patches.color, { pos: [x, 0.2 + y * 0.6, z], scale: [0.6, 1, 1.3] }));
    }
    this.body.add(mesh(torso));
    // Kopf
    this.head.position.set(0, 0.36, 0.5);
    const headParts = [
      part(G.ball(0.26, 1), c.body, { pos: [0, 0.14, 0.12], scale: [1.1, 0.95, 1] }),
      part(G.ball(0.13, 1), c.muzzle ?? belly, { pos: [0, 0.06, 0.32], scale: [1.2, 0.8, 0.8] }),
      part(G.ball(0.035), 0xe58a9a, { pos: [0, 0.11, 0.42] }),
      part(G.cone(0.1, 0.2, 4), c.body, { pos: [0.15, 0.4, 0.08], rot: [0, 0.8, 0.25] }),
      part(G.cone(0.1, 0.2, 4), c.body, { pos: [-0.15, 0.4, 0.08], rot: [0, -0.8, -0.25] }),
      part(G.cone(0.055, 0.12, 4), PINK, { pos: [0.15, 0.39, 0.1], rot: [0, 0.8, 0.25] }),
      part(G.cone(0.055, 0.12, 4), PINK, { pos: [-0.15, 0.39, 0.1], rot: [0, -0.8, -0.25] }),
      part(G.ball(0.055, 1), c.eyes ?? 0xb5d33a, { pos: [0.11, 0.2, 0.32] }),
      part(G.ball(0.055, 1), c.eyes ?? 0xb5d33a, { pos: [-0.11, 0.2, 0.32] }),
      part(G.box(0.02, 0.07, 0.02), EYE, { pos: [0.11, 0.2, 0.37] }),
      part(G.box(0.02, 0.07, 0.02), EYE, { pos: [-0.11, 0.2, 0.37] }),
      // Schnurrhaare
      part(G.box(0.22, 0.008, 0.008), WHITE, { pos: [0.2, 0.06, 0.36], rot: [0, 0.2, 0.1] }),
      part(G.box(0.22, 0.008, 0.008), WHITE, { pos: [-0.2, 0.06, 0.36], rot: [0, -0.2, -0.1] }),
    ];
    if (c.face) headParts.push(part(G.box(0.07, 0.2, 0.05), c.face, { pos: [0, 0.24, 0.33], rot: [-0.3, 0, 0] }));
    if (stripes) {
      headParts.push(part(G.box(0.05, 0.14, 0.05), stripes, { pos: [0, 0.37, 0.2], rot: [0.3, 0, 0] }));
      headParts.push(part(G.box(0.05, 0.12, 0.05), stripes, { pos: [0.08, 0.35, 0.22], rot: [0.3, 0, 0.3] }));
      headParts.push(part(G.box(0.05, 0.12, 0.05), stripes, { pos: [-0.08, 0.35, 0.22], rot: [0.3, 0, -0.3] }));
    }
    this.head.add(mesh(headParts));
    this.body.add(this.head);
    // Schwanz aus zwei Gliedern (nach oben gebogen)
    this.tail.position.set(0, 0.28, -0.52);
    this.tail.add(mesh([part(G.cyl(0.05, 0.065, 0.4, 6), c.tail, { pos: [0, 0.16, -0.08], rot: [-0.45, 0, 0] })]));
    const tip = new THREE.Group();
    tip.position.set(0, 0.34, -0.17);
    tip.add(
      mesh([
        part(G.cyl(0.045, 0.05, 0.35, 6), c.tail, { pos: [0, 0.16, 0.02], rot: [0.15, 0, 0] }),
        part(G.ball(0.05), stripes ?? c.patches?.color ?? c.tail, { pos: [0, 0.34, 0.04] }),
      ]),
    );
    this.tail.add(tip);
    this.tailTip = tip;
    this.body.add(this.tail);
    // Beine
    const paw = c.paws ?? belly;
    const legDefs: [number, number, number, boolean][] = [
      [0.13, 0.36, 0.0, true],
      [-0.13, 0.36, 0.5, true],
      [0.13, -0.36, 0.25, false],
      [-0.13, -0.36, 0.75, false],
    ];
    for (const [x, z, offset, front] of legDefs) {
      this.addLeg(x, 0.08, z, 0.27, 0.25, [0.08, 0.06, 0.05], c.body, c.paws ?? (front ? belly : c.body), [part(G.ball(0.065), paw, { pos: [0, -0.26, 0.03], scale: [1, 0.6, 1.2] })], offset, front);
    }
  }

  private buildDog(c: Appearance) {
    const belly = c.belly ?? c.body;
    const face = c.face ?? belly;
    this.body.add(
      mesh([
        part(G.capsule(0.27, 0.72, 3, 8), c.body, { pos: [0, 0.22, 0], rot: [Math.PI / 2, 0, 0] }),
        part(G.capsule(0.2, 0.55, 2, 7), belly, { pos: [0, 0.09, 0.08], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.8] }),
        // dichtes Fell am Hals
        part(G.ball(0.3, 1), c.body, { pos: [0, 0.32, 0.4], scale: [1, 1, 0.9] }),
        part(G.ball(0.22, 1), belly, { pos: [0, 0.18, 0.55], scale: [1, 1.1, 0.7] }),
      ]),
    );
    this.head.position.set(0, 0.45, 0.62);
    this.head.add(
      mesh([
        part(G.ball(0.24, 1), c.body, { pos: [0, 0.14, 0.05], scale: [1.05, 0.95, 1.05] }),
        // weisse Gesichtsmaske und Schnauze
        part(G.ball(0.17, 1), face, { pos: [0, 0.06, 0.16], scale: [1.15, 0.85, 1] }),
        part(G.box(0.16, 0.13, 0.24), face, { pos: [0, 0.0, 0.33] }),
        part(G.ball(0.05), 0x111111, { pos: [0, 0.06, 0.46] }),
        part(G.box(0.05, 0.1, 0.08), face, { pos: [0.08, 0.26, 0.2], rot: [0, 0, 0.2] }),
        part(G.box(0.05, 0.1, 0.08), face, { pos: [-0.08, 0.26, 0.2], rot: [0, 0, -0.2] }),
        // Ohren aufrecht
        part(G.cone(0.09, 0.22, 4), c.body, { pos: [0.12, 0.42, 0.0], rot: [-0.1, 0.78, 0.15] }),
        part(G.cone(0.09, 0.22, 4), c.body, { pos: [-0.12, 0.42, 0.0], rot: [-0.1, 0.78, -0.15] }),
        part(G.cone(0.05, 0.13, 4), face, { pos: [0.12, 0.4, 0.02], rot: [-0.1, 0.78, 0.15] }),
        part(G.cone(0.05, 0.13, 4), face, { pos: [-0.12, 0.4, 0.02], rot: [-0.1, 0.78, -0.15] }),
        part(G.ball(0.045, 1), c.eyes ?? 0x3a2a1a, { pos: [0.1, 0.18, 0.24] }),
        part(G.ball(0.045, 1), c.eyes ?? 0x3a2a1a, { pos: [-0.1, 0.18, 0.24] }),
        part(G.ball(0.022), EYE, { pos: [0.1, 0.18, 0.28] }),
        part(G.ball(0.022), EYE, { pos: [-0.1, 0.18, 0.28] }),
        part(G.box(0.06, 0.02, 0.08), 0xe86a7a, { pos: [0, -0.07, 0.38], rot: [0.3, 0, 0] }),
      ]),
    );
    this.body.add(this.head);
    // Husky-Schwanz: buschig, über den Rücken gerollt
    this.tail.position.set(0, 0.36, -0.56);
    this.tail.add(mesh([part(G.capsule(0.08, 0.25, 2, 6), c.body, { pos: [0, 0.14, -0.06], rot: [-0.5, 0, 0] })]));
    const tip = new THREE.Group();
    tip.position.set(0, 0.3, -0.1);
    tip.add(mesh([part(G.capsule(0.075, 0.2, 2, 6), c.body, { pos: [0, 0.1, 0.08], rot: [0.9, 0, 0] }), part(G.ball(0.07), belly, { pos: [0, 0.14, 0.2] })]));
    this.tail.add(tip);
    this.tailTip = tip;
    this.body.add(this.tail);
    const paw = c.paws ?? belly;
    const legDefs: [number, number, number, boolean][] = [
      [0.14, 0.42, 0.0, true],
      [-0.14, 0.42, 0.5, true],
      [0.14, -0.4, 0.25, false],
      [-0.14, -0.4, 0.75, false],
    ];
    for (const [x, z, offset, front] of legDefs) {
      this.addLeg(x, 0.08, z, 0.32, 0.32, [0.09, 0.065, 0.055], c.body, paw, [part(G.ball(0.075), paw, { pos: [0, -0.33, 0.03], scale: [1, 0.6, 1.25] })], offset, front);
    }
  }

  private buildHamster(c: Appearance) {
    const belly = c.belly ?? c.body;
    this.body.add(
      mesh([
        part(G.ball(0.42, 1), c.body, { pos: [0, 0.3, -0.05], scale: [1, 0.85, 1.15] }),
        part(G.ball(0.34, 1), belly, { pos: [0, 0.2, 0.08], scale: [0.95, 0.75, 1.1] }),
        part(G.ball(0.06), c.body, { pos: [0, 0.32, -0.52] }),
      ]),
    );
    this.head.position.set(0, 0.38, 0.32);
    this.head.add(
      mesh([
        part(G.ball(0.3, 1), c.body, { pos: [0, 0.08, 0.1], scale: [1.05, 0.95, 1] }),
        // Pausbacken
        part(G.ball(0.16, 1), belly, { pos: [0.17, -0.02, 0.22] }),
        part(G.ball(0.16, 1), belly, { pos: [-0.17, -0.02, 0.22] }),
        part(G.ball(0.04), 0xd88a96, { pos: [0, 0.04, 0.4] }),
        part(G.ball(0.055, 1), EYE, { pos: [0.13, 0.15, 0.31] }),
        part(G.ball(0.055, 1), EYE, { pos: [-0.13, 0.15, 0.31] }),
        part(G.ball(0.018), WHITE, { pos: [0.14, 0.17, 0.36] }),
        part(G.ball(0.018), WHITE, { pos: [-0.12, 0.17, 0.36] }),
        // runde Ohren
        part(G.cyl(0.09, 0.09, 0.04, 8), c.body, { pos: [0.18, 0.33, 0.02], rot: [1.3, 0, 0.3] }),
        part(G.cyl(0.09, 0.09, 0.04, 8), c.body, { pos: [-0.18, 0.33, 0.02], rot: [1.3, 0, -0.3] }),
        part(G.cyl(0.055, 0.055, 0.045, 8), PINK, { pos: [0.18, 0.33, 0.04], rot: [1.3, 0, 0.3] }),
        part(G.cyl(0.055, 0.055, 0.045, 8), PINK, { pos: [-0.18, 0.33, 0.04], rot: [1.3, 0, -0.3] }),
        part(G.box(0.18, 0.006, 0.006), WHITE, { pos: [0.18, 0.03, 0.36], rot: [0, 0.3, 0.1] }),
        part(G.box(0.18, 0.006, 0.006), WHITE, { pos: [-0.18, 0.03, 0.36], rot: [0, -0.3, -0.1] }),
      ]),
    );
    this.body.add(this.head);
    this.body.add(this.tail);
    const paw = c.paws ?? PINK;
    const legDefs: [number, number, number, boolean][] = [
      [0.18, 0.22, 0.0, true],
      [-0.18, 0.22, 0.5, true],
      [0.2, -0.25, 0.25, false],
      [-0.2, -0.25, 0.75, false],
    ];
    for (const [x, z, offset, front] of legDefs) {
      this.addLeg(x, 0.08, z, 0.07, 0.07, [0.07, 0.06, 0.05], c.body, belly, [part(G.ball(0.06), paw, { pos: [0, -0.08, 0.04], scale: [1, 0.5, 1.3] })], offset, front);
    }
  }

  private buildStars() {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.14 : 0.06;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(geo, mat);
      s.userData.angle = (i / 4) * Math.PI * 2;
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.stars.position.set(0, this.layout.stars[0], this.layout.stars[1]);
    this.root.add(this.stars);
  }

  /** Pose für den aktuellen Frame setzen. */
  animate(p: AnimPose, dt: number) {
    const run = Math.min(1, p.speed / 8);
    const cycle = p.stride;
    const amp = this.layout.amp[0] + this.layout.amp[1] * run;
    const isHorse = this.species === 'pferd';

    if (!p.grounded) {
      // Sprung: Beine anziehen
      const tuck = Math.min(1, 0.4 + Math.abs(p.vy) * 0.08);
      for (const l of this.legs) {
        l.hip.rotation.x = l.front ? -0.9 * tuck : 0.7 * tuck;
        l.knee.rotation.x = l.front ? 1.4 * tuck : -0.2 * tuck;
      }
    } else if (p.speed > 0.3) {
      for (const l of this.legs) {
        const ph = cycle + l.offset * Math.PI * 2;
        l.hip.rotation.x = Math.sin(ph) * amp;
        // Knie beugt sich in der Rückholphase
        const bend = Math.max(0, Math.cos(ph)) * amp * 1.3;
        l.knee.rotation.x = l.front ? bend : -bend * 0.6;
      }
    } else {
      for (const l of this.legs) {
        l.hip.rotation.x *= 0.85;
        l.knee.rotation.x *= 0.85;
      }
    }

    // Körper: auf und ab, Neigung beim Springen
    const bob = p.grounded ? Math.abs(Math.sin(cycle)) * this.layout.bob * run : 0;
    const breathe = Math.sin(p.time * 2.2) * 0.012 * (1 - run);
    this.body.position.y = this.layout.body + bob + breathe;
    let pitch = p.grounded ? Math.sin(cycle * 2) * 0.04 * run : -Math.max(-0.35, Math.min(0.35, p.vy * 0.05));
    let roll = 0;
    const dazed = p.stumble > 0 || p.stun > 0;
    if (dazed) {
      roll = Math.sin(p.time * (p.stun > 0 ? 9 : 22)) * (p.stun > 0 ? 0.18 : 0.12);
      pitch += 0.15;
    }
    if (p.celebrate && p.grounded) {
      // Jubeln: Pferd steigt, die anderen hüpfen
      const c = Math.max(0, Math.sin(p.time * 4));
      if (isHorse) pitch -= c * 0.5;
      else this.body.position.y += c * 0.25;
    }
    this.smoothPitch += (pitch - this.smoothPitch) * Math.min(1, dt * 12);
    this.body.rotation.x = this.smoothPitch;
    this.body.rotation.z = roll;

    // Rutschen: das Tier dreht sich um sich selbst
    if (p.spin > 0) this.spinner.rotation.y += dt * 14;
    else this.spinner.rotation.y *= Math.max(0, 1 - dt * 10);

    // Kopf nickt im Takt, Schweif schwingt
    this.head.rotation.x = Math.sin(cycle * 2 + 1) * 0.08 * run + (dazed ? 0.3 : 0);
    this.tail.rotation.x = (isHorse ? 0.25 : -0.1) * run + Math.sin(cycle * 2) * 0.1 * run;
    this.tail.rotation.z = Math.sin(p.time * (1.5 + run * 4)) * 0.18;
    if (this.tailTip) this.tailTip.rotation.x = (this.species === 'hund' ? 0 : 0.3) + Math.sin(p.time * 3) * 0.2 - run * 0.4;

    // Sterne über dem Kopf (Ausgebremst / Stolpern)
    this.stars.visible = dazed;
    if (this.stars.visible) {
      this.stars.children.forEach((s) => {
        const a = (s.userData.angle as number) + p.time * 6;
        s.position.set(Math.cos(a) * 0.4, Math.sin(p.time * 8 + a) * 0.05, Math.sin(a) * 0.4);
        s.rotation.y = p.time * 5;
      });
    }
  }

  setShadows(on: boolean) {
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = on;
    });
  }
}
