/**
 * Umgebung je Streckenstil: Bäume/Pflanzen (Instancing), Büsche, Blumen und kleine Tiere am Rand.
 */
import * as THREE from 'three';
import type { DecorStyle } from '../tracks/types';
import { G, mesh, merge, part, vary } from './geo';
import { chickenGeometry, palm } from './landmarks';

export interface StyleDef {
  /** Baumform */
  tree: 'laub' | 'palme' | 'tanne' | 'kaktus' | 'dschungel' | 'tot';
  crown: number[];
  trunk: number;
  bush: number;
  flowers: number[];
  /** Kleine Tiere am Rand */
  critter: 'huhn' | 'moewe' | 'eichhoernchen' | 'echse' | 'murmeltier' | 'papagei' | 'keins';
  /** Felsen am Rand */
  rocks: number;
  rockColor: number;
}

export const STYLES: Record<DecorStyle, StyleDef> = {
  wiese: { tree: 'laub', crown: [0x4f9d2f, 0x5fb03a, 0x3f8a2a, 0x6cbf45, 0xf7c6d9], trunk: 0x7a5230, bush: 0x4f9a35, flowers: [0xff5d8f, 0xffd23f, 0xffffff, 0xb27dff], critter: 'huhn', rocks: 0, rockColor: 0x9a9a92 },
  turnier: { tree: 'laub', crown: [0x3f8a2a, 0x4f9d2f, 0x5fb03a], trunk: 0x7a5230, bush: 0x3f8a2a, flowers: [0xff5d8f, 0xffffff, 0xe23b2e, 0xffd23f], critter: 'keins', rocks: 0, rockColor: 0x9a9a92 },
  strand: { tree: 'palme', crown: [0x3f9a3a], trunk: 0x8a6a3a, bush: 0x7aae4a, flowers: [0xff8fb1, 0xffd23f], critter: 'moewe', rocks: 25, rockColor: 0xb8b0a0 },
  herbst: { tree: 'laub', crown: [0xe8892e, 0xd8582a, 0xf0b52f, 0xb5401f, 0x9a6a2a], trunk: 0x5a3a20, bush: 0xb06a2a, flowers: [0xd8582a, 0xf0b52f], critter: 'eichhoernchen', rocks: 20, rockColor: 0x8a8a7a },
  wueste: { tree: 'kaktus', crown: [0x4f8a3a, 0x5f9a42], trunk: 0x8a6a3a, bush: 0x9a8a4a, flowers: [0xff5d8f, 0xffd23f], critter: 'echse', rocks: 60, rockColor: 0xc08a5a },
  alpen: { tree: 'tanne', crown: [0x2f5a3a, 0x3a6a42, 0x264a30], trunk: 0x5a3a20, bush: 0x3a5a3a, flowers: [0xffffff, 0x9ab8ff], critter: 'murmeltier', rocks: 70, rockColor: 0x8a8e96 },
  dschungel: { tree: 'dschungel', crown: [0x2f7a2a, 0x3f8a2a, 0x1f6a2a, 0x4f9a35], trunk: 0x5a4a2a, bush: 0x2f7a2a, flowers: [0xff3f6f, 0xff8c1a, 0xb27dff], critter: 'papagei', rocks: 20, rockColor: 0x6a6a5a },
  vulkan: { tree: 'tot', crown: [0x3a2e2a], trunk: 0x2a201c, bush: 0x3a3a2a, flowers: [0xff6a1a], critter: 'keins', rocks: 90, rockColor: 0x2e2622 },
};

