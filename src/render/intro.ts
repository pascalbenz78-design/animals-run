/**
 * Intro beim Spielstart: Die Tiere stürmen an der Kamera vorbei, dann stellt die Kamera alle
 * zehn Tiere einzeln vor (Name, Tierart, Superkraft) und zum Schluss springt das Logo herein.
 * Die Schrift-Einblendungen macht main.ts (HTML), hier nur Szene, Kamera und Ton.
 */
import * as THREE from 'three';
import { ANIMALS, type AnimalDef } from '../animals/animals';
import { AnimalModel } from '../animals/models';
import { audio } from '../audio/engine';
import { voice } from '../audio/sfx';
import { INTRO } from '../config/balance';
import { mulberry32 } from '../game/rng';
import { G, mesh, part } from './geo';
import type { GameRenderer } from './renderer';

export type IntroCue = { type: 'feature'; animal: AnimalDef } | { type: 'logo' } | { type: 'done' };

interface Runner {
  def: AnimalDef;
  model: AnimalModel;
  stride: number;
  /** Platz in der Reihe (Vorstellung) */
  slot: number;
  /** Versatz im Rudel (Ansturm) */
  lag: number;
  lane: number;
  hop: number;
}

const DUST = 160;

export class Intro {
  private readonly group = new THREE.Group();
  private readonly runners: Runner[] = [];
  private readonly dust: THREE.InstancedMesh;
  private readonly dustP: { x: number; y: number; z: number; vx: number; vy: number; life: number }[] = [];
  private dustNext = 0;
  private readonly dummy = new THREE.Object3D();
  t = 0;
  private featured = -1;
  private logoShown = false;
  private finished = false;

