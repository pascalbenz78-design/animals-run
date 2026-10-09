/**
 * Baut die 3D-Szene einer Strecke aus den Streckendaten: Gelände, Laufbahn, Zäune, Start/Ziel,
 * Hürden, Heuballen, Matsch, Blitze, Gebäude, Bäume, Hühner und Hintergrund-Hügel.
 * Wiederholte Objekte nutzen Instancing (ein Draw-Call für viele Bäume/Zaunpfosten).
 */
import * as THREE from 'three';
import { ENERGY, OBSTACLES, VIEW } from '../config/balance';
import type { Track } from '../game/track';
import { mulberry32 } from '../game/rng';
import type { RaceSim } from '../game/simulation';
import { G, mesh, part, vary, vcMaterial } from './geo';
import { buildLandmark, chickenGeometry, type Landmark } from './landmarks';
import { bannerTexture, checkerTexture, dirtTexture } from './textures';

export type Quality = 'hoch' | 'mittel' | 'niedrig';

interface Chicken {
  obj: THREE.Object3D;
  phase: number;
  baseX: number;
  baseZ: number;
  baseY: number;
}

export class TrackView {
  readonly group = new THREE.Group();
  private readonly hurdleObjs: THREE.Object3D[] = [];
  private readonly boltMesh: THREE.InstancedMesh;
  private readonly boltGlow: THREE.InstancedMesh;
  private readonly landmarks: Landmark[] = [];
  private readonly chickens: Chicken[] = [];
  private readonly occupied: { x: number; z: number; r: number }[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  /** Grobes Raster: Abstand zur Strecke je Gitterzelle (für Platzierung der Deko). */
  private distGrid!: { x0: number; z0: number; cell: number; nx: number; nz: number; dist: Float32Array; h: Float32Array };

  constructor(
    private readonly track: Track,
    private readonly sim: RaceSim | null,
    quality: Quality,
  ) {
    const t = track;
    for (let i = 0; i < t.count; i++) {
      this.bounds.minX = Math.min(this.bounds.minX, t.px[i]);
      this.bounds.maxX = Math.max(this.bounds.maxX, t.px[i]);
      this.bounds.minZ = Math.min(this.bounds.minZ, t.pz[i]);
      this.bounds.maxZ = Math.max(this.bounds.maxZ, t.pz[i]);
    }
    const shadows = quality !== 'niedrig';
    this.buildDistGrid();
    this.buildGround();
    this.buildRibbon();
    this.buildStartFinish();
    this.buildFences();
    this.buildHurdles();
    this.buildBales(shadows);
    this.buildMud();
    const bolts = this.buildBolts();
    this.boltMesh = bolts.mesh;
    this.boltGlow = bolts.glow;
    this.buildLandmarks();
    this.buildDecor(VIEW.decorDensity[quality], shadows);
    this.buildHills();
  }

  /** Abstand zur Mittellinie und Streckenhöhe auf einem 4-m-Raster vorberechnen. */
  private buildDistGrid() {
    const t = this.track;
    const margin = 260;
    const cell = 4;
    const x0 = this.bounds.minX - margin;
    const z0 = this.bounds.minZ - margin;
    const nx = Math.ceil((this.bounds.maxX - this.bounds.minX + margin * 2) / cell) + 1;
    const nz = Math.ceil((this.bounds.maxZ - this.bounds.minZ + margin * 2) / cell) + 1;
    const dist = new Float32Array(nx * nz).fill(1e9);
    const h = new Float32Array(nx * nz);
    // Für jeden Streckenpunkt die umliegenden Zellen aktualisieren (schneller als alle Paare)
    const reach = 60;
    const rc = Math.ceil(reach / cell);
    for (let i = 0; i < t.count; i += 2) {
      const cx = Math.round((t.px[i] - x0) / cell);
      const cz = Math.round((t.pz[i] - z0) / cell);
      for (let dz = -rc; dz <= rc; dz++)
        for (let dx = -rc; dx <= rc; dx++) {
          const gx = cx + dx;
          const gz = cz + dz;
          if (gx < 0 || gz < 0 || gx >= nx || gz >= nz) continue;
          const wx = x0 + gx * cell - t.px[i];
          const wz = z0 + gz * cell - t.pz[i];
          const d = Math.hypot(wx, wz);
          const k = gz * nx + gx;
          if (d < dist[k]) {
            dist[k] = d;
            h[k] = t.py[i];
          }
        }
    }
    this.distGrid = { x0, z0, cell, nx, nz, dist, h };
  }

  private gridAt(x: number, z: number): { dist: number; h: number } {
    const g = this.distGrid;
    const gx = Math.max(0, Math.min(g.nx - 1, Math.round((x - g.x0) / g.cell)));
    const gz = Math.max(0, Math.min(g.nz - 1, Math.round((z - g.z0) / g.cell)));
    const k = gz * g.nx + gx;
    return { dist: g.dist[k], h: g.h[k] };
  }

  /** Geländehöhe: nahe der Strecke auf Streckenhöhe, weiter weg sanfte Hügel. */
  groundHeight(x: number, z: number): number {
    const { dist, h } = this.gridAt(x, z);
    const hw = this.track.halfWidth;
    const far = Math.sin(x * 0.018) * Math.cos(z * 0.015) * 4 + Math.sin(x * 0.041 + z * 0.033) * 1.6 + 1;
    const f = smoothstep(hw + 6, hw + 55, Math.min(dist, 1e5));
    const nearH = dist > 1e8 ? 0 : h;
    return nearH - 0.35 + (far - nearH * 0.5 + 0.35) * f;
  }

  private buildGround() {
    const th = this.track.data.theme;
    const g = this.distGrid;
    const w = (g.nx - 1) * g.cell;
    const d = (g.nz - 1) * g.cell;
    const seg = Math.min(220, Math.ceil(Math.max(w, d) / 6));
    const geo = new THREE.PlaneGeometry(w, d, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(g.x0 + w / 2, 0, g.z0 + d / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const a = new THREE.Color(th.ground);
    const b = new THREE.Color(th.groundAlt);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.groundHeight(x, z));
      const n = (Math.sin(x * 0.07) * Math.cos(z * 0.06) + Math.sin(x * 0.19 + z * 0.13) * 0.5) * 0.5 + 0.5;
      c.copy(a).lerp(b, Math.max(0, Math.min(1, n)));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  private buildRibbon() {
    const t = this.track;
    const th = t.data.theme;
    const n = t.count;
    const hw = t.halfWidth + 0.6;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const idx: number[] = [];
    const p = { x: 0, y: 0, z: 0 };
    for (let i = 0; i <= n; i++) {
      const s = (i % n) * (t.length / n);
      for (let side = 0; side < 2; side++) {
        t.pointAt(s, side === 0 ? hw : -hw, p);
        const k = i * 2 + side;
        pos[k * 3] = p.x;
        pos[k * 3 + 1] = p.y + 0.03;
        pos[k * 3 + 2] = p.z;
        uv[k * 2] = side;
        uv[k * 2 + 1] = (i * t.length) / n / 8;
      }
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = dirtTexture(th.trackColor, th.trackEdge, 3);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  /** Gerades Band quer über die Strecke (für Start/Ziel und Matsch). */
  private crossStrip(s: number, depth: number, d0: number, d1: number, y: number, mat: THREE.Material) {
    const t = this.track;
    const geo = new THREE.BufferGeometry();
    const p = { x: 0, y: 0, z: 0 };
    const verts: number[] = [];
    const uvs: number[] = [];
    for (const [ds, dd, u, v] of [
      [-depth / 2, d0, 0, 0],
      [-depth / 2, d1, 1, 0],
      [depth / 2, d0, 0, 1],
      [depth / 2, d1, 1, 1],
    ]) {
      t.pointAt(s + ds, dd, p);
      verts.push(p.x, p.y + y, p.z);
      uvs.push(u, v);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  private buildStartFinish() {
    const t = this.track;
    const hw = t.halfWidth;
    const checker = new THREE.MeshLambertMaterial({ map: checkerTexture(12), side: THREE.DoubleSide });
    this.crossStrip(0, 2.2, -hw - 0.6, hw + 0.6, 0.05, checker);
    // Torbogen
    const arch = new THREE.Group();
    const poleCol = 0xffffff;
    arch.add(
      mesh([
        part(G.cyl(0.35, 0.4, 6.5, 8), poleCol, { pos: [hw + 1.2, 3.25, 0] }),
        part(G.cyl(0.35, 0.4, 6.5, 8), poleCol, { pos: [-hw - 1.2, 3.25, 0] }),
        part(G.ball(0.55, 1), 0xff7a1a, { pos: [hw + 1.2, 6.7, 0] }),
        part(G.ball(0.55, 1), 0xff7a1a, { pos: [-hw - 1.2, 6.7, 0] }),
      ]),
    );
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry((hw + 1.2) * 2, 1.6, 0.3),
      [
        new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
        new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
        new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
        new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
        new THREE.MeshLambertMaterial({ map: bannerTexture('ANIMALS RUN') }),
        new THREE.MeshLambertMaterial({ map: bannerTexture('ANIMALS RUN') }),
      ],
    );
    banner.position.set(0, 5.7, 0);
    banner.castShadow = true;
    arch.add(banner);
    const ap = t.pointAt(0, 0);
    arch.position.set(ap.x, ap.y, ap.z);
    this.alignAcross(arch, 0);
    this.group.add(arch);
  }

  /** Richtet ein Objekt so aus, dass seine x-Achse quer zur Strecke liegt (Links = −x … +x). */
  private alignAcross(obj: THREE.Object3D, s: number) {
    const h = this.track.headingAt(s);
    // Vorwärts (cos h, sin h) soll lokale +z werden
    obj.rotation.set(0, Math.PI / 2 - h, 0);
  }

  private buildFences() {
    const t = this.track;
    const th = t.data.theme;
    const spacing = 4;
    const n = Math.floor(t.length / spacing);
    const d = t.halfWidth + 0.75;
    const postGeo = new THREE.BoxGeometry(0.18, 1.2, 0.18);
    postGeo.translate(0, 0.6, 0);
    const railGeo = new THREE.BoxGeometry(0.08, 0.14, 1);
    const mat = new THREE.MeshLambertMaterial({ color: th.fence });
    const posts = new THREE.InstancedMesh(postGeo, mat, n * 2);
    const rails = new THREE.InstancedMesh(railGeo, mat, n * 4);
    const p = { x: 0, y: 0, z: 0 };
    const q = { x: 0, y: 0, z: 0 };
    let pi = 0;
    let ri = 0;
    for (const side of [1, -1]) {
      for (let i = 0; i < n; i++) {
        const s = i * spacing;
        // Lücke beim Start-Torbogen
        if (Math.abs(t.delta(0, s)) < 2) continue;
        t.pointAt(s, d * side, p);
        this.dummy.position.set(p.x, p.y - 0.1, p.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        posts.setMatrixAt(pi++, this.dummy.matrix);
        t.pointAt(s + spacing, d * side, q);
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        for (const y of [0.55, 0.95]) {
          this.dummy.position.set((p.x + q.x) / 2, (p.y + q.y) / 2 + y - 0.1, (p.z + q.z) / 2);
          this.dummy.rotation.set(Math.atan2(p.y - q.y, len), Math.atan2(q.x - p.x, q.z - p.z), 0, 'YXZ');
          this.dummy.scale.set(1, 1, len);
          this.dummy.updateMatrix();
          rails.setMatrixAt(ri++, this.dummy.matrix);
        }
      }
    }
    posts.count = pi;
    rails.count = ri;
    posts.castShadow = rails.castShadow = true;
    posts.receiveShadow = rails.receiveShadow = true;
    this.group.add(posts, rails);
  }

  private buildHurdles() {
    const t = this.track;
    const hw = t.halfWidth;
    const H = OBSTACLES.hurdleHeight;
    for (const h of t.data.hurdles) {
      const parts: THREE.BufferGeometry[] = [];
      // Ständer mit Flügeln an beiden Seiten
      for (const x of [-hw - 0.2, hw + 0.2]) {
        parts.push(part(G.box(0.25, H + 0.5, 0.25), 0xffffff, { pos: [x, (H + 0.5) / 2, 0] }));
        parts.push(part(G.box(0.12, H + 0.3, 1.2), 0x2b6cc4, { pos: [x + Math.sign(x) * 0.25, (H + 0.3) / 2, 0] }));
      }
      // Gestreifte Stangen (rot/weiss)
      const segs = Math.ceil(hw * 2);
      for (const y of [H * 0.45, H - 0.06]) {
        for (let i = 0; i < segs; i++) {
          const x0 = -hw + (i * hw * 2) / segs;
          parts.push(
            part(G.cyl(0.07, 0.07, (hw * 2) / segs, 6), i % 2 ? 0xffffff : 0xe23b2e, {
              pos: [x0 + hw / segs, y, 0],
              rot: [0, 0, Math.PI / 2],
            }),
          );
        }
      }
      // Blumenkästen davor
      for (let i = 0; i < 6; i++) {
        const x = -hw + 1.3 + i * ((hw * 2 - 2.6) / 5);
        parts.push(part(G.box(1.2, 0.25, 0.4), 0x7a4f2a, { pos: [x, 0.12, 0.6] }));
        parts.push(part(G.ball(0.22), i % 2 ? 0xffd23f : 0xff5d8f, { pos: [x - 0.3, 0.32, 0.6] }));
        parts.push(part(G.ball(0.22), i % 2 ? 0xff5d8f : 0xffffff, { pos: [x + 0.3, 0.32, 0.6] }));
      }
      const obj = mesh(parts);
      const s = h.s * t.length;
      const p = t.pointAt(s, 0);
      obj.position.set(p.x, p.y, p.z);
      this.alignAcross(obj, s);
      this.group.add(obj);
      this.hurdleObjs.push(obj);
    }
  }

  private buildBales(shadows: boolean) {
    const R = OBSTACLES.baleRadius;
    const geo = [
      part(G.cyl(R, R, OBSTACLES.baleHeight, 12), 0xe8c55a, { pos: [0, OBSTACLES.baleHeight / 2, 0] }),
      part(G.cyl(R * 0.75, R * 0.75, 0.02, 12), 0xc9a23e, { pos: [0, OBSTACLES.baleHeight + 0.01, 0] }),
      part(G.cyl(R + 0.02, R + 0.02, 0.12, 12), 0x9c6b2e, { pos: [0, OBSTACLES.baleHeight * 0.33, 0] }),
      part(G.cyl(R + 0.02, R + 0.02, 0.12, 12), 0x9c6b2e, { pos: [0, OBSTACLES.baleHeight * 0.7, 0] }),
    ];
    const proto = mesh(geo, shadows);
    for (const b of this.track.data.bales) {
      const m = proto.clone();
      const p = this.track.pointAt(b.s * this.track.length, b.d);
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = b.s * 40;
      this.group.add(m);
    }
  }

  private buildMud() {
    const t = this.track;
    const mat = new THREE.MeshPhongMaterial({ color: 0x5a3a1c, shininess: 60, specular: 0x6a5040 });
    for (const m of t.data.mud) {
      const s0 = m.s * t.length - m.length / 2;
      const steps = Math.max(6, Math.round(m.length / 1.5));
      const verts: number[] = [];
      const idx: number[] = [];
      const p = { x: 0, y: 0, z: 0 };
      const rnd = mulberry32(Math.round(s0));
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const e = Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)) * (0.8 + rnd() * 0.25);
        const half = (m.width / 2) * Math.max(0.15, e);
        for (const side of [-1, 1]) {
          t.pointAt(s0 + f * m.length, m.d + side * half, p);
          verts.push(p.x, p.y + 0.06, p.z);
        }
        if (i < steps) {
          const a = i * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mm = new THREE.Mesh(geo, mat);
      mm.receiveShadow = true;
      this.group.add(mm);
    }
  }

  private buildBolts() {
    const shape = new THREE.Shape();
    const pts: [number, number][] = [
      [0.15, 0.75],
      [-0.35, -0.05],
      [-0.02, -0.05],
      [-0.2, -0.75],
      [0.38, 0.12],
      [0.05, 0.12],
      [0.28, 0.75],
    ];
    shape.moveTo(...pts[0]);
    for (const p of pts.slice(1)) shape.lineTo(...p);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
    geo.center();
    const count = Math.max(1, this.sim?.bolts.length ?? 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffd31a, emissive: 0xffa800, emissiveIntensity: 0.6 });
    const boltMesh = new THREE.InstancedMesh(geo, mat, count);
    boltMesh.castShadow = true;
    const glowGeo = new THREE.CircleGeometry(ENERGY.boltRadius * 0.8, 16);
    glowGeo.rotateX(-Math.PI / 2);
    const glow = new THREE.InstancedMesh(
      glowGeo,
      new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.45, depthWrite: false }),
      count,
    );
    this.group.add(boltMesh, glow);
    return { mesh: boltMesh, glow };
  }

  private buildLandmarks() {
    const t = this.track;
    for (const l of t.data.landmarks) {
      const lm = buildLandmark(l.type);
      const s = l.s * t.length;
      const p = t.pointAt(s, l.d);
      lm.object.position.set(p.x, this.groundHeight(p.x, p.z), p.z);
      // Vorderseite (+z) zur Strecke drehen
      const h = t.headingAt(s);
      const toTrack = l.d > 0 ? h + Math.PI / 2 : h - Math.PI / 2; // Richtung (cos, sin) zur Mitte
      lm.object.rotation.y = Math.PI / 2 - toTrack + ((l.rot ?? 0) * Math.PI) / 180;
      lm.object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.group.add(lm.object);
      this.landmarks.push(lm);
      this.occupied.push({ x: p.x, z: p.z, r: lm.radius });
    }
  }

  private isFree(x: number, z: number, r: number): boolean {
    for (const o of this.occupied) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2) return false;
    return true;
  }

  private buildDecor(density: number, shadows: boolean) {
    const t = this.track;
    const dec = t.data.decor;
    const rnd = mulberry32(dec.seed);
    const g = this.distGrid;
    const w = (g.nx - 1) * g.cell;
    const d = (g.nz - 1) * g.cell;
    const hw = t.halfWidth;
    const randomSpot = (minDist: number, maxDist: number, r: number) => {
      for (let k = 0; k < 40; k++) {
        const x = g.x0 + rnd() * w;
        const z = g.z0 + rnd() * d;
        const { dist } = this.gridAt(x, z);
        if (dist < minDist || dist > maxDist) continue;
        if (!this.isFree(x, z, r)) continue;
        return { x, z };
      }
      return null;
    };

    // Bäume: Stamm + Krone (zwei Instanced-Meshes)
    const nTrees = Math.round(dec.trees * density);
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 6);
    trunkGeo.translate(0, 1.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(2.2, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5230, flatShading: true }), nTrees);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), nTrees * 2);
    let ci = 0;
    let ti = 0;
    const blossom = [0x4f9d2f, 0x5fb03a, 0x3f8a2a, 0x6cbf45, 0xf7c6d9, 0x4a922c];
    for (let i = 0; i < nTrees; i++) {
      const spot = randomSpot(hw + 9, 230, 2.5);
      if (!spot) continue;
      const y = this.groundHeight(spot.x, spot.z);
      const sc = 0.8 + rnd() * 0.7;
      this.dummy.position.set(spot.x, y - 0.1, spot.z);
      this.dummy.rotation.set(0, rnd() * 6, 0);
      this.dummy.scale.set(sc, sc, sc);
      this.dummy.updateMatrix();
      trunks.setMatrixAt(ti++, this.dummy.matrix);
      const col = blossom[Math.floor(rnd() * blossom.length)];
      for (let k = 0; k < 2; k++) {
        this.dummy.position.set(spot.x + (rnd() - 0.5) * sc, y + (3.2 + k * 1.4) * sc, spot.z + (rnd() - 0.5) * sc);
        const cs = sc * (k === 0 ? 1 : 0.7);
        this.dummy.scale.set(cs, cs * 0.9, cs);
        this.dummy.rotation.set(rnd(), rnd() * 6, 0);
        this.dummy.updateMatrix();
        crowns.setMatrixAt(ci, this.dummy.matrix);
        crowns.setColorAt(ci++, vary(col, 0.12, rnd));
      }
      this.occupied.push({ x: spot.x, z: spot.z, r: 2.5 });
    }
    trunks.count = ti;
    crowns.count = ci;
    trunks.castShadow = crowns.castShadow = shadows;
    this.group.add(trunks, crowns);

    // Büsche
    const nBush = Math.round(dec.bushes * density);
    const bushes = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), nBush);
    let bi = 0;
    for (let i = 0; i < nBush; i++) {
      const spot = randomSpot(hw + 3, 120, 1.2);
      if (!spot) continue;
      const sc = 0.6 + rnd() * 0.8;
      this.dummy.position.set(spot.x, this.groundHeight(spot.x, spot.z) + sc * 0.4, spot.z);
      this.dummy.scale.set(sc * 1.3, sc, sc * 1.3);
      this.dummy.rotation.set(0, rnd() * 6, 0);
      this.dummy.updateMatrix();
      bushes.setMatrixAt(bi, this.dummy.matrix);
      bushes.setColorAt(bi++, vary(0x4f9a35, 0.15, rnd));
    }
    bushes.count = bi;
    bushes.castShadow = shadows;
    this.group.add(bushes);

    // Blumen
    const nFlow = Math.round(dec.flowers * density);
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), nFlow);
    const fcols = [0xff5d8f, 0xffd23f, 0xffffff, 0xb27dff, 0xff8c42];
    let fi = 0;
    for (let i = 0; i < nFlow; i++) {
      const spot = randomSpot(hw + 1.5, 60, 0.2);
      if (!spot) continue;
      this.dummy.position.set(spot.x, this.groundHeight(spot.x, spot.z) + 0.3, spot.z);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      flowers.setMatrixAt(fi, this.dummy.matrix);
      flowers.setColorAt(fi++, new THREE.Color(fcols[Math.floor(rnd() * fcols.length)]));
    }
    flowers.count = fi;
    this.group.add(flowers);

    // Hühner am Streckenrand
    const chickenProto = mesh(chickenGeometry(), shadows);
    for (let i = 0; i < dec.chickens; i++) {
      const s = rnd() * t.length;
      const side = rnd() < 0.5 ? -1 : 1;
      const p = t.pointAt(s, side * (hw + 2.5 + rnd() * 5));
      const c = chickenProto.clone();
      const y = this.groundHeight(p.x, p.z);
      c.position.set(p.x, y, p.z);
      c.rotation.y = rnd() * Math.PI * 2;
      this.group.add(c);
      this.chickens.push({ obj: c, phase: rnd() * 10, baseX: p.x, baseZ: p.z, baseY: y });
    }
  }

  private buildHills() {
    const t = this.track.data;
    const rnd = mulberry32(t.decor.seed + 99);
    const cx = (this.bounds.minX + this.bounds.maxX) / 2;
    const cz = (this.bounds.minZ + this.bounds.maxZ) / 2;
    const rad = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ) / 2 + 330;
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < t.decor.hills; i++) {
      const a = (i / t.decor.hills) * Math.PI * 2 + rnd() * 0.3;
      const r = rad + rnd() * 120;
      const s = 70 + rnd() * 90;
      parts.push(
        part(new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? t.theme.groundAlt : t.theme.ground, {
          pos: [cx + Math.cos(a) * r, -8, cz + Math.sin(a) * r],
          scale: [s * 1.6, s * (0.45 + rnd() * 0.4), s],
          rot: [0, rnd() * 3, 0],
        }),
      );
    }
    this.group.add(mesh(parts, false));
  }

  /** Pro Frame: Blitze drehen, Hürden wackeln, Hühner picken. */
  update(time: number, raceTime: number) {
    const sim = this.sim;
    if (sim) {
      const p = { x: 0, y: 0, z: 0 };
      sim.bolts.forEach((b, i) => {
        // Kurz vor dem Wiedererscheinen wächst der Blitz
        const scale = b.timer <= 0 ? 1 : Math.max(0, 1 - b.timer / 0.3);
        this.track.pointAt(b.s, b.d, p);
        this.dummy.position.set(p.x, p.y + 1.2 + Math.sin(time * 3 + i) * 0.15, p.z);
        this.dummy.rotation.set(0, time * 2.5 + i, 0);
        this.dummy.scale.setScalar(scale * 1.25);
        this.dummy.updateMatrix();
        this.boltMesh.setMatrixAt(i, this.dummy.matrix);
        this.dummy.position.set(p.x, p.y + 0.08, p.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(scale * (0.9 + Math.sin(time * 5 + i) * 0.1));
        this.dummy.updateMatrix();
        this.boltGlow.setMatrixAt(i, this.dummy.matrix);
      });
      this.boltMesh.instanceMatrix.needsUpdate = true;
      this.boltGlow.instanceMatrix.needsUpdate = true;
      // Angestossene Hürden wackeln kurz
      this.hurdleObjs.forEach((o, i) => {
        const since = raceTime - sim.hurdleHit[i];
        const s = this.track.data.hurdles[i].s * this.track.length;
        this.alignAcross(o, s);
        if (since >= 0 && since < 0.8) o.rotation.x = Math.sin(since * 30) * 0.12 * (1 - since / 0.8);
      });
    }
    for (const l of this.landmarks) l.update?.(time);
    for (const c of this.chickens) {
      const k = time + c.phase;
      const peck = Math.max(0, Math.sin(k * 3)) ** 4;
      c.obj.rotation.x = peck * 0.7;
      c.obj.position.y = c.baseY + Math.max(0, Math.sin(k * 1.3)) ** 20 * 0.25;
    }
  }

  get center(): THREE.Vector3 {
    return new THREE.Vector3((this.bounds.minX + this.bounds.maxX) / 2, 0, (this.bounds.minZ + this.bounds.maxZ) / 2);
  }

  get size(): number {
    return Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          if (mat === vcMaterial()) continue;
          (mat as THREE.MeshLambertMaterial).map?.dispose();
          mat.dispose();
        }
      }
    });
  }
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