/** Baumgeometrien je Stil: [Stamm, Krone] (Krone wird pro Instanz eingefärbt) */
export function treeGeometries(style: StyleDef): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry; crownColored: boolean } {
  switch (style.tree) {
    case 'palme': {
      const g = merge(palm(0, 0, 1));
      return { trunk: g, crown: new THREE.BufferGeometry(), crownColored: false };
    }
    case 'tanne': {
      const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2, 6).translate(0, 1, 0);
      const crown = merge([
        part(G.cone(2.4, 3, 7), 0xffffff, { pos: [0, 3, 0] }),
        part(G.cone(1.9, 2.6, 7), 0xffffff, { pos: [0, 4.6, 0] }),
        part(G.cone(1.3, 2.2, 7), 0xffffff, { pos: [0, 6, 0] }),
      ]);
      return { trunk, crown, crownColored: true };
    }
    case 'kaktus': {
      const g = merge([
        part(G.capsule(0.45, 3, 2, 7), 0x4f8a3a, { pos: [0, 1.9, 0] }),
        part(G.capsule(0.3, 1.1, 2, 6), 0x4f8a3a, { pos: [0.75, 2.2, 0] }),
        part(G.capsule(0.3, 0.6, 2, 6), 0x4f8a3a, { pos: [0.45, 1.6, 0], rot: [0, 0, Math.PI / 2] }),
        part(G.capsule(0.28, 0.9, 2, 6), 0x4f8a3a, { pos: [-0.7, 2.6, 0] }),
        part(G.capsule(0.28, 0.5, 2, 6), 0x4f8a3a, { pos: [-0.42, 2.1, 0], rot: [0, 0, Math.PI / 2] }),
        part(G.ball(0.18), 0xff5d8f, { pos: [0, 3.95, 0] }),
      ]);
      return { trunk: g, crown: new THREE.BufferGeometry(), crownColored: false };
    }
    case 'dschungel': {
      const trunk = new THREE.CylinderGeometry(0.35, 0.6, 7, 7).translate(0, 3.5, 0);
      const crown = merge([
        part(G.ball(3.2, 0), 0xffffff, { pos: [0, 7.5, 0], scale: [1.3, 0.6, 1.3] }),
        part(G.ball(2.2, 0), 0xffffff, { pos: [1.6, 6.6, 0.8], scale: [1.2, 0.6, 1.2] }),
        part(G.ball(2.2, 0), 0xffffff, { pos: [-1.5, 6.8, -0.9], scale: [1.2, 0.6, 1.2] }),
      ]);
      return { trunk, crown, crownColored: true };
    }
    case 'tot': {
      const g = merge([
        part(G.cyl(0.18, 0.35, 4, 5), 0x2a201c, { pos: [0, 2, 0] }),
        part(G.cyl(0.08, 0.14, 1.8, 4), 0x2a201c, { pos: [0.6, 3.4, 0], rot: [0, 0, -0.8] }),
        part(G.cyl(0.08, 0.14, 1.5, 4), 0x2a201c, { pos: [-0.5, 3.0, 0.2], rot: [0.2, 0, 0.9] }),
        part(G.cyl(0.06, 0.1, 1.2, 4), 0x2a201c, { pos: [0.1, 4.3, -0.3], rot: [-0.6, 0, 0.2] }),
      ]);
      return { trunk: g, crown: new THREE.BufferGeometry(), crownColored: false };
    }
    default: {
      const trunk = new THREE.CylinderGeometry(0.25, 0.4, 3, 6).translate(0, 1.5, 0);
      const crown = merge([part(G.ball(2.2, 0), 0xffffff, { pos: [0, 3.4, 0] }), part(G.ball(1.6, 0), 0xffffff, { pos: [0.5, 4.6, 0.3] })]);
      return { trunk, crown, crownColored: true };
    }
  }
}

/** Schneehauben für Tannen (Alpen) */
export function snowCaps(): THREE.BufferGeometry {
  return merge([
    part(G.cone(1.5, 1.0, 7), 0xffffff, { pos: [0, 3.9, 0] }),
    part(G.cone(1.15, 0.9, 7), 0xffffff, { pos: [0, 5.4, 0] }),
    part(G.cone(0.75, 0.8, 7), 0xffffff, { pos: [0, 6.75, 0] }),
  ]);
}

