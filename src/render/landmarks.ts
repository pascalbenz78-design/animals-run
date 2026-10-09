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
  }
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
