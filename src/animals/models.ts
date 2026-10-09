/**
 * Stilisierte Low-Poly-Tiermodelle aus Grundformen, animiert per Code
 * (Laufzyklus, Sprung, Ausgebremst-Sein mit Sternen, Jubeln).
 * Jedes bewegliche Teil ist ein einziges eingefärbtes Mesh (wenige Draw-Calls).
 */
import * as THREE from 'three';
import { G, mesh, part } from '../render/geo';
import type { AnimalDef, Appearance } from './animals';

export interface AnimPose {
  /** Tempo in m/s */
  speed: number;
  topSpeed: number;
  grounded: boolean;
  alt: number;
  vy: number;
  /** Laufzyklus-Phase in rad */
  stride: number;
  stumble: number;
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

export class AnimalModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly tailTip?: THREE.Group;
  private readonly legs: Leg[] = [];
  private readonly stars = new THREE.Group();
  private readonly bodyHeight: number;
  private readonly isHorse: boolean;
  private smoothPitch = 0;

  constructor(readonly def: AnimalDef) {
    this.isHorse = def.species === 'pferd';
    this.root.add(this.body);
    if (this.isHorse) {
      this.bodyHeight = 1.05;
      this.buildHorse(def.appearance);
    } else {
      this.bodyHeight = 0.48;
      this.tailTip = this.buildCat(def.appearance);
    }
    this.buildStars();
    this.body.position.y = this.bodyHeight;
  }

  private buildHorse(c: Appearance) {
    const hoof = c.hooves ?? 0x2b2018;
    const legCol = c.legs ?? c.body;
    // Rumpf
    this.body.add(
      mesh([
        part(G.capsule(0.36, 1.0, 3, 8), c.body, { pos: [0, 0.32, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.92] }),
        part(G.ball(0.3, 1), c.body, { pos: [0, 0.38, -0.55] }), // Kruppe
        part(G.ball(0.32, 1), c.body, { pos: [0, 0.36, 0.5] }), // Brust
      ]),
    );
    // Hals und Kopf (gemeinsam nickend)
    this.head.position.set(0, 0.55, 0.62);
    this.head.add(
      mesh([
        part(G.cyl(0.17, 0.27, 0.8, 7), c.body, { pos: [0, 0.3, 0.12], rot: [0.55, 0, 0] }),
        part(G.box(0.3, 0.32, 0.5), c.body, { pos: [0, 0.68, 0.42], rot: [0.75, 0, 0] }),
        part(G.box(0.24, 0.24, 0.3), c.muzzle ?? c.body, { pos: [0, 0.5, 0.62], rot: [0.75, 0, 0] }),
        part(G.cone(0.07, 0.2, 4), c.body, { pos: [0.1, 0.95, 0.22], rot: [-0.2, 0, 0.2] }),
        part(G.cone(0.07, 0.2, 4), c.body, { pos: [-0.1, 0.95, 0.22], rot: [-0.2, 0, -0.2] }),
        part(G.ball(0.045), EYE, { pos: [0.155, 0.76, 0.4] }),
        part(G.ball(0.045), EYE, { pos: [-0.155, 0.76, 0.4] }),
        part(G.ball(0.03), 0x1a1a1a, { pos: [0.07, 0.42, 0.75] }),
        part(G.ball(0.03), 0x1a1a1a, { pos: [-0.07, 0.42, 0.75] }),
        // Mähne als Kamm entlang des Halses
        ...[0, 1, 2, 3, 4].map((i) =>
          part(G.box(0.08, 0.2, 0.2), c.mane, { pos: [0, 0.82 - i * 0.14, 0.18 - i * 0.1], rot: [0.5, 0, 0] }),
        ),
        part(G.box(0.1, 0.12, 0.18), c.mane, { pos: [0, 0.92, 0.36], rot: [0.9, 0, 0] }), // Stirnschopf
      ]),
    );
    this.body.add(this.head);
    // Schweif
    this.tail.position.set(0, 0.5, -0.8);
    this.tail.add(
      mesh([
        part(G.cyl(0.07, 0.13, 0.35, 6), c.tail, { pos: [0, -0.05, -0.12], rot: [-0.9, 0, 0] }),
        part(G.cyl(0.13, 0.05, 0.6, 6), c.tail, { pos: [0, -0.42, -0.24], rot: [-0.25, 0, 0] }),
      ]),
    );
    this.body.add(this.tail);
    // Beine: vorne / hinten, je mit Knie-Gelenk
    const legDefs: [number, number, number, boolean][] = [
      [0.2, 0.62, 0.0, true],
      [-0.2, 0.62, 0.12, true],
      [0.2, -0.6, 0.5, false],
      [-0.2, -0.6, 0.62, false],
    ];
    for (const [x, z, offset, front] of legDefs) {
      const hip = new THREE.Group();
      hip.position.set(x, 0.2, z);
      hip.add(mesh([part(G.cyl(0.11, 0.08, 0.55, 6), legCol, { pos: [0, -0.27, 0] })]));
      const knee = new THREE.Group();
      knee.position.set(0, -0.55, 0);
      knee.add(
        mesh([
          part(G.cyl(0.07, 0.065, 0.55, 6), legCol, { pos: [0, -0.27, 0] }),
          part(G.cyl(0.085, 0.095, 0.12, 6), hoof, { pos: [0, -0.6, 0.01] }),
        ]),
      );
      hip.add(knee);
      this.body.add(hip);
      this.legs.push({ hip, knee, offset, front });
    }
  }

