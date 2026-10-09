/**
 * Hilfen für Low-Poly-Geometrie: Teile werden eingefärbt (Vertex-Farben) und zu einem Mesh
 * zusammengefügt. So braucht ein ganzes Objekt nur einen Draw-Call und ein Material.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface PartOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

/** Färbt eine Geometrie ein und transformiert sie. Gibt eine nicht-indizierte Kopie zurück. */
export function part(geo: THREE.BufferGeometry, color: number, o: PartOpts = {}): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  if (o.pos || o.rot || o.scale) {
    tmpE.set(...(o.rot ?? [0, 0, 0]));
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(new THREE.Vector3(...(o.pos ?? [0, 0, 0])), tmpQ, new THREE.Vector3(...(o.scale ?? [1, 1, 1])));
    g.applyMatrix4(tmpM);
  }
  tmpC.setHex(color); // wandelt sRGB automatisch in den linearen Arbeitsraum um
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('Geometrien konnten nicht zusammengefügt werden');
  g.computeBoundingSphere();
  return g;
}

/** Gemeinsames Material für alle eingefärbten Low-Poly-Teile. */
let sharedMat: THREE.MeshLambertMaterial | null = null;
export function vcMaterial(): THREE.MeshLambertMaterial {
  if (!sharedMat) sharedMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return sharedMat;
}

export function mesh(parts: THREE.BufferGeometry[], shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), vcMaterial());
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

// Häufig gebrauchte Grundformen
export const G = {
  box: (w = 1, h = 1, d = 1) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt: number, rb: number, h: number, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg),
  cone: (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg),
  ball: (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail),
  capsule: (r: number, len: number, seg = 3, radial = 7) => new THREE.CapsuleGeometry(r, len, seg, radial),
  dodeca: (r: number) => new THREE.DodecahedronGeometry(r, 0),
};

/** Farbe leicht variieren (für natürlichere Instanzen). */
export function vary(hex: number, amount: number, rnd: () => number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h + (rnd() - 0.5) * amount * 0.2, hsl.s, Math.min(1, Math.max(0, hsl.l + (rnd() - 0.5) * amount)));
  return c;
}
