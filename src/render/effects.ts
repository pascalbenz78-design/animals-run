/**
 * Sichtbare Effekte von Superkräften und Items: Schutzblase, Wirbelsturm, Hamsterkugel,
 * Buddel-Hügel, Maus, Schub-Leuchten, Schneckenwolke, Erdbeben-Ring, Schallwellen,
 * Knochenspur sowie Äpfel, Matschfallen, Item-Kisten und Icons auf der Strecke.
 */
import * as THREE from 'three';
import { ICONS, POWERS } from '../config/balance';
import { getAnimal } from '../animals/animals';
import type { RaceSim } from '../game/simulation';
import type { SimEvent } from '../game/types';
import { G, mesh, part } from './geo';
import { emojiTexture, pawBoxTexture } from './textures';

export interface AnimalPos {
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface PerAnimal {
  bubble: THREE.Mesh;
  tornado: THREE.Mesh;
  ball: THREE.Mesh;
  mound: THREE.Mesh;
  mouse: THREE.Object3D;
  aura: THREE.Mesh;
  cloud: THREE.Group;
  quakeWarn: THREE.Mesh;
  waves: THREE.Mesh[];
}

interface Shock {
  mesh: THREE.Mesh;
  age: number;
  max: number;
  duration: number;
}

const MAX_HAZARDS = 60;
const MAX_BONES = 24;

export class EffectsView {
  readonly group = new THREE.Group();
  private readonly per: PerAnimal[] = [];
  private readonly apples: THREE.InstancedMesh;
  private readonly traps: THREE.InstancedMesh;
  private readonly boxes: THREE.InstancedMesh;
  private readonly bones: THREE.InstancedMesh;
  private readonly iconSprites: THREE.Sprite[] = [];
  private readonly iconMat: THREE.SpriteMaterial;
  private iconOwner = -1;
  private readonly shocks: Shock[] = [];
  private readonly dummy = new THREE.Object3D();
  /** Kamera-Wackeln (wird von der Kamera gelesen) */
  shake = 0;

