/**
 * Siegerehrung nach einem Cup: Podest mit den drei besten Tieren, Pokal und Konfetti.
 */
import * as THREE from 'three';
import { getAnimal } from '../animals/animals';
import { AnimalModel } from '../animals/models';
import { G, mesh, part } from './geo';
import type { GameRenderer } from './renderer';

const CONFETTI = 500;

export class Ceremony {
  private readonly group = new THREE.Group();
  private readonly models: AnimalModel[] = [];
  private readonly trophy: THREE.Object3D;
  private readonly confetti: THREE.InstancedMesh;
  private readonly conf: { x: number; y: number; z: number; vy: number; rot: number; spin: number }[] = [];
  private readonly dummy = new THREE.Object3D();
  private t = 0;

  constructor(
    private readonly gr: GameRenderer,
    top3: string[],
  ) {
    gr.applyTheme({
      skyTop: 0x3a6ad0,
      skyHorizon: 0xffc89a,
      fog: 0xffd8b0,
      fogNear: 60,
      fogFar: 260,
      sunColor: 0xfff0d0,
      sunIntensity: 2.6,
      hemiSky: 0xffe8d0,
      hemiGround: 0x6a8a3a,
      ambient: 0.7,
      sunDir: [0.3, 1, 0.8],
      ground: 0x6fbf3f,
      groundAlt: 0x8fd04f,
      trackColor: 0xdcc394,
      trackEdge: 0xc4a874,
      fence: 0xffffff,
    });
    // Boden und Teppich
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6fbf3f }));
    ground.receiveShadow = true;
    this.group.add(ground);
    this.group.add(mesh([part(G.box(3, 0.05, 14), 0xc8302a, { pos: [0, 0.03, 7] })]));
    // Podest: 2 – 1 – 3
    const heights = [1.6, 2.4, 1.1];
    const xs = [-3.2, 0, 3.2];
    const order = [1, 0, 2];
    const colors = [0xf2c230, 0xc0c4cc, 0xc88a4a]; // Gold, Silber, Bronze (nach Platz)
    const parts: THREE.BufferGeometry[] = [];
    order.forEach((place, i) => {
      parts.push(part(G.box(3, heights[i], 3), 0xffffff, { pos: [xs[i], heights[i] / 2, 0] }));
      parts.push(part(G.box(3.05, 0.4, 3.05), colors[place], { pos: [xs[i], heights[i] - 0.2, 0] }));
    });
    this.group.add(mesh(parts));
    // Ziffern auf dem Podest
    order.forEach((place, i) => {
      const num = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: numberTexture(place + 1), transparent: true }));
      num.position.set(xs[i], heights[i] / 2, 1.52);
      this.group.add(num);
    });
    // Tiere aufs Podest stellen
    order.forEach((place, i) => {
      const id = top3[place];
      if (!id) return;
      const m = new AnimalModel(getAnimal(id));
      m.root.position.set(xs[i], heights[i], 0);
      m.root.rotation.y = 0;
      const sc = getAnimal(id).species === 'pferd' ? 0.85 : 1.25;
      m.root.scale.setScalar(sc);
      this.group.add(m.root);
      this.models.push(m);
    });
    // Pokal
    this.trophy = mesh([
      part(G.cyl(0.35, 0.5, 0.3, 10), 0x6b4423, { pos: [0, 0.15, 0] }),
      part(G.cyl(0.08, 0.12, 0.6, 8), 0xf2c230, { pos: [0, 0.6, 0] }),
      part(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xf2c230, { pos: [0, 1.45, 0], rot: [Math.PI, 0, 0] }),
      part(G.cyl(0.57, 0.57, 0.08, 14), 0xffe070, { pos: [0, 1.45, 0] }),
      part(new THREE.TorusGeometry(0.28, 0.06, 6, 12, Math.PI), 0xf2c230, { pos: [0.6, 1.2, 0], rot: [0, 0, -Math.PI / 2] }),
      part(new THREE.TorusGeometry(0.28, 0.06, 6, 12, Math.PI), 0xf2c230, { pos: [-0.6, 1.2, 0], rot: [0, 0, Math.PI / 2] }),
    ]);
    this.trophy.position.set(0, 8, 0.6);
    this.group.add(this.trophy);
    // Konfetti
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.18, 0.1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONFETTI);
    const cols = [0xff5d8f, 0xffd23f, 0x3fae49, 0x2f8fd6, 0xff7a1a, 0xffffff];
    for (let i = 0; i < CONFETTI; i++) {
      this.conf.push({ x: (Math.random() - 0.5) * 16, y: 6 + Math.random() * 14, z: (Math.random() - 0.5) * 10, vy: 1 + Math.random() * 1.5, rot: Math.random() * 6, spin: 2 + Math.random() * 6 });
      this.confetti.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    }
    this.group.add(this.confetti);
    gr.scene.add(this.group);
    gr.focusShadows(0, 0, 0);
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    // Pokal schwebt herab und dreht sich über dem Sieger
    const target = 2.4 + 1.9 + Math.sin(t * 2) * 0.1;
    this.trophy.position.y += (target - this.trophy.position.y) * Math.min(1, dt * 1.5);
    this.trophy.rotation.y = t * 1.2;
    this.models.forEach((m, i) => {
      m.animate({ speed: 0, topSpeed: 16, grounded: true, alt: 0, vy: 0, stride: 0, stumble: 0, stun: 0, spin: 0, celebrate: true, time: t + i * 0.7 }, dt);
    });
    for (let i = 0; i < CONFETTI; i++) {
      const c = this.conf[i];
      c.y -= c.vy * dt;
      c.x += Math.sin(t * 2 + i) * 0.4 * dt;
      c.rot += c.spin * dt;
      if (c.y < 0) c.y += 18;
      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.rotation.set(c.rot, c.rot * 0.7, 0);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    }
    this.confetti.instanceMatrix.needsUpdate = true;
    // Kamera fährt langsam um das Podest
    const cam = this.gr.camera;
    const a = Math.sin(t * 0.25) * 0.5;
    const r = Math.max(9, 16 - t * 1.5);
    cam.position.set(Math.sin(a) * r, 3.5 + r * 0.15, Math.cos(a) * r);
    cam.lookAt(0, 2.6, 0);
    cam.fov = 50;
    cam.updateProjectionMatrix();
  }

  dispose() {
    this.gr.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}

function numberTexture(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = 'bold 110px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#2b1a0e';
  g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
