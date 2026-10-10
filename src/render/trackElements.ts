/**
 * Darstellung der Streckenelemente: Untergründe (Wasser, Eis, Sand, Matsch, Lava, Löcher),
 * Hürdenarten, runde Hindernisse, Reifen, Schanzen und Geysire, Tore, rollende Stämme,
 * Windradflügel, Hängebrücken, Lawinen und Abkürzungswege.
 */
import * as THREE from 'three';
import { ELEMENTS } from '../config/balance';
import type { Elements } from '../game/elements';
import { mulberry32 } from '../game/rng';
import type { Track } from '../game/track';
import type { ObstacleKind } from '../tracks/types';
import { G, mesh, merge, part } from './geo';
import { dirtTexture } from './textures';

interface Animated {
  update(time: number, raceTime: number, leaderLap: number): void;
}

export class ElementsView {
  readonly group = new THREE.Group();
  private readonly anims: Animated[] = [];
  private readonly hurdleObjs: THREE.Object3D[] = [];
  private readonly p = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly track: Track,
    private readonly el: Elements,
    private readonly hurdleHit: number[] | null,
    shadows: boolean,
  ) {
    this.buildZones();
    this.buildHurdles(shadows);
    this.buildObstacles(shadows);
    this.buildHoops();
    this.buildRamps(shadows);
    this.buildGates(shadows);
    this.buildLogs(shadows);
    this.buildSpinners(shadows);
    this.buildBridges(shadows);
    this.buildAvalanches();
    this.buildLianas(shadows);
    this.buildWaves();
    this.buildShortcuts();
  }

  /** Objekt an (s, d) auf die Strecke stellen, lokale +z = Laufrichtung, +x = links */
  private place(obj: THREE.Object3D, s: number, d: number, dy = 0) {
    const t = this.track;
    t.pointAt(s, d, this.p);
    obj.position.set(this.p.x, this.p.y + dy, this.p.z);
    obj.rotation.set(0, Math.PI / 2 - t.headingAt(s), 0);
  }

  /** Band entlang der Strecke zwischen d0 und d1 (optional mit unregelmässigen Rändern) */
  private strip(s0: number, length: number, d0: number, d1: number, y: number, mat: THREE.Material, ragged = false, uvScale = 0): THREE.Mesh {
    const t = this.track;
    const steps = Math.max(2, Math.round(length / 1.2));
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    const rnd = mulberry32(Math.round(s0 * 7));
    const mid = (d0 + d1) / 2;
    const half = (d1 - d0) / 2;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      let h0 = half;
      let h1 = half;
      if (ragged) {
        const e = Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)) * (0.8 + rnd() * 0.25);
        h0 = half * Math.max(0.15, e);
        h1 = half * Math.max(0.15, e * (0.9 + rnd() * 0.2));
      }
      for (const [side, h] of [
        [-1, h0],
        [1, h1],
      ] as const) {
        t.pointAt(s0 + f * length, mid + side * h, this.p);
        verts.push(this.p.x, this.p.y + y, this.p.z);
        uvs.push(side < 0 ? 0 : uvScale ? (d1 - d0) / uvScale : 1, uvScale ? (f * length) / uvScale : f);
      }
      if (i < steps) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  private buildZones() {
    const hw = this.track.halfWidth + 0.6;
    const waterColor = this.el.data.theme.water ?? 0x3fa0d6;
    const night = !!this.el.data.theme.night;
    for (const z of this.el.zones) {
      const d0 = Math.max(-hw, z.d0);
      const d1 = Math.min(hw, z.d1);
      switch (z.type) {
        case 'matsch':
          this.strip(z.s, z.length, d0, d1, 0.06, new THREE.MeshPhongMaterial({ color: 0x5a3a1c, shininess: 60, specular: 0x6a5040 }), true);
          break;
        case 'sand':
          this.strip(z.s, z.length, d0, d1, 0.05, new THREE.MeshLambertMaterial({ map: dirtTexture(0xe8d29a, 0xd9be7f, 11) }), d1 - d0 < hw * 2 - 1, 8);
          break;
        case 'eis':
          this.strip(z.s, z.length, d0, d1, 0.05, new THREE.MeshPhongMaterial({ color: 0xd4efff, shininess: 140, specular: 0xffffff, transparent: true, opacity: 0.92 }), d1 - d0 < hw * 2 - 1);
          break;
        case 'wasser': {
          const m = this.strip(z.s, z.length, d0, d1, 0.12, new THREE.MeshPhongMaterial({ color: waterColor, shininess: 120, specular: 0xbfe8ff, transparent: true, opacity: 0.85 }));
          m.receiveShadow = false;
          break;
        }
        case 'tiefwasser': {
          // Wasseroberfläche über der Bahn; Tiere sinken darin ein
          const mat = new THREE.MeshPhongMaterial({ color: waterColor, shininess: 120, specular: 0xd8f2ff, transparent: true, opacity: 0.82 });
          this.strip(z.s - 2, z.length + 4, Math.max(-hw - 3, z.d0), Math.min(hw + 3, z.d1), 0.42, mat);
          // Dunklerer Grund
          this.strip(z.s, z.length, d0, d1, 0.03, new THREE.MeshLambertMaterial({ color: 0x2a5a7a }));
          this.anims.push({
            update: (t) => {
              mat.opacity = 0.78 + Math.sin(t * 1.3 + z.s) * 0.05;
            },
          });
          break;
        }
        case 'lava': {
          const mat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
          this.strip(z.s, z.length, d0, d1, 0.04, mat);
          // Dunkle Kruste an den Rändern
          this.strip(z.s - 0.6, 0.8, d0, d1, 0.05, new THREE.MeshLambertMaterial({ color: 0x2a1a14 }));
          this.strip(z.s + z.length - 0.2, 0.8, d0, d1, 0.05, new THREE.MeshLambertMaterial({ color: 0x2a1a14 }));
          this.anims.push({ update: (t) => mat.color.setHSL(0.05 + Math.sin(t * 2 + z.s) * 0.015, 1, night ? 0.55 : 0.5) });
          break;
        }
        case 'loch':
          this.strip(z.s, z.length, d0, d1, 0.05, new THREE.MeshBasicMaterial({ color: 0x0b0806 }));
          break;
      }
    }
  }

  private buildHurdles(shadows: boolean) {
    const hw = this.track.halfWidth;
    this.el.hurdles.forEach((hu) => {
      const H = hu.height;
      const parts: THREE.BufferGeometry[] = [];
      const gapIn = (x: number) => !!hu.gap && x >= hu.gap[0] && x <= hu.gap[1];
      const segs = Math.ceil(hw * 2);
      const segW = (hw * 2) / segs;
      switch (hu.kind) {
        case 'oxer':
        case 'huerde': {
          const depth = hu.kind === 'oxer' ? [-0.5, 0.5] : [0];
          const colA = hu.kind === 'oxer' ? 0x2f6fd6 : 0xe23b2e;
          for (const z of depth) {
            for (const x of [-hw - 0.2, hw + 0.2]) {
              parts.push(part(G.box(0.25, H + 0.5, 0.25), 0xffffff, { pos: [x, (H + 0.5) / 2, z] }));
              parts.push(part(G.box(0.12, H + 0.3, 1.2), 0x2b6cc4, { pos: [x + Math.sign(x) * 0.25, (H + 0.3) / 2, z] }));
            }
            const rails = hu.kind === 'oxer' ? [H * 0.35, H * 0.68, H - 0.06] : [H * 0.45, H - 0.06];
            for (const y of rails) {
              for (let i = 0; i < segs; i++) {
                const x0 = -hw + i * segW + segW / 2;
                if (gapIn(x0)) continue;
                parts.push(part(G.cyl(0.07, 0.07, segW, 6), i % 2 ? 0xffffff : colA, { pos: [x0, y, z], rot: [0, 0, Math.PI / 2] }));
              }
            }
          }
          // Blumenkästen davor
          for (let i = 0; i < 6; i++) {
            const x = -hw + 1.3 + i * ((hw * 2 - 2.6) / 5);
            if (gapIn(x)) continue;
            parts.push(part(G.box(1.2, 0.25, 0.4), 0x7a4f2a, { pos: [x, 0.12, 1.1] }));
            parts.push(part(G.ball(0.22), i % 2 ? 0xffd23f : 0xff5d8f, { pos: [x - 0.3, 0.32, 1.1] }));
            parts.push(part(G.ball(0.22), i % 2 ? 0xff5d8f : 0xffffff, { pos: [x + 0.3, 0.32, 1.1] }));
          }
          break;
        }
        case 'steilwand': {
          for (let i = 0; i < segs; i++) {
            const x0 = -hw + i * segW + segW / 2;
            if (gapIn(x0)) continue;
            parts.push(part(G.box(segW, H, 0.5), (i + Math.floor(i / 2)) % 2 ? 0xf2efe6 : 0xc8452e, { pos: [x0, H / 2, 0] }));
          }
          parts.push(part(G.box(hw * 2 + 0.6, 0.12, 0.6), 0x2f6fd6, { pos: [0, H + 0.06, 0] }));
          if (hu.gap) {
            // Kleiner Tunnel für den Hamster
            const gx = (hu.gap[0] + hu.gap[1]) / 2;
            const gw = hu.gap[1] - hu.gap[0];
            parts.push(part(G.box(gw + 0.2, H - 0.75, 0.55), 0xc8452e, { pos: [gx, 0.75 + (H - 0.75) / 2, 0] }));
          }
          break;
        }
        case 'zaun': {
          for (let i = 0; i <= segs; i += 2) parts.push(part(G.box(0.18, H + 0.2, 0.18), 0x6b4423, { pos: [-hw + i * segW, (H + 0.2) / 2, 0] }));
          for (const y of [H * 0.4, H * 0.85]) parts.push(part(G.box(hw * 2, 0.14, 0.1), 0x8a5a32, { pos: [0, y, 0], rot: [0, 0, 0.03] }));
          break;
        }
        case 'stamm': {
          parts.push(part(G.cyl(H / 2, H / 2, hw * 2 + 0.6, 10), 0x7a5230, { pos: [0, H / 2, 0], rot: [0, 0, Math.PI / 2] }));
          parts.push(part(G.cyl(H / 2 - 0.08, H / 2 - 0.08, 0.05, 10), 0xd9b27a, { pos: [hw + 0.32, H / 2, 0], rot: [0, 0, Math.PI / 2] }));
          parts.push(part(G.cyl(H / 2 - 0.08, H / 2 - 0.08, 0.05, 10), 0xd9b27a, { pos: [-hw - 0.32, H / 2, 0], rot: [0, 0, Math.PI / 2] }));
          break;
        }
      }
      const obj = mesh(parts, shadows);
      this.place(obj, hu.s, 0);
      this.group.add(obj);
      this.hurdleObjs.push(obj);
    });
  }

  private obstacleGeometry(kind: ObstacleKind): THREE.BufferGeometry {
    const o = ELEMENTS.obstacle[kind];
    switch (kind) {
      case 'heuballen':
        return merge([
          part(G.cyl(o.r, o.r, o.h, 12), 0xe8c55a, { pos: [0, o.h / 2, 0] }),
          part(G.cyl(o.r * 0.75, o.r * 0.75, 0.02, 12), 0xc9a23e, { pos: [0, o.h + 0.01, 0] }),
          part(G.cyl(o.r + 0.02, o.r + 0.02, 0.12, 12), 0x9c6b2e, { pos: [0, o.h * 0.33, 0] }),
          part(G.cyl(o.r + 0.02, o.r + 0.02, 0.12, 12), 0x9c6b2e, { pos: [0, o.h * 0.7, 0] }),
        ]);
      case 'stein':
        return merge([part(G.dodeca(o.r), 0x9a9a92, { pos: [0, o.h * 0.45, 0], scale: [1, 0.75, 1] })]);
      case 'fels':
        return merge([part(G.dodeca(o.r), 0x8a8478, { pos: [0, o.h * 0.5, 0], scale: [1, 0.85, 1.1] }), part(G.dodeca(o.r * 0.5), 0x9a948a, { pos: [o.r * 0.6, o.h * 0.3, 0.3] })]);
      case 'kaktus':
        return merge([
          part(G.capsule(o.r * 0.7, o.h - 0.8, 2, 7), 0x4f8a3a, { pos: [0, o.h / 2 + 0.1, 0] }),
          part(G.capsule(0.25, 0.6, 2, 6), 0x4f8a3a, { pos: [0.55, o.h * 0.55, 0] }),
          part(G.capsule(0.22, 0.5, 2, 6), 0x4f8a3a, { pos: [-0.5, o.h * 0.65, 0] }),
          part(G.ball(0.15), 0xff5d8f, { pos: [0, o.h + 0.1, 0] }),
        ]);
      case 'sandburg':
        return merge([
          part(G.box(1.6, 0.8, 1.6), 0xe0c890, { pos: [0, 0.4, 0] }),
          ...[
            [-0.7, -0.7],
            [0.7, -0.7],
            [-0.7, 0.7],
            [0.7, 0.7],
          ].map(([x, z]) => part(G.cyl(0.3, 0.35, 1.2, 7), 0xd8bc80, { pos: [x, 0.6, z] })),
          part(G.cone(0.3, 0.4, 6), 0xe23b2e, { pos: [0, 1.3, 0] }),
          part(G.cyl(0.02, 0.02, 0.6, 4), 0x6b4423, { pos: [0, 1.0, 0] }),
        ]);
      case 'schneeball':
        return merge([part(G.ball(o.r, 1), 0xf6faff, { pos: [0, o.r, 0] }), part(G.ball(0.12), 0x8a8e96, { pos: [0.4, o.r * 1.4, 0.5] })]);
      case 'baumstumpf':
        return merge([
          part(G.cyl(o.r, o.r * 1.15, o.h, 9), 0x6b4423, { pos: [0, o.h / 2, 0] }),
          part(G.cyl(o.r - 0.08, o.r - 0.08, 0.04, 9), 0xd9b27a, { pos: [0, o.h + 0.01, 0] }),
          part(G.ball(0.18), 0xd8262a, { pos: [o.r * 0.7, 0.15, o.r * 0.6] }),
        ]);
      case 'gluehfels':
        return merge([
          part(G.dodeca(o.r), 0x2e2420, { pos: [0, o.h * 0.5, 0], scale: [1, 0.9, 1] }),
          part(G.box(0.12, 0.6, o.r * 1.8), 0xff6a1a, { pos: [0.1, o.h * 0.6, 0], rot: [0.3, 0.4, 0] }),
          part(G.box(0.1, 0.5, o.r * 1.4), 0xff8a2a, { pos: [-0.3, o.h * 0.5, 0.2], rot: [-0.2, 1.4, 0] }),
        ]);
    }
  }

  private buildObstacles(shadows: boolean) {
    const byKind = new Map<ObstacleKind, THREE.BufferGeometry>();
    for (const o of this.el.obstacles) {
      if (!byKind.has(o.kind)) byKind.set(o.kind, this.obstacleGeometry(o.kind));
      const m = new THREE.Mesh(
        byKind.get(o.kind)!,
        new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: o.kind === 'gluehfels' ? 0x5a1a00 : 0x000000 }),
      );
      m.castShadow = m.receiveShadow = shadows;
      this.track.pointAt(o.s, o.d, this.p);
      m.position.set(o.x, this.p.y, o.z);
      m.rotation.y = o.s * 3.7;
      this.group.add(m);
    }
  }

  private buildHoops() {
    const geo = new THREE.TorusGeometry(ELEMENTS.hoop.radius, 0.12, 8, 28);
    for (const h of this.el.data.hoops ?? []) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffb21a, emissive: 0x6a3a00 }));
      ring.position.y = ELEMENTS.hoop.radius + 0.3;
      g.add(ring);
      g.add(mesh([part(G.cyl(0.07, 0.07, 0.35, 5), 0xffffff, { pos: [0, 0.15, 0] })]));
      this.place(g, h.s * this.track.length, h.d);
      this.group.add(g);
      this.anims.push({ update: (t) => (ring.rotation.z = Math.sin(t * 2 + h.s * 10) * 0.08) });
    }
  }

  private buildRamps(shadows: boolean) {
    const ramps = this.el.data.ramps ?? [];
    ramps.forEach((r, i) => {
      const kind = r.kind ?? 'schanze';
      const g = new THREE.Group();
      if (kind === 'geysir') {
        g.add(mesh([part(G.cyl(1.4, 1.8, 0.3, 10), 0x4a3a32, { pos: [0, 0.15, 0] }), part(G.cyl(0.9, 0.9, 0.32, 10), 0x1a1210, { pos: [0, 0.17, 0] })], shadows));
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.6, 1.1, 1, 10, 1, true).translate(0, 0.5, 0),
          new THREE.MeshLambertMaterial({ color: 0xdff4ff, emissive: 0x6a8aa0, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
        );
        g.add(col);
        this.anims.push({
          update: (_t, raceTime) => {
            const on = this.el.geyserActive(raceTime, i);
            const G2 = ELEMENTS.geyser;
            const ph = (((raceTime + i * 1.7) % G2.period) + G2.period) % G2.period;
            const soon = ph > G2.period - 0.8;
            col.visible = on || soon;
            col.scale.set(1, on ? 7 + Math.sin(raceTime * 30) * 0.5 : 0.6 + Math.sin(raceTime * 40) * 0.2, 1);
          },
        });
      } else {
        const len = kind === 'duene' ? 5 : 3.2;
        const h = kind === 'duene' ? 1.1 : 0.9;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(len, 0);
        shape.lineTo(len, h);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: r.width, bevelEnabled: false });
        // Lokal: x = Länge (Laufrichtung), z = Breite → drehen, damit Länge = +z
        const p = part(geo, kind === 'duene' ? 0xe0c48a : 0xc8823a, { pos: [r.width / 2, 0, -len], rot: [0, -Math.PI / 2, 0] });
        const stripes = kind === 'duene' ? [] : [part(G.box(r.width, 0.06, 0.3), 0xffd23f, { pos: [0, h + 0.02, -0.15] })];
        g.add(mesh([p, ...stripes], shadows));
      }
      this.place(g, r.s * this.track.length, r.d);
      this.group.add(g);
    });
  }

  private buildGates(shadows: boolean) {
    const hw = this.track.halfWidth;
    (this.el.data.gates ?? []).forEach((gd, i) => {
      const g = new THREE.Group();
      g.add(
        mesh(
          [
            part(G.box(0.5, 3.4, 0.5), 0x8a5a32, { pos: [hw + 0.4, 1.7, 0] }),
            part(G.box(0.5, 3.4, 0.5), 0x8a5a32, { pos: [-hw - 0.4, 1.7, 0] }),
            part(G.box(hw * 2 + 1.3, 0.5, 0.5), 0x8a5a32, { pos: [0, 3.4, 0] }),
            part(G.box(3, 0.8, 0.1), 0xffd23f, { pos: [0, 3.4, 0.3] }),
          ],
          shadows,
        ),
      );
      const leaves: THREE.Object3D[] = [];
      for (const side of [1, -1]) {
        const hinge = new THREE.Group();
        hinge.position.set(side * hw, 0, 0);
        const door = mesh(
          [
            part(G.box(hw, 2.2, 0.15), 0xd8452e, { pos: [-side * hw / 2, 1.2, 0] }),
            part(G.box(hw, 0.25, 0.2), 0xffffff, { pos: [-side * hw / 2, 1.2, 0], rot: [0, 0, side * 0.35] }),
            part(G.box(hw, 0.2, 0.2), 0xffffff, { pos: [-side * hw / 2, 2.2, 0] }),
          ],
          shadows,
        );
        hinge.add(door);
        g.add(hinge);
        leaves.push(hinge);
      }
      this.place(g, gd.s * this.track.length, 0);
      this.group.add(g);
      this.anims.push({
        update: (_t, raceTime) => {
          const k = this.el.gateAmount(i, raceTime);
          leaves[0].rotation.y = -k * 1.4;
          leaves[1].rotation.y = k * 1.4;
        },
      });
    });
  }

  private buildLogs(shadows: boolean) {
    const hw = this.track.halfWidth;
    const R = ELEMENTS.log.radius;
    (this.el.data.logs ?? []).forEach((_l, i) => {
      const holder = new THREE.Group();
      const log = mesh(
        [
          part(G.cyl(R, R, hw * 2, 10), 0x7a5230, { rot: [0, 0, Math.PI / 2] }),
          part(G.cyl(R - 0.06, R - 0.06, 0.04, 10), 0xd9b27a, { pos: [hw + 0.01, 0, 0], rot: [0, 0, Math.PI / 2] }),
          part(G.cyl(R - 0.06, R - 0.06, 0.04, 10), 0xd9b27a, { pos: [-hw - 0.01, 0, 0], rot: [0, 0, Math.PI / 2] }),
          part(G.box(0.4, 0.1, 0.1), 0x3f8a2a, { pos: [1.5, R, 0] }),
        ],
        shadows,
      );
      log.position.y = R;
      holder.add(log);
      this.group.add(holder);
      this.anims.push({
        update: (_t, raceTime) => {
          const s = this.el.logS(i, raceTime);
          this.place(holder, s, 0);
          log.rotation.x = s / R;
        },
      });
    });
  }

  private buildSpinners(shadows: boolean) {
    (this.el.data.spinners ?? []).forEach((sp, i) => {
      const hub = mesh([part(G.cyl(0.4, 0.5, 1.4, 8), 0x8a8a92, { pos: [0, 0.7, 0] }), part(G.cone(0.5, 0.6, 8), 0xe23b2e, { pos: [0, 1.7, 0] })], shadows);
      this.track.pointAt(sp.s * this.track.length, sp.d, this.p);
      hub.position.set(this.p.x, this.p.y, this.p.z);
      this.group.add(hub);
      const arm = new THREE.Group();
      const segs = Math.ceil(sp.radius);
      const parts: THREE.BufferGeometry[] = [];
      for (let k = 0; k < segs; k++) parts.push(part(G.box(sp.radius / segs, 0.35, 0.35), k % 2 ? 0xffffff : 0xe23b2e, { pos: [(k + 0.5) * (sp.radius / segs), 0, 0] }));
      parts.push(part(G.ball(0.3), 0xffd23f, { pos: [sp.radius, 0, 0] }));
      arm.add(mesh(parts, shadows));
      arm.position.set(this.p.x, this.p.y + ELEMENTS.spinner.height * 0.55, this.p.z);
      this.group.add(arm);
      this.anims.push({
        update: (_t, raceTime) => {
          const a = this.el.spinnerArm(i, raceTime);
          arm.rotation.y = -Math.atan2(a.tz - a.cz, a.tx - a.cx);
        },
      });
    });
  }

  private buildBridges(shadows: boolean) {
    const t = this.track;
    (this.el.data.bridges ?? []).forEach((b, i) => {
      const s0 = b.s * t.length - b.length / 2;
      const deck = new THREE.Group();
      // Bretter quer zur Laufrichtung; die Brücke wird als Ganzes seitlich verschoben
      const sMid = s0 + b.length / 2;
      t.pointAt(sMid, 0, this.p);
      const cx = this.p.x;
      const cz = this.p.z;
      const cy = this.p.y;
      const hMid = t.headingAt(sMid);
      // Brücken liegen auf geraden Abschnitten: gerades Deck aus Brettern (lokal +z = Laufrichtung)
      const parts: THREE.BufferGeometry[] = [];
      const steps = Math.ceil(b.length / 0.9);
      for (let k = 0; k <= steps; k++) {
        const z = -b.length / 2 + (k / steps) * b.length;
        const y = t.heightAt(s0 + (k / steps) * b.length) - cy + 0.35;
        parts.push(part(G.box(b.width, 0.15, 0.7), k % 3 ? 0x9a6a3a : 0x8a5a32, { pos: [0, y, z] }));
        if (k % 3 === 0) {
          for (const side of [-1, 1]) parts.push(part(G.cyl(0.07, 0.07, 1.2, 5), 0x6b4423, { pos: [side * (b.width / 2), y + 0.6, z] }));
        }
      }
      // Seile entlang
      for (const side of [-1, 1]) parts.push(part(G.box(0.06, 0.06, b.length), 0xd9c08a, { pos: [side * (b.width / 2), 1.45, 0] }));
      deck.add(mesh(parts, shadows));
      deck.position.set(cx, cy, cz);
      deck.rotation.y = Math.PI / 2 - hMid;
      this.group.add(deck);
      if (b.below === 'schlucht') {
        this.strip(s0, b.length, -t.halfWidth - 3, t.halfWidth + 3, 0.06, new THREE.MeshBasicMaterial({ color: 0x0b0806 }));
      }
      const nx = Math.sin(hMid);
      const nz = -Math.cos(hMid);
      this.anims.push({
        update: (_tt, raceTime) => {
          const off = this.el.bridgeOffset(i, raceTime);
          deck.position.set(cx + nx * off, cy, cz + nz * off);
          deck.rotation.z = off * 0.04;
        },
      });
    });
  }

  private buildAvalanches() {
    const t = this.track;
    (this.el.data.avalanches ?? []).forEach((av, i) => {
      const s0 = av.s * t.length - av.length / 2;
      const parts: THREE.BufferGeometry[] = [];
      const rnd = mulberry32(i + 5);
      for (let k = 0; k < 14; k++) {
        parts.push(part(G.ball(1 + rnd() * 0.8, 0), 0xf6faff, { pos: [(rnd() - 0.5) * 2.5, 0.8 + rnd() * 1.2, (k / 13 - 0.5) * av.length] }));
      }
      const wall = mesh(parts, false);
      wall.visible = false;
      this.group.add(wall);
      const sMid = s0 + av.length / 2;
      this.anims.push({
        update: (_tt, raceTime, lap) => {
          const st = this.el.avalanche(i, raceTime, lap);
          wall.visible = st.front !== null;
          if (st.front === null) return;
          this.place(wall, sMid, st.front);
          wall.rotation.x = raceTime * 2;
        },
      });
    });
  }

  private buildLianas(shadows: boolean) {
    const L = ELEMENTS.liane;
    (this.el.data.lianas ?? []).forEach((li, n) => {
      const g = new THREE.Group();
      const rnd = mulberry32(n + 41);
      const half = li.width / 2 + 0.8;
      // Zwei Stämme mit querliegendem Ast
      const frame: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        frame.push(part(G.cyl(0.35, 0.45, L.top + 1, 7), 0x5a3a20, { pos: [side * half, (L.top + 1) / 2, 0] }));
        frame.push(part(G.dodeca(1.6), 0x2f7a2a, { pos: [side * half, L.top + 1.4, 0] }));
      }
      frame.push(part(G.box(half * 2 + 0.6, 0.35, 0.35), 0x6b4423, { pos: [0, L.top, 0] }));
      // Bananen als Blickfang
      frame.push(part(G.ball(0.25), 0xffd23f, { pos: [0.4, L.top - 0.35, 0.1] }), part(G.ball(0.22), 0xf5c82a, { pos: [0.65, L.top - 0.4, 0.05] }));
      g.add(mesh(frame, shadows));
      // Einzelne Lianen, oben aufgehängt, schaukeln leicht
      const vines: THREE.Object3D[] = [];
      const count = Math.max(4, Math.round(li.width / 0.75));
      for (let k = 0; k < count; k++) {
        const x = -li.width / 2 + ((k + 0.5) / count) * li.width;
        const len = L.top - L.bottom - rnd() * 0.5;
        const parts: THREE.BufferGeometry[] = [part(G.cyl(0.05, 0.06, len, 5), 0x3f6a22, { pos: [0, -len / 2, 0] })];
        for (let j = 0; j < 4; j++) parts.push(part(G.dodeca(0.16), j % 2 ? 0x4f9a2a : 0x3f8a2a, { pos: [(rnd() - 0.5) * 0.2, -len * (0.2 + j * 0.22), 0] }));
        parts.push(part(G.ball(0.12), 0x5a8a2a, { pos: [0, -len, 0] }));
        const v = mesh(parts, false);
        v.position.set(x, L.top, 0);
        g.add(v);
        vines.push(v);
      }
      this.place(g, li.s * this.track.length, li.d);
      this.group.add(g);
      this.anims.push({
        update: (time) => {
          vines.forEach((v, k) => {
            v.rotation.x = Math.sin(time * 1.4 + k * 0.9) * 0.12;
            v.rotation.z = Math.sin(time * 1.1 + k * 1.7) * 0.05;
          });
        },
      });
    });
  }

  private buildWaves() {
    const t = this.track;
    const hw = t.halfWidth;
    const waterColor = this.el.data.theme.water ?? 0x3fa0d6;
    (this.el.data.waves ?? []).forEach((w, i) => {
      const s0 = w.s * t.length - w.length / 2;
      // Meer neben der Bahn (rechts), von dort kommen die Wellen
      this.strip(s0 - 6, w.length + 12, -hw - 16, -hw - 0.5, 0.08, new THREE.MeshPhongMaterial({ color: waterColor, shininess: 120, specular: 0xd8f2ff, transparent: true, opacity: 0.85 }), true);
      // Wellenkamm mit Schaumkrone, in kurzen Stücken entlang der (evtl. gebogenen) Strecke
      const seg = 2;
      const n = Math.ceil(w.length / seg);
      const pieces: THREE.Mesh[] = [];
      const rnd = mulberry32(i + 17);
      const light = new THREE.Color(waterColor).lerp(new THREE.Color(0xffffff), 0.25).getHex();
      for (let k = 0; k < n; k++) {
        const parts: THREE.BufferGeometry[] = [
          // Wasserwalze (liegt quer zur Bahn, rollt nach links)
          part(G.cyl(0.85, 0.85, seg + 0.1, 10), light, { rot: [Math.PI / 2, 0, 0], pos: [0, 0.25, 0], scale: [1.5, 1, 1] }),
          // flacher Ausläufer dahinter (Richtung Meer)
          part(G.box(2.6, 0.18, seg + 0.1), waterColor, { pos: [-1.9, 0.12, 0] }),
          // Schaumkrone vorne oben
          part(G.ball(0.42 + rnd() * 0.2, 0), 0xffffff, { pos: [0.75, 0.95, -0.5] }),
          part(G.ball(0.38 + rnd() * 0.2, 0), 0xf0f8ff, { pos: [0.95, 0.75, 0.5] }),
          part(G.ball(0.3, 0), 0xffffff, { pos: [1.25, 0.35, 0] }),
        ];
        const m = mesh(parts, false);
        m.visible = false;
        this.group.add(m);
        pieces.push(m);
      }
      this.anims.push({
        update: (time, raceTime) => {
          const st = this.el.wave(i, raceTime);
          pieces.forEach((m, k) => {
            m.visible = st.front !== null;
            if (st.front === null) return;
            this.place(m, s0 + (k + 0.5) * seg, st.front);
            // Beim Heranrollen klein, über die Bahn gross; leichtes Wogen
            const h = (st.active ? 1 : 0.6) + Math.sin(time * 5 + k) * 0.08;
            m.scale.set(1, h, 1);
          });
        },
      });
    });
  }

  private buildShortcuts() {
    const t = this.track;
    const tex = dirtTexture(0xa8845a, 0x7a6040, 21);
    this.el.shortcuts.forEach((sc) => {
      const W = ELEMENTS.shortcut.width / 2;
      const n = sc.px.length;
      const verts: number[] = [];
      const uvs: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1);
        const b = Math.min(n - 1, i + 1);
        const dx = sc.px[b] - sc.px[a];
        const dz = sc.pz[b] - sc.pz[a];
        const l = Math.hypot(dx, dz) || 1;
        const nx = dz / l;
        const nz = -dx / l;
        const u = sc.cum[i] / sc.length;
        const y = t.heightAt(sc.fromS + u * sc.skip) + 0.05;
        for (const side of [-1, 1]) {
          verts.push(sc.px[i] + nx * W * side, y, sc.pz[i] + nz * W * side);
          uvs.push(side < 0 ? 0 : 1, sc.cum[i] / 8);
        }
        if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const hidden = sc.def.kind === 'versteckt';
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: hidden ? null : tex, color: hidden ? 0x6aaa3a : 0xffffff, side: THREE.DoubleSide }));
      m.receiveShadow = true;
      this.group.add(m);
      // Einstieg kennzeichnen
      const entry = new THREE.Group();
      const parts: THREE.BufferGeometry[] = [];
      if (sc.def.kind === 'klein') {
        // Niedriger Tunnel: nur für kleine Tiere
        parts.push(part(G.box(0.4, 1.6, 0.4), 0x6b4423, { pos: [-1.3, 0.8, 0] }), part(G.box(0.4, 1.6, 0.4), 0x6b4423, { pos: [1.3, 0.8, 0] }));
        parts.push(part(G.box(3.2, 0.8, 0.5), 0x7a5230, { pos: [0, 1.5, 0] }));
        parts.push(part(G.box(1.2, 0.5, 0.1), 0xffd23f, { pos: [0, 1.5, 0.3] }));
      } else if (sc.def.kind === 'versteckt') {
        for (let k = 0; k < 5; k++) parts.push(part(G.dodeca(0.9), 0x3f8a2a, { pos: [(k - 2) * 1, 0.7, (k % 2) * 0.6] }));
      } else if (sc.def.kind === 'sprung') {
        parts.push(part(G.box(4.5, 0.5, 1.5), 0x8a7a6a, { pos: [0, 0.25, 0.6] }));
      } else {
        parts.push(part(G.box(0.15, 1.6, 0.15), 0xffffff, { pos: [0, 0.8, 0] }), part(G.box(1.2, 0.5, 0.1), 0xff7a1a, { pos: [0, 1.5, 0] }));
      }
      const em = mesh(parts, false);
      const ex = sc.px[1];
      const ez = sc.pz[1];
      em.position.set(ex, t.heightAt(sc.fromS), ez);
      em.rotation.y = Math.atan2(sc.px[2] - sc.px[0], sc.pz[2] - sc.pz[0]);
      entry.add(em);
      this.group.add(entry);
    });
  }

  update(time: number, raceTime: number, leaderLap: number) {
    for (const a of this.anims) a.update(time, raceTime, leaderLap);
    // Angestossene Hürden wackeln kurz
    if (this.hurdleHit) {
      this.hurdleObjs.forEach((o, i) => {
        const since = raceTime - this.hurdleHit![i];
        o.rotation.x = since >= 0 && since < 0.8 ? Math.sin(since * 30) * 0.12 * (1 - since / 0.8) : 0;
      });
    }
  }
}