  private buildCat(c: Appearance): THREE.Group {
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
    this.body.add(mesh(torso));
    // Kopf
    this.head.position.set(0, 0.36, 0.5);
    const headParts = [
      part(G.ball(0.26, 1), c.body, { pos: [0, 0.14, 0.12], scale: [1.1, 0.95, 1] }),
      part(G.ball(0.13, 1), c.muzzle ?? belly, { pos: [0, 0.06, 0.32], scale: [1.2, 0.8, 0.8] }),
      part(G.ball(0.035), 0xe58a9a, { pos: [0, 0.11, 0.42] }),
      part(G.cone(0.1, 0.2, 4), c.body, { pos: [0.15, 0.4, 0.08], rot: [0, 0.8, 0.25] }),
      part(G.cone(0.1, 0.2, 4), c.body, { pos: [-0.15, 0.4, 0.08], rot: [0, -0.8, -0.25] }),
      part(G.cone(0.055, 0.12, 4), 0xe8b4b8, { pos: [0.15, 0.39, 0.1], rot: [0, 0.8, 0.25] }),
      part(G.cone(0.055, 0.12, 4), 0xe8b4b8, { pos: [-0.15, 0.39, 0.1], rot: [0, -0.8, -0.25] }),
      part(G.ball(0.055, 1), 0xb5d33a, { pos: [0.11, 0.2, 0.32] }),
      part(G.ball(0.055, 1), 0xb5d33a, { pos: [-0.11, 0.2, 0.32] }),
      part(G.box(0.02, 0.07, 0.02), EYE, { pos: [0.11, 0.2, 0.37] }),
      part(G.box(0.02, 0.07, 0.02), EYE, { pos: [-0.11, 0.2, 0.37] }),
      // Schnurrhaare
      part(G.box(0.22, 0.008, 0.008), WHITE, { pos: [0.2, 0.06, 0.36], rot: [0, 0.2, 0.1] }),
      part(G.box(0.22, 0.008, 0.008), WHITE, { pos: [-0.2, 0.06, 0.36], rot: [0, -0.2, -0.1] }),
    ];
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
        part(G.ball(0.05), stripes ?? c.tail, { pos: [0, 0.34, 0.04] }),
      ]),
    );
    this.tail.add(tip);
    this.body.add(this.tail);
    // Beine
    const legDefs: [number, number, number, boolean][] = [
      [0.13, 0.36, 0.0, true],
      [-0.13, 0.36, 0.5, true],
      [0.13, -0.36, 0.25, false],
      [-0.13, -0.36, 0.75, false],
    ];
    for (const [x, z, offset, front] of legDefs) {
      const hip = new THREE.Group();
      hip.position.set(x, 0.08, z);
      hip.add(mesh([part(G.cyl(0.08, 0.065, 0.28, 6), c.body, { pos: [0, -0.13, 0] })]));
      const knee = new THREE.Group();
      knee.position.set(0, -0.27, 0);
      knee.add(
        mesh([
          part(G.cyl(0.055, 0.05, 0.25, 6), front ? belly : c.body, { pos: [0, -0.11, 0] }),
          part(G.ball(0.065), belly, { pos: [0, -0.24, 0.03], scale: [1, 0.6, 1.2] }),
        ]),
      );
      hip.add(knee);
      this.body.add(hip);
      this.legs.push({ hip, knee, offset, front });
    }
    return tip;
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
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(geo, mat);
      s.userData.angle = (i / 3) * Math.PI * 2;
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.stars.position.set(0, this.isHorse ? 2.35 : 1.35, this.isHorse ? 0.9 : 0.55);
    this.root.add(this.stars);
  }

  /** Pose für den aktuellen Frame setzen. */
  animate(p: AnimPose, dt: number) {
    const run = Math.min(1, p.speed / 8);
    const cycle = p.stride;
    const amp = this.isHorse ? 0.2 + 0.42 * run : 0.3 + 0.55 * run;

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
        const s = Math.sin(ph);
        l.hip.rotation.x = s * amp;
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
    const bob = p.grounded ? Math.abs(Math.sin(cycle)) * (this.isHorse ? 0.09 : 0.05) * run : 0;
    const breathe = Math.sin(p.time * 2.2) * 0.012 * (1 - run);
    this.body.position.y = this.bodyHeight + bob + breathe;
    let pitch = p.grounded ? Math.sin(cycle * 2) * 0.04 * run : -Math.max(-0.35, Math.min(0.35, p.vy * 0.05));
    let roll = 0;
    if (p.stumble > 0) {
      roll = Math.sin(p.time * 22) * 0.12;
      pitch += 0.15;
    }
    if (p.celebrate && p.grounded) {
      // Jubeln: Pferd steigt, Katze hüpft
      const c = Math.max(0, Math.sin(p.time * 4));
      if (this.isHorse) pitch -= c * 0.5;
      else this.body.position.y += c * 0.25;
    }
    this.smoothPitch += (pitch - this.smoothPitch) * Math.min(1, dt * 12);
    this.body.rotation.x = this.smoothPitch;
    this.body.rotation.z = roll;

    // Kopf nickt im Takt, Schweif schwingt
    this.head.rotation.x = Math.sin(cycle * 2 + 1) * 0.08 * run + (p.stumble > 0 ? 0.3 : 0);
    this.tail.rotation.x = (this.isHorse ? 0.25 : -0.1) * run + Math.sin(cycle * 2) * 0.1 * run;
    this.tail.rotation.z = Math.sin(p.time * (1.5 + run * 4)) * 0.18;
    if (this.tailTip) this.tailTip.rotation.x = 0.3 + Math.sin(p.time * 3) * 0.2 - run * 0.5;

    // Sterne über dem Kopf
    this.stars.visible = p.stumble > 0;
    if (this.stars.visible) {
      this.stars.children.forEach((s) => {
        const a = (s.userData.angle as number) + p.time * 6;
        s.position.set(Math.cos(a) * 0.35, Math.sin(p.time * 8 + a) * 0.05, Math.sin(a) * 0.35);
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
