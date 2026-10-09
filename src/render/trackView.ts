/**
 * Baut die 3D-Szene einer Strecke aus den Streckendaten: Gelände, Laufbahn, Zäune, Start/Ziel,
 * Streckenelemente (siehe trackElements.ts), Blitze, Wahrzeichen, Umgebung je Stil und Hügel.
 * Wiederholte Objekte nutzen Instancing (ein Draw-Call für viele Bäume/Zaunpfosten).
 */
import * as THREE from 'three';
import { ENERGY, VIEW } from '../config/balance';
import { Elements } from '../game/elements';
import { mulberry32 } from '../game/rng';
import type { RaceSim } from '../game/simulation';
import type { Track } from '../game/track';
import { critterMesh, snowCaps, STYLES, treeGeometries, type StyleDef } from './decor';
import { G, mesh, part, vary } from './geo';
import { buildLandmark, type Landmark } from './landmarks';
import { bannerTexture, checkerTexture, dirtTexture } from './textures';
import { ElementsView } from './trackElements';

export type Quality = 'hoch' | 'mittel' | 'niedrig';

interface Critter {
  obj: THREE.Object3D;
  phase: number;
  baseY: number;
}

export class TrackView {
  readonly group = new THREE.Group();
  private readonly boltMesh: THREE.InstancedMesh;
  private readonly boltGlow: THREE.InstancedMesh;
  private readonly landmarks: Landmark[] = [];
  private readonly critters: Critter[] = [];
  private readonly occupied: { x: number; z: number; r: number }[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  private readonly el: Elements;
  private readonly elementsView: ElementsView;
  private readonly style: StyleDef;
  /** Grobes Raster: Abstand zur Strecke je Gitterzelle (für Gelände und Platzierung der Deko). */
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
    this.el = sim ? sim.el : new Elements(t, t.data);
    this.style = STYLES[t.data.decor.style];
    const shadows = quality !== 'niedrig';
    this.buildDistGrid();
    this.buildGround();
    this.buildRibbon();
    this.buildStartFinish();
    this.buildFences();
    this.elementsView = new ElementsView(t, this.el, sim ? sim.hurdleHit : null, shadows);
    this.group.add(this.elementsView.group);
    const bolts = this.buildBolts();
    this.boltMesh = bolts.mesh;
    this.boltGlow = bolts.glow;
    // Abkürzungen und Wahrzeichen von Deko freihalten
    for (const sc of this.el.shortcuts) for (let i = 0; i < sc.px.length; i += 2) this.occupied.push({ x: sc.px[i], z: sc.pz[i], r: 4 });
    this.buildLandmarks();
    this.buildDecor(VIEW.decorDensity[quality], shadows);
    this.buildHills();
  }

  /** Abstand zur Mittellinie (bzw. zu Abkürzungswegen) und Bodenhöhe auf einem 4-m-Raster. */
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
    const reach = 60;
    const rc = Math.ceil(reach / cell);
    const stamp = (px: number, pz: number, py: number, offset: number) => {
      const cx = Math.round((px - x0) / cell);
      const cz = Math.round((pz - z0) / cell);
      for (let dz = -rc; dz <= rc; dz++)
        for (let dx = -rc; dx <= rc; dx++) {
          const gx = cx + dx;
          const gz = cz + dz;
          if (gx < 0 || gz < 0 || gx >= nx || gz >= nz) continue;
          const d = Math.hypot(x0 + gx * cell - px, z0 + gz * cell - pz) + offset;
          const k = gz * nx + gx;
          if (d < dist[k]) {
            dist[k] = d;
            h[k] = py;
          }
        }
    };
    for (let i = 0; i < t.count; i += 2) stamp(t.px[i], t.pz[i], t.py[i], 0);
    // Abkürzungswege: Gelände dort auch flach halten (etwas schmaler als die Bahn)
    for (const sc of this.el.shortcuts) {
      for (let i = 0; i < sc.px.length; i++) stamp(sc.px[i], sc.pz[i], t.heightAt(sc.fromS + (sc.cum[i] / sc.length) * sc.skip), t.halfWidth - 3);
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
    const rough = this.track.data.decor.style === 'alpen' ? 2.2 : this.track.data.decor.style === 'strand' ? 0.4 : 1;
    const far = (Math.sin(x * 0.018) * Math.cos(z * 0.015) * 4 + Math.sin(x * 0.041 + z * 0.033) * 1.6 + 1) * rough;
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

  /** Gerades Band quer über die Strecke (für Start/Ziel). */
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
    arch.add(
      mesh([
        part(G.cyl(0.35, 0.4, 6.5, 8), 0xffffff, { pos: [hw + 1.2, 3.25, 0] }),
        part(G.cyl(0.35, 0.4, 6.5, 8), 0xffffff, { pos: [-hw - 1.2, 3.25, 0] }),
        part(G.ball(0.55, 1), 0xff7a1a, { pos: [hw + 1.2, 6.7, 0] }),
        part(G.ball(0.55, 1), 0xff7a1a, { pos: [-hw - 1.2, 6.7, 0] }),
      ]),
    );
    const side = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
    const front = new THREE.MeshLambertMaterial({ map: bannerTexture('ANIMALS RUN') });
    const banner = new THREE.Mesh(new THREE.BoxGeometry((hw + 1.2) * 2, 1.6, 0.3), [side, side, side, side, front, front]);
    banner.position.set(0, 5.7, 0);
    banner.castShadow = true;
    arch.add(banner);
    const ap = t.pointAt(0, 0);
    arch.position.set(ap.x, ap.y, ap.z);
    arch.rotation.set(0, Math.PI / 2 - t.headingAt(0), 0);
    this.group.add(arch);
  }

