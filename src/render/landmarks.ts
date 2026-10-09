/** Grössere Streckenobjekte (Stall, Silo, Teich …) als zusammengefügte Low-Poly-Meshes. */
import * as THREE from 'three';
import type { LandmarkType } from '../tracks/types';
import { G, mesh, part } from './geo';

export interface Landmark {
  object: THREE.Object3D;
  /** Kollisionsfreier Radius für die Dekoration */
  radius: number;
  /** Optionale Animation pro Frame */
  update?: (time: number) => void;
}

export function buildLandmark(type: LandmarkType): Landmark {
  switch (type) {
    case 'stall':
      return { object: barn(), radius: 16 };
    case 'silo':
      return { object: silo(), radius: 6 };
    case 'teich':
      return { object: pond(), radius: 14 };
    case 'traktor':
      return { object: tractor(), radius: 5 };
    case 'tribuene':
      return { object: grandstand(), radius: 14 };
    case 'windrad':
      return windmill();
    case 'richterturm':
      return { object: judgeTower(), radius: 6 };
    case 'leuchtturm':
      return lighthouse();
    case 'strandkorb':
      return { object: beachChairs(), radius: 7 };
    case 'hochsitz':
      return { object: hunterStand(), radius: 4 };
    case 'pyramide':
      return { object: pyramid(), radius: 40 };
    case 'oase':
      return { object: oasis(), radius: 16 };
    case 'chalet':
      return { object: chalet(), radius: 10 };
    case 'seilbahn':
      return cableCar();
    case 'tempel':
      return { object: temple(), radius: 14 };
    case 'wasserfall':
      return waterfall();
    case 'vulkan':
      return volcano();
  }
}

function judgeTower(): THREE.Object3D {
  const wood = 0x8a5a32;
  return mesh([
    ...[-1.4, 1.4].flatMap((x) => [-1.4, 1.4].map((z) => part(G.box(0.3, 5, 0.3), wood, { pos: [x, 2.5, z] }))),
    part(G.box(3.6, 0.3, 3.6), wood, { pos: [0, 5, 0] }),
    part(G.box(3.6, 1.8, 3.6), 0xf5efe2, { pos: [0, 6, 0] }),
    part(G.box(3.2, 1.0, 0.1), 0x9fd3f0, { pos: [0, 6.2, 1.81] }),
    part(G.cone(3.2, 1.6, 4), 0x2f6fb5, { pos: [0, 7.7, 0], rot: [0, Math.PI / 4, 0] }),
    part(G.box(2.2, 0.6, 0.15), 0xff7a1a, { pos: [0, 5.3, 1.9] }),
  ]);
}

function lighthouse(): Landmark {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) parts.push(part(G.cyl(2.2 - i * 0.22, 2.4 - i * 0.22, 3, 12), i % 2 ? 0xffffff : 0xd8262a, { pos: [0, 1.5 + i * 3, 0] }));
  parts.push(part(G.cyl(1.4, 1.4, 0.4, 12), 0x333333, { pos: [0, 18.2, 0] }));
  parts.push(part(G.cyl(1.1, 1.1, 1.6, 10), 0xfff6c0, { pos: [0, 19.2, 0] }));
  parts.push(part(G.cone(1.5, 1.4, 10), 0xd8262a, { pos: [0, 20.7, 0] }));
  parts.push(part(G.cyl(4, 4.5, 1, 10), 0x8a8a82, { pos: [0, 0.2, 0] }));
  g.add(mesh(parts));
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(2.5, 30, 12, 1, true).rotateZ(Math.PI / 2).translate(15, 0, 0),
    new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 19.2;
  g.add(beam);
  return { object: g, radius: 6, update: (t) => (beam.rotation.y = t * 0.7) };
}

function beachChairs(): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [];
  [0x2f8fd6, 0xe23b2e, 0x3fae49].forEach((c, i) => {
    const x = (i - 1) * 2.4;
    parts.push(part(G.box(1.8, 0.8, 1.2), 0xd9c08a, { pos: [x, 0.4, 0] }));
    parts.push(part(G.box(1.8, 1.8, 0.3), c, { pos: [x, 1.4, -0.5], rot: [-0.2, 0, 0] }));
    parts.push(part(G.box(0.2, 1.4, 1.1), c, { pos: [x - 0.85, 1.2, 0] }));
    parts.push(part(G.box(0.2, 1.4, 1.1), c, { pos: [x + 0.85, 1.2, 0] }));
  });
  parts.push(part(G.cyl(0.05, 0.05, 3, 5), 0xffffff, { pos: [4, 1.5, 1] }));
  parts.push(part(G.cone(1.8, 0.8, 8), 0xff7a1a, { pos: [4, 3.1, 1] }));
  return mesh(parts);
}

