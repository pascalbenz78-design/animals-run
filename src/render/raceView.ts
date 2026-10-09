/**
 * Darstellung eines laufenden Rennens: Tiermodelle (interpoliert zwischen zwei Simulationsschritten),
 * Schatten-Kleckse, Staubpartikel und Kamera (Verfolger, Umkreisen für den Titelbildschirm).
 */
import * as THREE from 'three';
import { VIEW } from '../config/balance';
import { getAnimal } from '../animals/animals';
import { AnimalModel } from '../animals/models';
import type { RaceSim } from '../game/simulation';
import { wrapAngle } from '../game/track';
import type { GameRenderer } from './renderer';
import { blobTexture } from './textures';
import type { TrackView } from './trackView';

export type CameraMode = 'chase' | 'orbit';

const DUST_MAX = 220;

const DUST_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const DUST_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, vAlpha * smoothstep(0.5, 0.1, d));
  #include <colorspace_fragment>
}`;

export class RaceView {
  readonly models: AnimalModel[] = [];
  private readonly blobs: THREE.Mesh[] = [];
  private readonly group = new THREE.Group();
  focus = 0;
  mode: CameraMode = 'chase';
  private camHeading = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private camInit = false;
  private orbitAngle = 0;
  // Staub
  private readonly dustPos = new Float32Array(DUST_MAX * 3);
  private readonly dustVel = new Float32Array(DUST_MAX * 3);
  private readonly dustLife = new Float32Array(DUST_MAX);
  private readonly dustSize = new Float32Array(DUST_MAX);
  private readonly dustAlpha = new Float32Array(DUST_MAX);
  private readonly dustGeo = new THREE.BufferGeometry();
  private dustNext = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly gr: GameRenderer,
    private readonly sim: RaceSim,
    private readonly trackView: TrackView,
  ) {
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    for (const a of sim.animals) {
      const m = new AnimalModel(getAnimal(a.animalId));
      m.setShadows(gr.quality !== 'niedrig');
      this.group.add(m.root);
      this.models.push(m);
      const blob = new THREE.Mesh(blobGeo, blobMat);
      const r = sim.stats[a.id].radius * 2.6;
      blob.scale.set(r * 0.8, 1, r * 1.3);
      blob.renderOrder = 1;
      this.group.add(blob);
      this.blobs.push(blob);
    }
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dustGeo.setAttribute('aSize', new THREE.BufferAttribute(this.dustSize, 1));
    this.dustGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.dustAlpha, 1));
    const dust = new THREE.Points(
      this.dustGeo,
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color(0xd9b98a) } },
      }),
    );
    dust.frustumCulled = false;
    this.group.add(dust);
    gr.scene.add(this.group);
  }

  /** Frame zeichnen. `alpha` = Anteil zwischen letztem und aktuellem Simulationsschritt. */
  update(alpha: number, dt: number, time: number) {
    const sim = this.sim;
    const t = sim.track;
    for (const a of sim.animals) {
      const m = this.models[a.id];
      const x = a.prevX + (a.x - a.prevX) * alpha;
      const z = a.prevZ + (a.z - a.prevZ) * alpha;
      const alt = a.prevAlt + (a.alt - a.prevAlt) * alpha;
      const heading = a.prevHeading + wrapAngle(a.heading - a.prevHeading) * alpha;
      const ground = t.heightAt(a.s);
      m.root.visible = a.respawn <= 0 || Math.floor(time * 10) % 2 === 0;
      m.root.position.set(x, ground + alt, z);
      m.root.rotation.y = Math.PI / 2 - heading;
      // Am Hang leicht neigen
      m.root.rotation.x = 0;
      m.animate(
        {
          speed: a.speed,
          topSpeed: sim.stats[a.id].topSpeed,
          grounded: a.grounded,
          alt: a.alt,
          vy: a.vy,
          stride: a.stride,
          stumble: a.stumble,
          celebrate: a.finished,
          time: time + a.id * 0.37,
        },
        dt,
      );
      const blob = this.blobs[a.id];
      blob.position.set(x, ground + 0.07, z);
      blob.rotation.y = Math.PI / 2 - heading;
      const fade = Math.max(0.3, 1 - alt * 0.25);
      blob.scale.x = sim.stats[a.id].radius * 2.1 * fade;
      blob.scale.z = sim.stats[a.id].radius * 3.4 * fade;
      blob.visible = m.root.visible;

      // Staub hinter laufenden Tieren
      if (a.grounded && a.speed > 6 && Math.random() < dt * (a.inMud ? 30 : 14)) {
        this.spawnDust(x - Math.cos(heading) * 0.8, ground + 0.15, z - Math.sin(heading) * 0.8, a.inMud);
      }
    }
    this.updateDust(dt);
    this.trackView.update(time, sim.time);
    this.updateCamera(alpha, dt, time);
  }

  private spawnDust(x: number, y: number, z: number, mud: boolean) {
    const i = this.dustNext;
    this.dustNext = (this.dustNext + 1) % DUST_MAX;
    this.dustPos.set([x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6], i * 3);
    this.dustVel.set([(Math.random() - 0.5) * 1.2, 0.6 + Math.random() * (mud ? 2.5 : 0.8), (Math.random() - 0.5) * 1.2], i * 3);
    this.dustLife[i] = mud ? 0.6 : 1;
    this.dustSize[i] = mud ? 0.35 : 0.6;
  }

  private updateDust(dt: number) {
    for (let i = 0; i < DUST_MAX; i++) {
      if (this.dustLife[i] <= 0) {
        this.dustAlpha[i] = 0;
        continue;
      }
      this.dustLife[i] -= dt;
      this.dustVel[i * 3 + 1] -= dt * 1.5;
      this.dustPos[i * 3] += this.dustVel[i * 3] * dt;
      this.dustPos[i * 3 + 1] += this.dustVel[i * 3 + 1] * dt;
      this.dustPos[i * 3 + 2] += this.dustVel[i * 3 + 2] * dt;
      this.dustSize[i] += dt * 1.6;
      this.dustAlpha[i] = Math.max(0, this.dustLife[i]) * 0.45;
    }
    (this.dustGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.dustGeo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.dustGeo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateCamera(alpha: number, dt: number, time: number) {
    const cam = this.gr.camera;
    const a = this.sim.animals[this.focus];
    const st = this.sim.stats[this.focus];
    const t = this.sim.track;
    const x = a.prevX + (a.x - a.prevX) * alpha;
    const z = a.prevZ + (a.z - a.prevZ) * alpha;
    const ground = t.heightAt(a.s);
    const y = ground + a.prevAlt + (a.alt - a.prevAlt) * alpha;
    const heading = a.prevHeading + wrapAngle(a.heading - a.prevHeading) * alpha;
    const k = 1 - Math.exp(-dt * VIEW.camFollow);

    if (!this.camInit) {
      this.camHeading = heading;
    }
    if (this.mode === 'chase') {
      this.camHeading += wrapAngle(heading - this.camHeading) * (1 - Math.exp(-dt * 5));
      const fx = Math.cos(this.camHeading);
      const fz = Math.sin(this.camHeading);
      // Kleine Tiere: Kamera etwas tiefer, Abstand gleich (sonst verdeckt das Tier die Sicht)
      const small = st.radius < 0.8 ? 0.8 : 1;
      const dist = VIEW.camDistance;
      this.tmp.set(x - fx * dist, ground + VIEW.camHeight * small + a.alt * 0.4, z - fz * dist);
      // Kamera nicht unter das Gelände
      const camGround = t.heightAt(t.project(this.tmp.x, this.tmp.z, a.idx).s);
      this.tmp.y = Math.max(this.tmp.y, camGround + 1.2);
      if (!this.camInit) this.camPos.copy(this.tmp);
      else this.camPos.lerp(this.tmp, k);
      this.camLook.set(x + fx * VIEW.camLookAhead, y + VIEW.camLookHeight * small, z + fz * VIEW.camLookAhead);
      const speedFrac = Math.min(1, a.speed / 17);
      cam.fov += (VIEW.fovBase + VIEW.fovSpeedBonus * speedFrac - cam.fov) * k;
    } else {
      this.orbitAngle += dt * 0.12;
      const r = 16;
      this.tmp.set(x + Math.cos(this.orbitAngle) * r, y + 6 + Math.sin(time * 0.2) * 1.5, z + Math.sin(this.orbitAngle) * r);
      if (!this.camInit) this.camPos.copy(this.tmp);
      else this.camPos.lerp(this.tmp, 1 - Math.exp(-dt * 2));
      this.camLook.set(x, y + 1, z);
      cam.fov += (55 - cam.fov) * k;
    }
    this.camInit = true;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    cam.updateProjectionMatrix();
    this.gr.focusShadows(x, y, z);
  }

  resetCamera() {
    this.camInit = false;
  }

  dispose() {
    this.gr.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) {
        m.geometry.dispose();
      }
    });
  }
}
