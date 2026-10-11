/** WebGL-Renderer, Szene, Licht, Himmel und Grafikstufen. */
import * as THREE from 'three';
import { VIEW } from '../config/balance';
import type { TrackTheme } from '../tracks/types';
import type { Quality } from './trackView';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
  float sun = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sun, 600.0) * 1.5 + pow(sun, 12.0) * 0.18);
  if (uNight > 0.5) {
    // Sterne: zufällige helle Punkte am Nachthimmel
    vec3 p = floor(d * 260.0);
    float h = fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    col += vec3(step(0.9965, h)) * smoothstep(0.05, 0.4, d.y) * 1.3;
  }
  if (d.y < 0.0) col = uHorizon;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(VIEW.fovBase, 1, 0.3, 2500);
  readonly sun = new THREE.DirectionalLight(0xffffff, 2.4);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private readonly sky: THREE.Mesh;
  private readonly clouds: THREE.InstancedMesh;
  private readonly sunOffset = new THREE.Vector3(-50, 100, 35);
  quality: Quality;

  constructor(container: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'niedrig', powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 10;
    sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(2000, 24, 12),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color() },
          uNight: { value: 0 },
        },
      }),
    );
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // Wolken: abgeflachte Kugeln weit oben
    const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
    this.clouds = new THREE.InstancedMesh(cloudGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xbbbbbb, flatShading: true, fog: false }), 60);
    const d = new THREE.Object3D();
    let k = 0;
    for (let c = 0; c < 15; c++) {
      const a = (c / 15) * Math.PI * 2 + Math.sin(c * 7.1) * 0.3;
      const r = 700 + Math.sin(c * 3.3) * 250;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const cy = 160 + Math.sin(c * 5.7) * 50;
      for (let p = 0; p < 4; p++) {
        d.position.set(cx + (p - 1.5) * 28, cy + Math.sin(p * 2.1) * 6, cz + Math.cos(p * 1.7) * 10);
        const s = 22 + Math.sin(c + p) * 8;
        d.scale.set(s * 1.4, s * 0.6, s);
        d.updateMatrix();
        this.clouds.setMatrixAt(k++, d.matrix);
      }
    }
    this.scene.add(this.clouds);

    this.setQuality(quality);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.resize(), 100));
  }

  /** Zuletzt gesetzte Grösse (CSS-Pixel) */
  private w = 0;
  private h = 0;

  /** Automatische Auflösung (1 = volle Auflösung der Grafikstufe) */
  private scale = 1;
  private fpsTime = 0;
  private fpsFrames = 0;

  setQuality(q: Quality) {
    this.quality = q;
    this.scale = 1;
    this.applyPixelRatio();
    const size = VIEW.shadowMapSize[q];
    const on = size > 0;
    if (this.renderer.shadowMap.enabled !== on) {
      this.renderer.shadowMap.enabled = on;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
      });
    }
    this.sun.castShadow = on;
    if (on && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  applyTheme(th: TrackTheme) {
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.uTop.value.setHex(th.skyTop);
    u.uHorizon.value.setHex(th.skyHorizon);
    u.uSunColor.value.setHex(th.sunColor);
    const dir = new THREE.Vector3(...th.sunDir).normalize();
    u.uSunDir.value.copy(dir);
    u.uNight.value = th.night ? 1 : 0;
    // Wolken: nachts dunkel
    const cm = this.clouds.material as THREE.MeshLambertMaterial;
    cm.color.setHex(th.night ? 0x2a2230 : 0xffffff);
    cm.emissive.setHex(th.night ? 0x100810 : 0xbbbbbb);
    this.sunOffset.copy(dir).multiplyScalar(130);
    this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    this.scene.background = new THREE.Color(th.skyHorizon);
    this.sun.color.setHex(th.sunColor);
    this.sun.intensity = th.sunIntensity;
    this.hemi.color.setHex(th.hemiSky);
    this.hemi.groundColor.setHex(th.hemiGround);
    this.hemi.intensity = th.ambient * 2.2;
  }

  /** Schattenbereich folgt dem beobachteten Tier. */
  focusShadows(x: number, y: number, z: number) {
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x + this.sunOffset.x, y + this.sunOffset.y, z + this.sunOffset.z);
    this.sun.target.updateMatrixWorld();
  }

  /**
   * Grösse an die Spielfläche anpassen. Die Leinwand füllt per CSS immer den ganzen Bildschirm;
   * hier wird nur die Auflösung nachgeführt (Android meldet nach Drehen/Vollbild die neue Grösse
   * manchmal verspätet – darum prüft render() bei jedem Bild).
   */
  resize() {
    const el = this.renderer.domElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Im Hochformat etwas mehr Sichtfeld
    this.camera.updateProjectionMatrix();
  }

  private applyPixelRatio() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, VIEW.pixelRatio[this.quality]) * this.scale);
  }

  /**
   * Bildrate beobachten: ruckelt es, wird die Auflösung schrittweise gesenkt (bis 60 %),
   * läuft es wieder flüssig, wird sie erhöht. So bleibt das Spiel auch auf älteren Handys flüssig.
   */
  adapt(dt: number) {
    const A = VIEW.autoScale;
    this.fpsTime += dt;
    this.fpsFrames++;
    if (this.fpsTime < A.interval) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsTime = 0;
    this.fpsFrames = 0;
    const before = this.scale;
    if (fps < A.lowFps) this.scale = Math.max(A.min, this.scale - A.step);
    else if (fps > A.highFps) this.scale = Math.min(1, this.scale + A.step / 2);
    if (this.scale !== before) {
      this.applyPixelRatio();
      this.resize();
    }
  }

  get resolutionScale() {
    return this.scale;
  }

  render(time: number) {
    const el = this.renderer.domElement;
    if (el.clientWidth !== this.w || el.clientHeight !== this.h) this.resize();
    this.sky.position.copy(this.camera.position);
    this.clouds.position.set(this.camera.position.x * 0.9, 0, this.camera.position.z * 0.9);
    this.clouds.rotation.y = time * 0.004;
    this.renderer.render(this.scene, this.camera);
  }
}