function hunterStand(): THREE.Object3D {
  const wood = 0x6b4423;
  return mesh([
    part(G.box(0.25, 4, 0.25), wood, { pos: [-0.8, 2, -0.8], rot: [0.08, 0, 0.08] }),
    part(G.box(0.25, 4, 0.25), wood, { pos: [0.8, 2, -0.8], rot: [0.08, 0, -0.08] }),
    part(G.box(0.25, 4, 0.25), wood, { pos: [-0.8, 2, 0.8], rot: [-0.08, 0, 0.08] }),
    part(G.box(0.25, 4, 0.25), wood, { pos: [0.8, 2, 0.8], rot: [-0.08, 0, -0.08] }),
    part(G.box(2, 1.2, 2), 0x7d5530, { pos: [0, 4.4, 0] }),
    part(G.box(2.4, 0.2, 2.4), 0x4a3020, { pos: [0, 5.3, 0], rot: [0.15, 0, 0] }),
  ]);
}

function pyramid(): THREE.Object3D {
  return mesh(
    [
      part(G.cone(34, 30, 4), 0xd9b277, { pos: [0, 15, 0], rot: [0, Math.PI / 4, 0] }),
      part(G.cone(5, 4.4, 4), 0xf2d38a, { pos: [0, 27.8, 0], rot: [0, Math.PI / 4, 0] }),
    ],
    false,
  );
}

/** Palme aus Stamm und Wedeln (für Strand, Oase, Dschungel) */
export function palm(x: number, z: number, s = 1): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) parts.push(part(G.cyl(0.22 * s, 0.28 * s, 1.3 * s, 6), 0x8a6a3a, { pos: [x + k * 0.12 * s, (0.65 + k * 1.2) * s, z], rot: [0, 0, -0.08] }));
  const top = 6.2 * s;
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    parts.push(part(G.box(0.5 * s, 0.06 * s, 2.6 * s), 0x3f9a3a, { pos: [x + 0.6 * s + Math.cos(a) * 1.1 * s, top - 0.3 * s, z + Math.sin(a) * 1.1 * s], rot: [0.35, -a + Math.PI / 2, 0] }));
  }
  parts.push(part(G.ball(0.25 * s), 0x6b4a2a, { pos: [x + 0.6 * s, top - 0.4 * s, z] }));
  return parts;
}

function oasis(): THREE.Object3D {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(9, 18), new THREE.MeshPhongMaterial({ color: 0x2fb0c8, shininess: 90 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.08;
  g.add(water);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1;
    parts.push(...palm(Math.cos(a) * 10, Math.sin(a) * 10, 0.9 + (i % 3) * 0.15));
  }
  for (let i = 0; i < 18; i++) parts.push(part(G.dodeca(0.6), 0x6fae3a, { pos: [Math.cos(i) * 9.2, 0.3, Math.sin(i) * 9.2] }));
  g.add(mesh(parts));
  return g;
}

function chalet(): THREE.Object3D {
  const tri = new THREE.Shape();
  tri.moveTo(-5.4, 0);
  tri.lineTo(5.4, 0);
  tri.lineTo(0, 3.6);
  tri.closePath();
  const roof = new THREE.ExtrudeGeometry(tri, { depth: 9.2, bevelEnabled: false });
  return mesh([
    part(G.box(8, 2.5, 8), 0xb0a89a, { pos: [0, 1.25, 0] }),
    part(G.box(8, 3, 8), 0x8a5a32, { pos: [0, 4, 0] }),
    part(roof, 0x5b4636, { pos: [0, 5.5, -4.6] }),
    part(roof, 0xffffff, { pos: [0, 5.75, -4.6], scale: [0.98, 0.95, 1] }),
    part(G.box(8.6, 0.2, 1.4), 0x6b4423, { pos: [0, 4, 4.6] }),
    ...[-2.2, 0, 2.2].map((x) => part(G.box(1.2, 1.2, 0.1), 0xfff1c0, { pos: [x, 4.3, 4.02] })),
    ...[-2.2, 2.2].map((x) => part(G.box(1.4, 0.4, 0.3), 0xe23b2e, { pos: [x, 3.6, 4.1] })),
    part(G.box(1.4, 2, 0.1), 0x4a3020, { pos: [0, 1, 4.02] }),
  ]);
}

function cableCar(): Landmark {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-30, 30]) {
    parts.push(part(G.box(0.8, 22, 0.8), 0x7a7a82, { pos: [x, 11, 0] }));
    parts.push(part(G.box(4, 0.6, 0.6), 0x7a7a82, { pos: [x, 22, 0] }));
  }
  parts.push(part(G.box(60, 0.08, 0.08), 0x333333, { pos: [0, 21.6, 0] }));
  g.add(mesh(parts));
  const cabin = mesh([part(G.box(2.4, 2, 2), 0xe23b2e), part(G.box(2.2, 0.8, 2.05), 0xbfe3f2, { pos: [0, 0.3, 0] }), part(G.box(0.1, 1.4, 0.1), 0x333333, { pos: [0, 1.6, 0] })]);
  cabin.position.y = 19.6;
  g.add(cabin);
  return { object: g, radius: 8, update: (t) => (cabin.position.x = Math.sin(t * 0.15) * 26) };
}