/** Kleines Tier am Streckenrand */
export function critterGeometry(kind: StyleDef['critter']): THREE.BufferGeometry[] {
  switch (kind) {
    case 'huhn':
      return chickenGeometry();
    case 'moewe':
      return [
        part(G.ball(0.25, 1), 0xffffff, { pos: [0, 0.35, 0], scale: [0.8, 0.8, 1.4] }),
        part(G.ball(0.14, 1), 0xffffff, { pos: [0, 0.55, 0.28] }),
        part(G.cone(0.05, 0.18, 4), 0xf2a81d, { pos: [0, 0.53, 0.45], rot: [Math.PI / 2, 0, 0] }),
        part(G.box(0.7, 0.04, 0.3), 0x9aa3b0, { pos: [0, 0.42, -0.05] }),
        part(G.cyl(0.02, 0.02, 0.2, 4), 0xf2a81d, { pos: [0.06, 0.1, 0] }),
        part(G.cyl(0.02, 0.02, 0.2, 4), 0xf2a81d, { pos: [-0.06, 0.1, 0] }),
      ];
    case 'eichhoernchen':
      return [
        part(G.ball(0.2, 1), 0xc0602a, { pos: [0, 0.25, 0], scale: [0.9, 1.1, 1.1] }),
        part(G.ball(0.13, 1), 0xc0602a, { pos: [0, 0.48, 0.12] }),
        part(G.capsule(0.12, 0.35, 2, 6), 0xd0703a, { pos: [0, 0.45, -0.22], rot: [-0.4, 0, 0] }),
        part(G.cone(0.04, 0.1, 4), 0xc0602a, { pos: [0.06, 0.62, 0.1] }),
        part(G.cone(0.04, 0.1, 4), 0xc0602a, { pos: [-0.06, 0.62, 0.1] }),
      ];
    case 'echse':
      return [
        part(G.capsule(0.1, 0.5, 2, 6), 0x7a9a3a, { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0] }),
        part(G.ball(0.1, 1), 0x7a9a3a, { pos: [0, 0.12, 0.38] }),
        part(G.cone(0.06, 0.5, 4), 0x7a9a3a, { pos: [0, 0.08, -0.5], rot: [-Math.PI / 2, 0, 0] }),
      ];
    case 'murmeltier':
      return [
        part(G.capsule(0.2, 0.3, 2, 7), 0x9a7a5a, { pos: [0, 0.35, 0] }),
        part(G.ball(0.15, 1), 0x9a7a5a, { pos: [0, 0.68, 0.05] }),
        part(G.ball(0.07), 0x5a4a3a, { pos: [0, 0.65, 0.18] }),
      ];
    case 'papagei':
      return [
        part(G.ball(0.2, 1), 0xe23b2e, { pos: [0, 0.4, 0], scale: [0.8, 1.2, 0.9] }),
        part(G.ball(0.13, 1), 0xe23b2e, { pos: [0, 0.68, 0.05] }),
        part(G.cone(0.06, 0.15, 4), 0xffd23f, { pos: [0, 0.63, 0.18], rot: [1.9, 0, 0] }),
        part(G.box(0.12, 0.35, 0.3), 0x2f6fd6, { pos: [0.16, 0.4, -0.05] }),
        part(G.box(0.12, 0.35, 0.3), 0x2f6fd6, { pos: [-0.16, 0.4, -0.05] }),
        part(G.box(0.1, 0.5, 0.06), 0x3faa3a, { pos: [0, 0.15, -0.22], rot: [0.4, 0, 0] }),
      ];
    default:
      return [];
  }
}

export function critterMesh(kind: StyleDef['critter'], shadows: boolean): THREE.Mesh | null {
  const g = critterGeometry(kind);
  return g.length ? mesh(g, shadows) : null;
}

export { vary };
