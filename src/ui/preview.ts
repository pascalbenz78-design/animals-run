/**
 * Drehbare 3D-Vorschau eines Tiers für die Tierwahl (eigener kleiner Renderer).
 * Läuft nur, solange der Bildschirm sichtbar ist. Mit Finger oder Maus drehbar.
 */
import * as THREE from 'three';
import { getAnimal } from '../animals/animals';
import { AnimalModel } from '../animals/models';
import { G, mesh, part } from '../render/geo';

export class AnimalPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  private model: AnimalModel | null = null;
  private readonly turntable = new THREE.Group();
  private running = false;
  private angle = 0.6;
  private dragX: number | null = null;
  private idleSince = 0;
  private last = 0;
  private time = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6a8a3a, 2.2));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.position.set(3, 5, 4);
    this.scene.add(sun);
    // Grasinsel als Sockel
    this.turntable.add(
      mesh(
        [
          part(G.cyl(1.6, 1.7, 0.25, 18), 0x6cbf45, { pos: [0, -0.125, 0] }),
          part(G.cyl(1.7, 1.5, 0.35, 18), 0x8a5a32, { pos: [0, -0.42, 0] }),
          ...[0, 1, 2, 3, 4, 5].map((i) =>
            part(G.ball(0.08), [0xff5d8f, 0xffd23f, 0xffffff][i % 3], { pos: [Math.cos(i * 1.1) * 1.3, 0.04, Math.sin(i * 1.1) * 1.3] }),
          ),
        ],
        false,
      ),
    );
    this.scene.add(this.turntable);

    canvas.addEventListener('pointerdown', (e) => {
      this.dragX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragX === null) return;
      this.angle += (e.clientX - this.dragX) * 0.012;
      this.dragX = e.clientX;
      this.idleSince = this.time;
    });
    const up = () => (this.dragX = null);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  show(animalId: string) {
    if (this.model) {
      this.turntable.remove(this.model.root);
      this.model.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.model = new AnimalModel(getAnimal(animalId));
    this.turntable.add(this.model.root);
    // Kamera an die Tiergrösse anpassen (nur der Körper, ohne die unsichtbaren Sterne)
    const box = new THREE.Box3().setFromObject(this.model.spinner);
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(0.6, box.getSize(new THREE.Vector3()).length() / 2);
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.2;
    this.camera.position.set(0, center.y + radius * 0.55, dist);
    this.camera.lookAt(0, center.y * 0.9, 0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.time += dt;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  private frame(dt: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    // Langsam weiterdrehen, wenn niemand zieht
    if (this.dragX === null && this.time - this.idleSince > 1.5) this.angle += dt * 0.5;
    this.turntable.rotation.y = this.angle;
    if (this.model) {
      // Gemütlicher Trab auf der Stelle, ab und zu ein Hüpfer
      const hop = Math.sin(this.time * 0.9) > 0.97;
      this.model.animate(
        { speed: 3.5, topSpeed: 16, grounded: !hop, alt: 0, vy: hop ? 3 : 0, stride: this.time * 5, stumble: 0, stun: 0, spin: 0, celebrate: false, time: this.time },
        dt,
      );
      this.model.root.position.y = 0;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