function temple(): THREE.Object3D {
  const stone = 0x9a9a7a;
  const moss = 0x5f8a3a;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) parts.push(part(G.box(18 - i * 4, 2.2, 18 - i * 4), i % 2 ? moss : stone, { pos: [0, 1.1 + i * 2.2, 0] }));
  parts.push(part(G.box(4, 3, 4), stone, { pos: [0, 10.3, 0] }));
  parts.push(part(G.box(1.6, 2, 0.2), 0x2a2a1a, { pos: [0, 9.8, 2.05] }));
  parts.push(part(G.box(2.4, 10, 0.6), stone, { pos: [0, 5, 8.6], rot: [-0.85, 0, 0] }));
  return mesh(parts);
}

function stripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 128; i += 4) {
    x.fillStyle = i % 8 ? 'rgba(220,240,255,0.95)' : 'rgba(120,190,240,0.9)';
    x.fillRect(0, i, 32, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function waterfall(): Landmark {
  const g = new THREE.Group();
  g.add(
    mesh([
      part(G.box(16, 16, 8), 0x6a6a5a, { pos: [0, 8, -3] }),
      part(G.dodeca(4), 0x5a5a4a, { pos: [-7, 3, 1] }),
      part(G.dodeca(3.5), 0x5a5a4a, { pos: [7, 3, 1] }),
      part(G.box(16.5, 1, 8.5), 0x3f8a3a, { pos: [0, 16.2, -3] }),
    ]),
  );
  const tex = stripeTexture();
  tex.repeat.set(4, 2);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(6, 15), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85 }));
  fall.position.set(0, 8, 1.05);
  g.add(fall);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(6, 16), new THREE.MeshPhongMaterial({ color: 0x3fa0d0, shininess: 90 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.1, 4);
  g.add(pool);
  return { object: g, radius: 14, update: (t) => (tex.offset.y = t * 1.5) };
}

function volcano(): Landmark {
  const g = new THREE.Group();
  g.add(mesh([part(G.cone(90, 70, 12), 0x3a2e2a, { pos: [0, 35, 0] }), part(G.cyl(18, 22, 6, 12), 0x2a201c, { pos: [0, 70, 0] })], false));
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 1, 12), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
  glow.position.y = 72.6;
  g.add(glow);
  const smoke = new THREE.Mesh(new THREE.IcosahedronGeometry(14, 1), new THREE.MeshLambertMaterial({ color: 0x4a4040, transparent: true, opacity: 0.6, flatShading: true }));
  smoke.position.y = 90;
  g.add(smoke);
  return {
    object: g,
    radius: 95,
    update: (t) => {
      smoke.position.y = 88 + Math.sin(t * 0.3) * 4;
      smoke.scale.setScalar(1 + Math.sin(t * 0.5) * 0.1);
      (glow.material as THREE.MeshBasicMaterial).color.setHSL(0.06, 1, 0.5 + Math.sin(t * 2) * 0.08);
    },
  };
}