  /** Ist an dieser Stelle (Seite) eine Lücke im Zaun nötig? */
  private fenceGap(s: number, side: number): boolean {
    const t = this.track;
    if (Math.abs(t.delta(0, s)) < 2) return true;
    for (const sc of this.el.shortcuts) {
      if (sc.def.side !== side) continue;
      const a = t.delta(sc.fromS, s);
      const b = t.delta(sc.toS, s);
      if ((a > -7 && a < 7) || (b > -7 && b < 7)) return true;
    }
    for (const b of this.el.data.bridges ?? []) {
      const rel = t.delta(b.s * t.length - b.length / 2 - 2, s);
      if (rel >= 0 && rel <= b.length + 4) return true;
    }
    for (const z of this.el.zones) {
      if (z.type !== 'tiefwasser' && z.type !== 'lava') continue;
      const rel = t.delta(z.s, s);
      if (rel >= -1 && rel <= z.length + 1) return true;
    }
    return false;
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
        if (this.fenceGap(s, side) || this.fenceGap(s + spacing, side)) continue;
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
    const glow = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.45, depthWrite: false }), count);
    if (!this.sim) boltMesh.count = glow.count = 0;
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
      if (l.scale) lm.object.scale.setScalar(l.scale);
      // Vorderseite (+z) zur Strecke drehen
      const h = t.headingAt(s);
      const toTrack = l.d > 0 ? h + Math.PI / 2 : h - Math.PI / 2;
      lm.object.rotation.y = Math.PI / 2 - toTrack + ((l.rot ?? 0) * Math.PI) / 180;
      lm.object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = lm.radius < 30;
          o.receiveShadow = true;
        }
      });
      this.group.add(lm.object);
      this.landmarks.push(lm);
      this.occupied.push({ x: p.x, z: p.z, r: lm.radius * (l.scale ?? 1) });
    }
  }

  private isFree(x: number, z: number, r: number): boolean {
    for (const o of this.occupied) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2) return false;
    return true;
  }

  private buildDecor(density: number, shadows: boolean) {
    const t = this.track;
    const dec = t.data.decor;
    const style = this.style;
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

    // Bäume (bzw. Palmen, Tannen, Kakteen …): Stamm + eingefärbte Krone
    const nTrees = Math.round(dec.trees * density);
    const tg = treeGeometries(style);
    const trunkMat = tg.crownColored
      ? new THREE.MeshLambertMaterial({ color: style.trunk, flatShading: true })
      : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const trunks = new THREE.InstancedMesh(tg.trunk, trunkMat, nTrees);
    const crowns = tg.crownColored ? new THREE.InstancedMesh(tg.crown, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), nTrees) : null;
    const snow = style.tree === 'tanne' ? new THREE.InstancedMesh(snowCaps(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), nTrees) : null;
    let ti = 0;
    for (let i = 0; i < nTrees; i++) {
      const spot = randomSpot(hw + 9, 230, 2.5);
      if (!spot) continue;
      const y = this.groundHeight(spot.x, spot.z);
      const sc = 0.8 + rnd() * 0.7;
      this.dummy.position.set(spot.x, y - 0.1, spot.z);
      this.dummy.rotation.set(0, rnd() * 6, 0);
      this.dummy.scale.set(sc, sc * (0.9 + rnd() * 0.3), sc);
      this.dummy.updateMatrix();
      trunks.setMatrixAt(ti, this.dummy.matrix);
      if (crowns) {
        crowns.setMatrixAt(ti, this.dummy.matrix);
        crowns.setColorAt(ti, vary(style.crown[Math.floor(rnd() * style.crown.length)], 0.12, rnd));
      }
      snow?.setMatrixAt(ti, this.dummy.matrix);
      ti++;
      this.occupied.push({ x: spot.x, z: spot.z, r: 2.5 });
    }
    trunks.count = ti;
    trunks.castShadow = shadows;
    this.group.add(trunks);
    if (crowns) {
      crowns.count = ti;
      crowns.castShadow = shadows;
      this.group.add(crowns);
    }
    if (snow) {
      snow.count = ti;
      this.group.add(snow);
    }

    // Felsen
    const nRocks = Math.round(style.rocks * density);
    if (nRocks > 0) {
      const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), nRocks);
      let k = 0;
      for (let i = 0; i < nRocks; i++) {
        const spot = randomSpot(hw + 4, 200, 1.5);
        if (!spot) continue;
        const sc = 0.5 + rnd() * 2.2;
        this.dummy.position.set(spot.x, this.groundHeight(spot.x, spot.z) + sc * 0.2, spot.z);
        this.dummy.scale.set(sc * (1 + rnd() * 0.5), sc * (0.6 + rnd() * 0.5), sc);
        this.dummy.rotation.set(rnd(), rnd() * 6, rnd());
        this.dummy.updateMatrix();
        rocks.setMatrixAt(k, this.dummy.matrix);
        rocks.setColorAt(k++, vary(style.rockColor, 0.1, rnd));
      }
      rocks.count = k;
      rocks.castShadow = shadows;
      this.group.add(rocks);
    }

    // Büsche
    const nBush = Math.round(dec.bushes * density);
    const bushes = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, nBush));
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
      bushes.setColorAt(bi++, vary(style.bush, 0.15, rnd));
    }
    bushes.count = bi;
    bushes.castShadow = shadows;
    this.group.add(bushes);

    // Blumen
    const nFlow = Math.round(dec.flowers * density);
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, nFlow));
    let fi = 0;
    for (let i = 0; i < nFlow; i++) {
      const spot = randomSpot(hw + 1.5, 60, 0.2);
      if (!spot) continue;
      this.dummy.position.set(spot.x, this.groundHeight(spot.x, spot.z) + 0.3, spot.z);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      flowers.setMatrixAt(fi, this.dummy.matrix);
      flowers.setColorAt(fi++, new THREE.Color(style.flowers[Math.floor(rnd() * style.flowers.length)]));
    }
    flowers.count = fi;
    this.group.add(flowers);

    // Kleine Tiere am Streckenrand
    const proto = critterMesh(style.critter, shadows);
    if (proto) {
      for (let i = 0; i < dec.critters; i++) {
        const s = rnd() * t.length;
        const side = rnd() < 0.5 ? -1 : 1;
        if (this.fenceGap(s, side)) continue;
        const p = t.pointAt(s, side * (hw + 2.5 + rnd() * 5));
        const c = proto.clone();
        const y = this.groundHeight(p.x, p.z);
        c.position.set(p.x, y, p.z);
        c.rotation.y = rnd() * Math.PI * 2;
        this.group.add(c);
        this.critters.push({ obj: c, phase: rnd() * 10, baseY: y });
      }
    }
  }

  private buildHills() {
    const t = this.track.data;
    const rnd = mulberry32(t.decor.seed + 99);
    const cx = (this.bounds.minX + this.bounds.maxX) / 2;
    const cz = (this.bounds.minZ + this.bounds.maxZ) / 2;
    const rad = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ) / 2 + 330;
    const alps = t.decor.style === 'alpen';
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < t.decor.hills; i++) {
      const a = (i / t.decor.hills) * Math.PI * 2 + rnd() * 0.3;
      const r = rad + rnd() * 120;
      const s = 70 + rnd() * 90;
      if (alps) {
        // Berge mit Schneekappen
        const h = s * (1.2 + rnd() * 0.8);
        parts.push(part(G.cone(s, h, 6), t.theme.groundAlt, { pos: [cx + Math.cos(a) * r, h / 2 - 8, cz + Math.sin(a) * r], rot: [0, rnd() * 3, 0] }));
        parts.push(part(G.cone(s * 0.38, h * 0.38, 6), 0xffffff, { pos: [cx + Math.cos(a) * r, h - 8 - h * 0.19 + 0.5, cz + Math.sin(a) * r], rot: [0, rnd() * 3, 0] }));
      } else {
        parts.push(
          part(new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? t.theme.groundAlt : t.theme.ground, {
            pos: [cx + Math.cos(a) * r, -8, cz + Math.sin(a) * r],
            scale: [s * 1.6, s * (0.45 + rnd() * 0.4), s],
            rot: [0, rnd() * 3, 0],
          }),
        );
      }
    }
    this.group.add(mesh(parts, false));
  }

  /** Pro Frame: Blitze drehen, Elemente bewegen, Tiere am Rand bewegen. */
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
    }
    this.elementsView.update(time, raceTime, sim ? sim.leaderLap : 1);
    for (const l of this.landmarks) l.update?.(time);
    for (const c of this.critters) {
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