  constructor(
    private readonly gr: GameRenderer,
    private readonly cue: (c: IntroCue) => void,
  ) {
    gr.applyTheme({
      skyTop: 0x2f8fe8,
      skyHorizon: 0xd8f0ff,
      fog: 0xd8f0ff,
      fogNear: 70,
      fogFar: 300,
      sunColor: 0xfff2d8,
      sunIntensity: 2.7,
      hemiSky: 0xd8ecff,
      hemiGround: 0x6a9a3a,
      ambient: 0.6,
      sunDir: [0.5, 1, 0.6],
      ground: 0x6fbf3f,
      groundAlt: 0x8fd04f,
      trackColor: 0xdcc394,
      trackEdge: 0xc4a874,
      fence: 0xffffff,
    });
    this.buildSet();
    // Tiere: Reihenfolge wie in der Auswahl
    ANIMALS.forEach((def, i) => {
      const model = new AnimalModel(def);
      this.group.add(model.root);
      this.runners.push({ def, model, stride: i, slot: i, lag: (i % 5) * 2.6 + Math.floor(i / 5) * 1.3, lane: -0.8 + (Math.floor(i / 5) - 0.5) * 2.2 + ((i % 2) - 0.5) * 0.8, hop: 0 });
    });
    // Staubwolken beim Ansturm
    this.dust = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshLambertMaterial({ color: 0xd8c49a, transparent: true, opacity: 0.7 }), DUST);
    for (let i = 0; i < DUST; i++) this.dustP.push({ x: 0, y: -10, z: 0, vx: 0, vy: 0, life: 0 });
    this.group.add(this.dust);
    gr.scene.add(this.group);
    gr.focusShadows(0, 0, 0);
    this.playJingle();
  }

  /** Kulisse: Weg mit Zäunen, Hügel, Bäume, Zielbogen */
  private buildSet() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6fbf3f }));
    ground.receiveShadow = true;
    this.group.add(ground);
    const parts: THREE.BufferGeometry[] = [];
    // Weg entlang der x-Achse
    parts.push(part(G.box(220, 0.04, 9), 0xdcc394, { pos: [0, 0.02, 0] }));
    for (const z of [-4.9, 4.9]) {
      parts.push(part(G.box(220, 0.12, 0.12), 0xffffff, { pos: [0, 0.75, z] }), part(G.box(220, 0.12, 0.12), 0xffffff, { pos: [0, 0.4, z] }));
      for (let x = -110; x <= 110; x += 3) parts.push(part(G.box(0.15, 1, 0.15), 0xffffff, { pos: [x, 0.5, z] }));
    }
    // Zielbogen hinter der Tierreihe
    for (const z of [-4.3, 4.3]) parts.push(part(G.cyl(0.25, 0.25, 5.5, 8), 0xffffff, { pos: [INTRO.archX, 2.75, z] }));
    this.group.add(mesh(parts, true));
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 1.4), new THREE.MeshBasicMaterial({ map: bannerTexture(), side: THREE.DoubleSide }));
    banner.position.set(INTRO.archX, 5, 0);
    banner.rotation.y = Math.PI / 2;
    this.group.add(banner);
    // Bäume, Büsche und Hügel
    const rnd = mulberry32(7);
    const deco: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 70; i++) {
      const x = (rnd() - 0.5) * 200;
      const side = rnd() < 0.5 ? -1 : 1;
      const z = side * (9 + rnd() * 45);
      const h = 2 + rnd() * 2.5;
      deco.push(part(G.cyl(0.25, 0.35, h, 6), 0x7a5230, { pos: [x, h / 2, z] }));
      deco.push(part(G.dodeca(1.4 + rnd() * 1.2), rnd() < 0.5 ? 0x3f9a3a : 0x4fae3f, { pos: [x, h + 1, z] }));
    }
    for (let i = 0; i < 50; i++) deco.push(part(G.dodeca(0.6 + rnd() * 0.5), 0x5aaf3f, { pos: [(rnd() - 0.5) * 200, 0.4, -(6.5 + rnd() * 6)] }));
    for (let i = 0; i < 12; i++) deco.push(part(G.ball(20 + rnd() * 20, 1), rnd() < 0.5 ? 0x7fc04f : 0x8fcc5a, { pos: [(rnd() - 0.5) * 300, -8, -110 - rnd() * 40], scale: [1.6, 0.7, 1] }));
    // Blumen am Wegrand
    const cols = [0xff5d8f, 0xffd23f, 0xffffff, 0xb07aff];
    for (let i = 0; i < 160; i++) deco.push(part(G.ball(0.12, 0), cols[i % 4], { pos: [(rnd() - 0.5) * 120, 0.15, (rnd() < 0.5 ? -1 : 1) * (5.4 + rnd() * 3)] }));
    this.group.add(mesh(deco, false));
  }

  /** Trommelwirbel, dann Fanfare; Becken beim Logo */
  private playJingle() {
    if (!audio.ctx) return;
    const t0 = audio.now + 0.05;
    const I = INTRO;
    // Trommelwirbel (wird lauter)
    for (let k = 0; k < 40; k++) {
      const at = t0 + k * (I.rushEnd * 0.55) / 40;
      audio.noise(0.05, { at, dest: 'music', vol: 0.03 + (k / 40) * 0.08, freq: 1600, q: 0.7 });
    }
    // Fanfare zum Vorbeistürmen (C-Dur, Blechbläser-ähnlich)
    const fan = [
      [0, 67, 0.18],
      [0.2, 67, 0.18],
      [0.4, 67, 0.18],
      [0.6, 72, 0.7],
      [1.4, 71, 0.2],
      [1.6, 72, 0.2],
      [1.8, 76, 0.9],
    ];
    const start = t0 + I.rushEnd * 0.55;
    for (const [at, n, d] of fan) {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      audio.tone(f, d, { at: start + at, dest: 'music', type: 'sawtooth', vol: 0.09, attack: 0.02, release: 0.12, filter: 2200, reverb: 0.3 });
      audio.tone(f / 2, d, { at: start + at, dest: 'music', type: 'square', vol: 0.04, attack: 0.02, release: 0.1, filter: 1200 });
    }
    audio.tone(110, 0.3, { at: start + 0.6, dest: 'music', type: 'sine', vol: 0.25, slideTo: 45 });
    // Becken und Paukenschlag beim Logo
    const logo = t0 + I.logoAt;
    audio.noise(1.6, { at: logo, dest: 'music', vol: 0.12, freq: 6000, type: 'highpass' });
    audio.tone(90, 0.6, { at: logo, dest: 'music', type: 'sine', vol: 0.3, slideTo: 40 });
    ;[60, 64, 67, 72].forEach((n, i) => {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      audio.tone(f, 1.6, { at: logo + i * 0.06, dest: 'music', type: 'triangle', vol: 0.07, attack: 0.02, release: 0.8, reverb: 0.5 });
    });
  }

  private spawnDust(x: number, z: number) {
    const d = this.dustP[this.dustNext];
    this.dustNext = (this.dustNext + 1) % DUST;
    d.x = x + (Math.random() - 0.5) * 0.6;
    d.z = z + (Math.random() - 0.5) * 0.6;
    d.y = 0.2;
    d.vx = -2 - Math.random() * 2;
    d.vy = 0.6 + Math.random();
    d.life = 1;
  }

  /** Überspringen: sofort zum Logo und dann fertig */
  skip() {
    if (this.finished) return;
    this.finished = true;
    this.cue({ type: 'done' });
  }

  update(dt: number) {
    if (this.finished) return;
    this.t += dt;
    const t = this.t;
    const I = INTRO;
    const cam = this.gr.camera;
    cam.fov = 50;
    // Hochformat: Kamera weiter weg, damit die Tiere ganz ins Bild passen
    const far = Math.max(1, 1.6 / cam.aspect);

    if (t < I.rushEnd) {
      // 1) Ansturm: das Rudel stürmt von links nach rechts an der tiefen Kamera vorbei
      for (const r of this.runners) {
        const x = -42 + (t - 0.4) * I.rushSpeed - r.lag;
        r.model.root.position.set(x, 0, r.lane);
        r.model.root.rotation.y = Math.PI / 2;
        r.stride += I.rushSpeed * dt * (r.def.species === 'pferd' ? 0.9 : r.def.species === 'hamster' ? 2.2 : 1.4);
        r.model.animate(this.pose(I.rushSpeed, r.stride, 0, 0, true, false), dt);
        if (Math.abs(x) < 25 && Math.random() < 0.5) this.spawnDust(x - 0.8, r.lane);
      }
      const follow = Math.max(-18, Math.min(14, -42 + (t - 0.4) * I.rushSpeed - 6));
      cam.position.set(follow * 0.35 - 1, 0.75, 4.4 * far);
      cam.lookAt(follow, 1, 0);
    } else if (t < I.logoAt) {
      // 2) Vorstellung: alle in einer Reihe, die Kamera fährt von Tier zu Tier
      const k = (t - I.rushEnd) / I.perAnimal;
      const idx = Math.min(this.runners.length - 1, Math.floor(k));
      if (idx !== this.featured) {
        this.featured = idx;
        const r = this.runners[idx];
        r.hop = 0.001;
        this.cue({ type: 'feature', animal: r.def });
        if (audio.ctx) voice(r.def.species, 0.9, 0, 'jubel');
      }
      const camX = this.slotX(0) + (k - 0.5) * I.spacing;
      for (const r of this.runners) {
        const x = this.slotX(r.slot);
        let alt = 0;
        let vy = 0;
        if (r.hop > 0) {
          r.hop += dt;
          const h = r.hop * 6.5 - 0.5 * 24 * r.hop * r.hop;
          vy = 6.5 - 24 * r.hop;
          alt = Math.max(0, h);
          if (h < 0) r.hop = 0;
        }
        r.model.root.position.set(x, alt, 0);
        // Zur Kamera drehen, das vorgestellte Tier etwas mehr
        r.model.root.rotation.y = r.slot === idx ? 0.15 : 0.5;
        r.model.animate(this.pose(0, 0, alt, vy, alt <= 0, r.slot === idx), dt);
      }
      const focus = this.slotX(idx);
      const tx = Math.max(this.slotX(0), Math.min(this.slotX(9), camX));
      cam.position.set(tx + 0.5, 1.4, 4.4 * far);
      cam.lookAt(focus + (camX - focus) * 0.3, 1.0, 0);
    } else {
      // 3) Finale: Kamera zieht hoch und zurück, alle jubeln, Logo erscheint
      if (!this.logoShown) {
        this.logoShown = true;
        this.cue({ type: 'logo' });
      }
      const k = Math.min(1, (t - I.logoAt) / 1.6);
      const e = 1 - Math.pow(1 - k, 3);
      const mid = (this.slotX(0) + this.slotX(9)) / 2;
      for (const r of this.runners) {
        const ph = (t * 3 + r.slot * 0.7) % 1;
        const alt = Math.max(0, Math.sin(ph * Math.PI) * 0.7);
        r.model.root.position.set(this.slotX(r.slot), alt, 0);
        r.model.root.rotation.y = 0.3 * (1 - e);
        r.model.animate(this.pose(0, 0, alt, 0, alt <= 0.02, true), dt);
      }
      cam.position.set(mid + 4 * (1 - e), 1.4 + e * 5, 4.4 * far + e * 17);
      cam.lookAt(mid, 1 + e * 0.8, 0);
      if (t >= I.logoAt + I.logoHold) this.skip();
    }
    cam.updateProjectionMatrix();

    // Staub
    for (let i = 0; i < DUST; i++) {
      const d = this.dustP[i];
      if (d.life > 0) {
        d.life -= dt * 1.2;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy *= 0.96;
      }
      const s = d.life > 0 ? 0.6 + (1 - d.life) * 1.4 : 0;
      this.dummy.position.set(d.x, d.y, d.z);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.dust.setMatrixAt(i, this.dummy.matrix);
    }
    this.dust.instanceMatrix.needsUpdate = true;
  }

  private slotX(slot: number) {
    return INTRO.archX - 8 - (9 - slot) * INTRO.spacing;
  }

  private pose(speed: number, stride: number, alt: number, vy: number, grounded: boolean, celebrate: boolean) {
    return { speed, topSpeed: 16, grounded, alt, vy, stride, stumble: 0, stun: 0, spin: 0, celebrate, time: this.t };
  }

  dispose() {
    this.gr.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}

function bannerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 168;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 1024; x += 56) {
    g.fillStyle = (x / 56) % 2 ? '#ffffff' : '#ff7a1a';
    g.fillRect(x, 0, 56, 168);
  }
  g.fillStyle = '#c8302a';
  g.fillRect(40, 24, 944, 120);
  g.font = '900 92px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd23f';
  g.fillText('ANIMALS RUN', 512, 90);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