function barn(): THREE.Object3D {
  const red = 0xb8322a;
  const white = 0xf5efe2;
  const roof = 0x5b4636;
  const tri = new THREE.Shape();
  tri.moveTo(-6.8, 0);
  tri.lineTo(6.8, 0);
  tri.lineTo(0, 4.6);
  tri.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: 20.6, bevelEnabled: false });
  return mesh([
    part(G.box(12, 6, 20), red, { pos: [0, 3, 0] }),
    part(roofGeo, roof, { pos: [0, 6, -10.3] }),
    // Tor mit weissem Rahmen und X
    part(G.box(5, 4.6, 0.3), 0x8e2219, { pos: [0, 2.3, 10.05] }),
    part(G.box(5.4, 0.35, 0.4), white, { pos: [0, 4.7, 10.1] }),
    part(G.box(0.35, 4.8, 0.4), white, { pos: [-2.6, 2.4, 10.1] }),
    part(G.box(0.35, 4.8, 0.4), white, { pos: [2.6, 2.4, 10.1] }),
    part(G.box(6.4, 0.3, 0.35), white, { pos: [0, 2.3, 10.2], rot: [0, 0, 0.74] }),
    part(G.box(6.4, 0.3, 0.35), white, { pos: [0, 2.3, 10.2], rot: [0, 0, -0.74] }),
    part(G.box(2, 1.6, 0.3), white, { pos: [0, 7.2, 10.05] }),
    part(G.box(1.6, 1.2, 0.35), 0x3b2a20, { pos: [0, 7.2, 10.1] }),
    // Ecken
    part(G.box(0.4, 6, 0.4), white, { pos: [6, 3, 10] }),
    part(G.box(0.4, 6, 0.4), white, { pos: [-6, 3, 10] }),
    part(G.box(0.4, 6, 0.4), white, { pos: [6, 3, -10] }),
    part(G.box(0.4, 6, 0.4), white, { pos: [-6, 3, -10] }),
    // Fenster seitlich
    ...[-5, 0, 5].flatMap((z) => [
      part(G.box(0.3, 1.4, 1.6), white, { pos: [6.05, 3.4, z] }),
      part(G.box(0.35, 1.0, 1.2), 0x3b2a20, { pos: [6.1, 3.4, z] }),
    ]),
  ]);
}

function silo(): THREE.Object3D {
  return mesh([
    part(G.cyl(2.6, 2.6, 13, 12), 0xd9d4c7, { pos: [0, 6.5, 0] }),
    part(new THREE.SphereGeometry(2.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x8c99a3, { pos: [0, 13, 0] }),
    ...[3, 6.5, 10].map((y) => part(G.cyl(2.7, 2.7, 0.3, 12), 0x9aa3a8, { pos: [0, y, 0] })),
  ]);
}

function pond(): THREE.Object3D {
  const g = new THREE.Group();
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(11, 20),
    new THREE.MeshPhongMaterial({ color: 0x3f9fd6, shininess: 90, specular: 0xbfe8ff }),
  );
  water.rotation.x = -Math.PI / 2;
  water.scale.set(1, 0.7, 1);
  water.position.y = 0.08;
  water.receiveShadow = true;
  g.add(water);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    parts.push(part(G.dodeca(0.5 + (i % 3) * 0.2), 0x9a9a92, { pos: [Math.cos(a) * 11.2, 0.15, Math.sin(a) * 7.8] }));
  }
  for (let i = 0; i < 16; i++) {
    const a = 2.2 + (i / 16) * 1.6;
    parts.push(part(G.cyl(0.05, 0.07, 1.6, 4), 0x5f8a2e, { pos: [Math.cos(a) * 9.5, 0.8, Math.sin(a) * 6.5] }));
    parts.push(part(G.capsule(0.09, 0.25, 1, 5), 0x6b4423, { pos: [Math.cos(a) * 9.5, 1.6, Math.sin(a) * 6.5] }));
  }
  // Seerosen
  for (let i = 0; i < 6; i++) parts.push(part(G.cyl(0.6, 0.6, 0.05, 7), 0x4c9a3a, { pos: [-4 + i * 1.6, 0.12, -1 + (i % 2) * 2] }));
  g.add(mesh(parts));
  return g;
}

function tractor(): THREE.Object3D {
  const green = 0x2f8a3a;
  return mesh([
    part(G.box(2.2, 1.3, 3.4), green, { pos: [0, 1.5, 0.4] }),
    part(G.box(2, 1.9, 1.7), green, { pos: [0, 2.6, -0.8] }),
    part(G.box(1.8, 1.2, 1.5), 0xbfe3f2, { pos: [0, 2.8, -0.8] }),
    part(G.box(2.2, 0.15, 2), 0x222222, { pos: [0, 3.6, -0.8] }),
    part(G.cyl(0.12, 0.12, 1.2, 6), 0x333333, { pos: [0.6, 2.6, 1.4] }),
    part(G.cyl(1.2, 1.2, 0.7, 12), 0x222222, { pos: [1.4, 1.2, -1], rot: [0, 0, Math.PI / 2] }),
    part(G.cyl(1.2, 1.2, 0.7, 12), 0x222222, { pos: [-1.4, 1.2, -1], rot: [0, 0, Math.PI / 2] }),
    part(G.cyl(0.55, 0.55, 0.75, 6), 0xe0b81f, { pos: [1.4, 1.2, -1], rot: [0, 0, Math.PI / 2] }),
    part(G.cyl(0.55, 0.55, 0.75, 6), 0xe0b81f, { pos: [-1.4, 1.2, -1], rot: [0, 0, Math.PI / 2] }),
    part(G.cyl(0.7, 0.7, 0.5, 10), 0x222222, { pos: [1.2, 0.7, 1.6], rot: [0, 0, Math.PI / 2] }),
    part(G.cyl(0.7, 0.7, 0.5, 10), 0x222222, { pos: [-1.2, 0.7, 1.6], rot: [0, 0, Math.PI / 2] }),
  ]);
}

