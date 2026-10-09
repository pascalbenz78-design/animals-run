/**
 * Wetter-Partikel rund um die Kamera (Pollen, Laub, Sand, Schnee, Regen, Asche)
 * und der Sandsturm (dichter Nebel ab einer bestimmten Runde).
 */
import * as THREE from 'three';
import type { TrackData, WeatherType } from '../tracks/types';
import type { Quality } from './trackView';

interface WeatherStyle {
  count: number;
  color: number;
  size: number;
  /** Fallgeschwindigkeit (m/s) */
  fall: number;
  /** Seitliches Treiben */
  drift: number;
  opacity: number;
}

const STYLES: Record<Exclude<WeatherType, 'keins'>, WeatherStyle> = {
  pollen: { count: 220, color: 0xfff6c0, size: 0.12, fall: 0.2, drift: 0.6, opacity: 0.8 },
  laub: { count: 260, color: 0xe0782a, size: 0.32, fall: 1.2, drift: 1.4, opacity: 0.95 },
  sand: { count: 500, color: 0xe0c08a, size: 0.14, fall: 0.3, drift: 6, opacity: 0.7 },
  schnee: { count: 900, color: 0xffffff, size: 0.18, fall: 1.6, drift: 0.8, opacity: 0.95 },
  regen: { count: 1100, color: 0xbcd8ff, size: 0.09, fall: 16, drift: 0.5, opacity: 0.6 },
  asche: { count: 600, color: 0xff8a3a, size: 0.13, fall: -0.6, drift: 0.7, opacity: 0.85 },
};

const VERT = /* glsl */ `
attribute float aSeed;
uniform float uSize;
uniform float uTime;
varying float vSeed;
void main() {
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (420.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uStreak;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // Regen: schmale Striche statt Punkte
  c.x *= 1.0 + uStreak * 6.0;
  float d = length(c);
  if (d > 0.5) discard;
  vec3 col = uColor * (0.85 + 0.3 * fract(vSeed * 13.7));
  gl_FragColor = vec4(col, uOpacity * smoothstep(0.5, 0.15, d));
  #include <colorspace_fragment>
}`;

const BOX = { x: 70, y: 28, z: 70 };

export class Weather {
  readonly points: THREE.Points | null = null;
  private readonly pos: Float32Array | null = null;
  private readonly style: WeatherStyle | null = null;
  private readonly fogNear: number;
  private readonly fogFar: number;
  private storm = 0;

  constructor(
    private readonly data: TrackData,
    private readonly scene: THREE.Scene,
    quality: Quality,
  ) {
    this.fogNear = data.theme.fogNear;
    this.fogFar = data.theme.fogFar;
    const w = data.weather;
    if (!w || w.type === 'keins') return;
    const st = STYLES[w.type];
    const count = Math.round(st.count * (quality === 'hoch' ? 1 : quality === 'mittel' ? 0.6 : 0.3) * (w.storm ? 2 : 1));
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * BOX.x;
      pos[i * 3 + 1] = Math.random() * BOX.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: w.type === 'asche' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(st.color) },
        uSize: { value: st.size },
        uOpacity: { value: st.opacity },
        uStreak: { value: w.type === 'regen' ? 1 : 0 },
        uTime: { value: 0 },
      },
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    this.points = pts;
    this.pos = pos;
    this.style = st;
    // Ohne Sturm: halb so viele Teilchen sichtbar
    if (w.storm) geo.setDrawRange(0, Math.round(count / 2));
  }

  /** Pro Frame: Teilchen bewegen (um die Kamera herum) und ggf. Sandsturm einblenden */
  update(dt: number, time: number, cam: THREE.Vector3, leaderLap: number) {
    const w = this.data.weather;
    if (!this.points || !this.pos || !this.style || !w) return;
    const st = this.style;
    const stormOn = !!w.storm && leaderLap >= (w.fromLap ?? 1);
    this.storm += ((stormOn ? 1 : 0) - this.storm) * Math.min(1, dt * 0.8);
    const geo = this.points.geometry;
    const count = this.pos.length / 3;
    if (w.storm) geo.setDrawRange(0, Math.round(count * (0.5 + this.storm * 0.5)));
    const drift = st.drift * (1 + this.storm * 2);
    const p = this.pos;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      p[k] += (Math.sin(time * 0.7 + i) * 0.5 + (w.type === 'sand' ? 1 : 0.2)) * drift * dt;
      p[k + 1] -= st.fall * dt * (0.7 + (i % 5) * 0.12);
      p[k + 2] += Math.cos(time * 0.5 + i * 1.3) * drift * 0.4 * dt;
      // In der Box um die Kamera halten
      if (p[k] - cam.x > BOX.x / 2) p[k] -= BOX.x;
      else if (p[k] - cam.x < -BOX.x / 2) p[k] += BOX.x;
      if (p[k + 2] - cam.z > BOX.z / 2) p[k + 2] -= BOX.z;
      else if (p[k + 2] - cam.z < -BOX.z / 2) p[k + 2] += BOX.z;
      if (p[k + 1] < cam.y - 8) p[k + 1] += BOX.y;
      else if (p[k + 1] > cam.y - 8 + BOX.y) p[k + 1] -= BOX.y;
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    // Sandsturm: Sicht wird schlecht
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog && w.storm) {
      fog.near = this.fogNear + (12 - this.fogNear) * this.storm;
      fog.far = this.fogFar + (95 - this.fogFar) * this.storm;
    }
  }

  dispose() {
    if (!this.points) return;
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