  constructor(private readonly sim: RaceSim) {
    const shieldMat = (color: number) =>
      new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.32, emissive: color, emissiveIntensity: 0.5, depthWrite: false });
    const tornadoGeo = new THREE.CylinderGeometry(1.9, 0.5, 3.4, 14, 4, true);
    tornadoGeo.translate(0, 1.7, 0);
    const tornadoMat = new THREE.MeshLambertMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, flatShading: true });
    const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const waveGeo = new THREE.RingGeometry(0.92, 1, 24, 1, -POWERS.miauSchrei.halfAngle, POWERS.miauSchrei.halfAngle * 2);
    waveGeo.rotateX(-Math.PI / 2);
    const waveMat = new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const auraGeo = new THREE.ConeGeometry(0.7, 3.2, 10, 1, true);
    auraGeo.rotateX(-Math.PI / 2);
    auraGeo.translate(0, 0, -1.8);
    const auraMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const moundGeo = mesh([part(G.dodeca(0.7), 0x6b4423, { scale: [1, 0.45, 1.3] }), part(G.dodeca(0.35), 0x7d5530, { pos: [0.3, 0.15, -0.5] })]).geometry;
    const mouseGeo = mesh([
      part(G.ball(0.16, 1), 0x9a9aa2, { scale: [0.9, 0.8, 1.4] }),
      part(G.ball(0.1, 1), 0x9a9aa2, { pos: [0, 0.05, 0.2] }),
      part(G.cyl(0.05, 0.05, 0.02, 8), 0xe8a4ad, { pos: [0.08, 0.15, 0.16], rot: [1.3, 0, 0] }),
      part(G.cyl(0.05, 0.05, 0.02, 8), 0xe8a4ad, { pos: [-0.08, 0.15, 0.16], rot: [1.3, 0, 0] }),
      part(G.cyl(0.015, 0.01, 0.4, 4), 0xe8a4ad, { pos: [0, 0, -0.38], rot: [1.4, 0, 0] }),
    ]).geometry;
    const cloudGeo = mesh([part(G.dodeca(0.4), 0x8a8a96), part(G.dodeca(0.3), 0x9a9aa6, { pos: [0.35, -0.05, 0] }), part(G.dodeca(0.3), 0x7a7a86, { pos: [-0.35, -0.05, 0.05] })]).geometry;

    for (const a of sim.animals) {
      const r = sim.stats[a.id].radius;
      const big = r * 1.9 + 0.4;
      const bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), shieldMat(0x5ab0ff));
      bubble.scale.setScalar(big);
      const tornado = new THREE.Mesh(tornadoGeo, tornadoMat);
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, 1), new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35, depthWrite: false, flatShading: true }));
      const mound = new THREE.Mesh(moundGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      const mouse = new THREE.Mesh(mouseGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      const aura = new THREE.Mesh(auraGeo, auraMat);
      aura.scale.setScalar(r * 1.4 + 0.3);
      const cloud = new THREE.Group();
      cloud.add(new THREE.Mesh(cloudGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
      const snail = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('🐌'), depthWrite: false }));
      snail.scale.setScalar(0.7);
      snail.position.y = 0.55;
      cloud.add(snail);
      const quakeWarn = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x8a5a2a, transparent: true, opacity: 0.7, depthWrite: false }));
      const waves = [0, 1, 2].map(() => new THREE.Mesh(waveGeo, waveMat.clone()));
      const all = [bubble, tornado, ball, mound, mouse, aura, cloud, quakeWarn, ...waves];
      for (const o of all) {
        o.visible = false;
        this.group.add(o);
      }
      this.per.push({ bubble, tornado, ball, mound, mouse, aura, cloud, quakeWarn, waves });
    }

    // Äpfel und Matschfallen
    const appleGeo = mesh([
      part(G.ball(0.32, 1), 0xd8262a),
      part(G.cyl(0.025, 0.025, 0.18, 4), 0x5a3a1a, { pos: [0, 0.36, 0] }),
      part(G.box(0.18, 0.02, 0.1), 0x3faa3a, { pos: [0.1, 0.4, 0], rot: [0, 0, 0.4] }),
    ]).geometry;
    this.apples = new THREE.InstancedMesh(appleGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), MAX_HAZARDS);
    const trapGeo = mesh([
      part(G.cyl(1.2, 1.35, 0.12, 12), 0x5a3a1c),
      part(G.ball(0.42, 1), 0x6b4423, { pos: [0, 0.3, 0], scale: [1, 0.7, 1] }),
      part(G.ball(0.3, 1), 0x7a5030, { pos: [0, 0.6, 0], scale: [1, 0.75, 1] }),
      part(G.cone(0.18, 0.3, 6), 0x7a5030, { pos: [0, 0.85, 0] }),
      part(G.ball(0.07), 0xffffff, { pos: [0.12, 0.62, 0.24] }),
      part(G.ball(0.07), 0xffffff, { pos: [-0.12, 0.62, 0.24] }),
      part(G.ball(0.035), 0x111111, { pos: [0.12, 0.62, 0.3] }),
      part(G.ball(0.035), 0x111111, { pos: [-0.12, 0.62, 0.3] }),
    ]).geometry;
    this.traps = new THREE.InstancedMesh(trapGeo, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 50 }), MAX_HAZARDS);
    this.apples.castShadow = this.traps.castShadow = true;
    this.apples.count = this.traps.count = 0;

    // Item-Kisten
    this.boxes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshLambertMaterial({ map: pawBoxTexture(), transparent: true, opacity: 0.92 }),
      Math.max(1, sim.itemBoxes.length),
    );
    this.boxes.castShadow = true;

    // Knochenspur (Spürnase)
    const boneGeo = mesh([
      part(G.cyl(0.06, 0.06, 0.5, 6), 0xf5efe0, { rot: [0, 0, Math.PI / 2] }),
      part(G.ball(0.09), 0xf5efe0, { pos: [0.26, 0, 0.06] }),
      part(G.ball(0.09), 0xf5efe0, { pos: [0.26, 0, -0.06] }),
      part(G.ball(0.09), 0xf5efe0, { pos: [-0.26, 0, 0.06] }),
      part(G.ball(0.09), 0xf5efe0, { pos: [-0.26, 0, -0.06] }),
    ]).geometry;
    this.bones = new THREE.InstancedMesh(boneGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x554433 }), MAX_BONES);
    this.bones.count = 0;

    // Icon-Punkte: jedes Tier sieht sein eigenes Icon – gezeigt werden die des beobachteten Tiers
    this.iconMat = new THREE.SpriteMaterial({ map: emojiTexture('⭐', true), depthWrite: false });
    for (let i = 0; i < sim.iconPoints.length; i++) {
      const s = new THREE.Sprite(this.iconMat);
      s.scale.setScalar(1.3);
      s.visible = false;
      this.group.add(s);
      this.iconSprites.push(s);
    }
    this.group.add(this.apples, this.traps, this.boxes, this.bones);
  }

  handleEvent(e: SimEvent, pos: AnimalPos[], focus: number) {
    if (e.type === 'quake') {
      const p = pos[e.animal];
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x8a5a2a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.position.set(p.x, p.y + 0.15, p.z);
      this.group.add(ring);
      this.shocks.push({ mesh: ring, age: 0, max: POWERS.erdbeben.radius, duration: 0.6 });
      const f = pos[focus];
      if (Math.hypot(f.x - p.x, f.z - p.z) < POWERS.erdbeben.radius + 10) this.shake = 1;
    }
    if (e.type === 'stunned' && e.animal === focus) this.shake = Math.max(this.shake, 0.4);
  }

  update(pos: AnimalPos[], focus: number, time: number, dt: number) {
    const sim = this.sim;
    const t = sim.track;
    this.shake = Math.max(0, this.shake - dt * 2);
    for (const a of sim.animals) {
      const p = pos[a.id];
      const e = this.per[a.id];
      const visible = a.respawn <= 0;
      // Schutz: Blase (Schild blau, Pflaster rosa)
      e.bubble.visible = visible && a.invuln > 0 && (a.shield === 'schild' || a.shield === 'pflaster');
      if (e.bubble.visible) {
        const mat = e.bubble.material as THREE.MeshLambertMaterial;
        const col = a.shield === 'pflaster' ? 0xff8fbf : 0x5ab0ff;
        mat.color.setHex(col);
        mat.emissive.setHex(col);
        mat.opacity = 0.25 + Math.sin(time * 8) * 0.06 + (a.invuln < 1 ? Math.sin(time * 30) * 0.15 : 0);
        e.bubble.position.set(p.x, p.y + sim.stats[a.id].radius * 1.2, p.z);
        e.bubble.rotation.y = time;
      }
      // Wirbelsturm
      e.tornado.visible = visible && a.active === 'wirbelsturm';
      if (e.tornado.visible) {
        e.tornado.position.set(p.x, p.y, p.z);
        e.tornado.rotation.y = time * 12;
        e.tornado.scale.set(1 + Math.sin(time * 9) * 0.08, 1, 1 + Math.cos(time * 9) * 0.08);
      }
      // Hamsterkugel
      e.ball.visible = visible && a.active === 'hamsterkugel';
      if (e.ball.visible) {
        e.ball.position.set(p.x, p.y + 0.78, p.z);
        e.ball.rotation.set(-a.stride * 0.4, Math.PI / 2 - p.heading, 0, 'YXZ');
      }
      // Buddeln: Erdhügel statt Tier
      e.mound.visible = visible && a.active === 'spuernase';
      if (e.mound.visible) {
        e.mound.position.set(p.x, p.y + Math.abs(Math.sin(time * 14)) * 0.08, p.z);
        e.mound.rotation.y = Math.PI / 2 - p.heading;
      }
      // Maus vor Aramis
      e.mouse.visible = visible && a.active === 'maeusejagd';
      if (e.mouse.visible) {
        const ahead = 2.6 + Math.sin(time * 6) * 0.3;
        e.mouse.position.set(p.x + Math.cos(p.heading) * ahead, p.y + Math.abs(Math.sin(time * 20)) * 0.12 + 0.12, p.z + Math.sin(p.heading) * ahead);
        e.mouse.rotation.y = Math.PI / 2 - p.heading;
      }
      // Schub: leuchtender Schweif
      e.aura.visible = visible && a.boost > 0 && a.active !== 'spuernase';
      if (e.aura.visible) {
        e.aura.position.set(p.x, p.y + sim.stats[a.id].radius * 1.1, p.z);
        e.aura.rotation.y = Math.PI / 2 - p.heading;
        (e.aura.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(time * 20) * 0.08;
      }
      // Schneckenwolke / Matsch: Wolke mit Schnecke über dem Kopf
      e.cloud.visible = visible && a.slow > 0;
      if (e.cloud.visible) {
        e.cloud.position.set(p.x, p.y + sim.stats[a.id].radius * 2.6 + 0.6, p.z);
        e.cloud.rotation.y = time * 0.8;
      }
      // Erdbeben-Vorwarnung: zitternder Ring
      e.quakeWarn.visible = visible && a.active === 'erdbeben' && a.activeCount === 0;
      if (e.quakeWarn.visible) {
        const k = 1 - a.activeTime / POWERS.erdbeben.warning;
        e.quakeWarn.position.set(p.x + Math.sin(time * 60) * 0.1, p.y + 0.1, p.z);
        e.quakeWarn.scale.setScalar(2 + k * 4);
        const f = pos[focus];
        if (Math.hypot(f.x - p.x, f.z - p.z) < POWERS.erdbeben.radius + 10) this.shake = Math.max(this.shake, 0.35);
      }
      // Miau-Schrei: drei Schallbögen nach vorne
      const waving = visible && a.active === 'miauSchrei';
      e.waves.forEach((w, i) => {
        w.visible = waving;
        if (!waving) return;
        const k = Math.min(1, Math.max(0.05, 1 - a.activeTime / POWERS.miauSchrei.waveTime - i * 0.15));
        const r = POWERS.miauSchrei.range * k;
        w.position.set(p.x, p.y + 0.9, p.z);
        w.scale.setScalar(Math.max(0.5, r));
        w.rotation.y = -a.activeDir;
        (w.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - k * 0.6);
      });
    }

    // Schockwellen (Erdbeben)
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.age += dt;
      const k = s.age / s.duration;
      s.mesh.scale.setScalar(1 + k * s.max);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      if (k >= 1) {
        this.group.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.shocks.splice(i, 1);
      }
    }

    // Äpfel und Matschfallen
    let na = 0;
    let nt = 0;
    for (const h of sim.hazards) {
      const y = t.heightAt(t.project(h.x, h.z, sim.animals[h.owner].idx).s);
      const pop = Math.min(1, h.age * 4);
      this.dummy.position.set(h.x, y + (h.kind === 'apfel' ? 0.3 : 0.05), h.z);
      this.dummy.rotation.set(0, h.id * 1.7, 0);
      this.dummy.scale.setScalar(pop * (h.life < 1 ? h.life : 1));
      this.dummy.updateMatrix();
      if (h.kind === 'apfel' && na < MAX_HAZARDS) this.apples.setMatrixAt(na++, this.dummy.matrix);
      else if (h.kind === 'matsch' && nt < MAX_HAZARDS) this.traps.setMatrixAt(nt++, this.dummy.matrix);
    }
    this.apples.count = na;
    this.traps.count = nt;
    this.apples.instanceMatrix.needsUpdate = true;
    this.traps.instanceMatrix.needsUpdate = true;

    // Item-Kisten drehen sich; eingesammelte erscheinen wachsend wieder
    const tmp = { x: 0, y: 0, z: 0 };
    sim.itemBoxes.forEach((b, i) => {
      t.pointAt(b.s, b.d, tmp);
      const sc = b.timer <= 0 ? 1 : Math.max(0, 1 - b.timer / 0.4);
      this.dummy.position.set(tmp.x, tmp.y + 1.1 + Math.sin(time * 2.5 + i) * 0.15, tmp.z);
      this.dummy.rotation.set(0.5, time * 1.6 + i, 0.3);
      this.dummy.scale.setScalar(sc);
      this.dummy.updateMatrix();
      this.boxes.setMatrixAt(i, this.dummy.matrix);
    });
    this.boxes.instanceMatrix.needsUpdate = true;

    // Knochenspur vor Tira (Spürnase)
    let nb = 0;
    for (const a of sim.animals) {
      if (a.active !== 'spuernase') continue;
      for (let k = 1; k <= 12 && nb < MAX_BONES; k++) {
        const s = a.s + k * (POWERS.spuernase.trailLength / 12);
        const d = t.racingLine[t.indexAt(s)];
        t.pointAt(s, d, tmp);
        this.dummy.position.set(tmp.x, tmp.y + 0.12 + Math.sin(time * 4 + k) * 0.05, tmp.z);
        this.dummy.rotation.set(0, Math.PI / 2 - t.headingAt(s) + 0.6, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.bones.setMatrixAt(nb++, this.dummy.matrix);
      }
    }
    this.bones.count = nb;
    this.bones.instanceMatrix.needsUpdate = true;

    // Eigene Icons des beobachteten Tiers
    const me = sim.animals[focus];
    if (this.iconOwner !== focus) {
      this.iconOwner = focus;
      this.iconMat.map = emojiTexture(getAnimal(me.animalId).icon, true);
      this.iconMat.needsUpdate = true;
    }
    const full = me.icons >= ICONS.needed || !!me.active;
    sim.iconPoints.forEach((ip, i) => {
      const s = this.iconSprites[i];
      s.visible = !full && sim.iconVisibleFor(me, i);
      if (!s.visible) return;
      t.pointAt(ip.s, ip.d, tmp);
      s.position.set(tmp.x, tmp.y + 1.3 + Math.sin(time * 3 + i) * 0.18, tmp.z);
      // Zusätzliche Punkte der Aufholhilfe etwas kleiner
      s.scale.setScalar(ip.rank === 0 ? 1.35 : 1.1);
    });
  }

  /** Soll das Tiermodell versteckt werden (z. B. beim Buddeln)? */
  hideModel(i: number): boolean {
    return this.sim.animals[i].active === 'spuernase';
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Sprite).isSprite) m.geometry?.dispose();
    });
  }
}