function grandstand(): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [];
  const crowd = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0xffffff, 0xff8fb1];
  for (let r = 0; r < 4; r++) {
    parts.push(part(G.box(22, 0.8, 1.6), 0xc9c2b4, { pos: [0, 0.4 + r * 0.8, -r * 1.6] }));
    for (let i = 0; i < 18; i++) {
      const c = crowd[(i * 3 + r * 5) % crowd.length];
      parts.push(part(G.box(0.55, 0.8, 0.45), c, { pos: [-10 + i * 1.18, 1.2 + r * 0.8, -r * 1.6 - 0.2] }));
      parts.push(part(G.ball(0.25), 0xf2c8a0, { pos: [-10 + i * 1.18, 1.85 + r * 0.8, -r * 1.6 - 0.2] }));
    }
  }
  for (const x of [-11, 11]) parts.push(part(G.box(0.4, 7, 0.4), 0x7a7a7a, { pos: [x, 3.5, -5.5] }));
  for (const x of [-11, 11]) parts.push(part(G.box(0.4, 5.5, 0.4), 0x7a7a7a, { pos: [x, 2.75, 0.6] }));
  parts.push(part(G.box(23, 0.3, 7.5), 0x2f6fb5, { pos: [0, 6.3, -2.4], rot: [0.2, 0, 0] }));
  return mesh(parts);
}

function windmill(): Landmark {
  const g = new THREE.Group();
  g.add(
    mesh([
      part(G.cyl(0.6, 1.4, 18, 8), 0xf2f2f2, { pos: [0, 9, 0] }),
      part(G.box(1.4, 1.4, 2.6), 0xf2f2f2, { pos: [0, 18.3, 0.3] }),
    ]),
  );
  const rotor = new THREE.Group();
  rotor.position.set(0, 18.3, 1.8);
  rotor.add(
    mesh([
      part(G.ball(0.5), 0xdddddd),
      ...[0, 1, 2].map((i) => part(G.box(0.6, 8, 0.15), 0xfafafa, { pos: [Math.sin((i * 2 * Math.PI) / 3) * 4, Math.cos((i * 2 * Math.PI) / 3) * 4, 0], rot: [0, 0, -(i * 2 * Math.PI) / 3] })),
    ]),
  );
  g.add(rotor);
  return { object: g, radius: 6, update: (t) => (rotor.rotation.z = t * 0.8) };
}

/** Kleines Huhn (für den Bauernhof). */
export function chickenGeometry(): THREE.BufferGeometry[] {
  return [
    part(G.ball(0.28, 1), 0xfafafa, { pos: [0, 0.38, 0], scale: [0.9, 0.9, 1.2] }),
    part(G.ball(0.16, 1), 0xfafafa, { pos: [0, 0.68, 0.22] }),
    part(G.box(0.06, 0.12, 0.14), 0xe03a2f, { pos: [0, 0.86, 0.22] }),
    part(G.cone(0.05, 0.12, 4), 0xf2a81d, { pos: [0, 0.66, 0.4], rot: [Math.PI / 2, 0, 0] }),
    part(G.box(0.04, 0.1, 0.05), 0xe03a2f, { pos: [0, 0.57, 0.34] }),
    part(G.cone(0.14, 0.25, 4), 0xeeeeee, { pos: [0, 0.55, -0.3], rot: [-0.8, 0, 0] }),
    part(G.cyl(0.02, 0.02, 0.2, 4), 0xf2a81d, { pos: [0.08, 0.1, 0] }),
    part(G.cyl(0.02, 0.02, 0.2, 4), 0xf2a81d, { pos: [-0.08, 0.1, 0] }),
  ];
}
