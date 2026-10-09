/**
 * Renn-Simulation: rechnet das Rennen verbindlich mit fester Rate (SIM_HZ).
 * Kennt weder Darstellung noch Eingabegeräte – jedes Tier bekommt pro Schritt ein Input-Objekt.
 */
import { BODY_RADIUS, ENERGY, OBSTACLES, PHYSICS, RACE, SIM_DT, STAT_SCALE, AI } from '../config/balance';
import { getAnimal, SPECIES_STATS, type Species } from '../animals/animals';
import type { TrackData } from '../tracks/types';
import { Track, wrapAngle } from './track';
import type { AnimalState, Bale, Bolt, Entrant, Input, RacePhase, ResultRow, SimEvent } from './types';

export interface DerivedStats {
  species: Species;
  topSpeed: number;
  accel: number;
  jumpVelocity: number;
  swimFactor: number;
  turnRate: number;
  grip: number;
  radius: number;
}

export function deriveStats(animalId: string): DerivedStats {
  const def = getAnimal(animalId);
  const b = SPECIES_STATS[def.species];
  return {
    species: def.species,
    topSpeed: STAT_SCALE.topSpeed[b.tempo],
    accel: STAT_SCALE.accel[b.beschleunigung],
    jumpVelocity: STAT_SCALE.jumpVelocity[b.sprung],
    swimFactor: STAT_SCALE.swimFactor[b.schwimmen],
    turnRate: STAT_SCALE.turnRate[b.wendigkeit],
    grip: STAT_SCALE.grip[b.wendigkeit],
    radius: BODY_RADIUS[def.species],
  };
}

interface MudZone {
  s: number;
  length: number;
  d0: number;
  d1: number;
}

export class RaceSim {
  readonly track: Track;
  readonly laps: number;
  readonly animals: AnimalState[] = [];
  readonly stats: DerivedStats[] = [];
  readonly bolts: Bolt[] = [];
  readonly bales: Bale[] = [];
  readonly hurdles: number[] = [];
  readonly mud: MudZone[] = [];
  readonly events: SimEvent[] = [];
  /** Zuletzt angestossene Hürde je Index (für Wackel-Animation), Zeitpunkt in Sekunden. */
  readonly hurdleHit: number[] = [];
  phase: RacePhase = 'countdown';
  /** Rennzeit in Sekunden; negativ während des Countdowns. */
  time = -RACE.countdownSeconds;
  tick = 0;
  private doneTimer = -1;
  private readonly cpSpacing: number;

  constructor(trackData: TrackData | Track, entrants: Entrant[], laps = RACE.laps) {
    this.track = trackData instanceof Track ? trackData : new Track(trackData);
    this.laps = laps;
    const t = this.track;
    const L = t.length;
    this.cpSpacing = L / RACE.checkpointsPerLap;

    for (const h of t.data.hurdles) this.hurdles.push(h.s * L);
    this.hurdleHit.length = this.hurdles.length;
    this.hurdleHit.fill(-99);
    for (const b of t.data.bales) {
      const p = t.pointAt(b.s * L, b.d);
      this.bales.push({ x: p.x, z: p.z, s: b.s * L, d: b.d });
    }
    for (const m of t.data.mud) {
      this.mud.push({ s: m.s * L - m.length / 2, length: m.length, d0: m.d - m.width / 2, d1: m.d + m.width / 2 });
    }
    for (const st of t.data.bolts) {
      for (const d of st.ds) {
        const p = t.pointAt(st.s * L, d);
        this.bolts.push({ x: p.x, z: p.z, s: st.s * L, d, timer: 0 });
      }
    }

    // Startaufstellung: Menschen auf den konfigurierten Platz, Rest auffüllen.
    const order = arrangeGrid(entrants);
    order.forEach((e, gridIndex) => {
      const row = Math.floor(gridIndex / 2);
      const left = gridIndex % 2 === 0;
      const s = -RACE.gridFirstRowBehind - row * RACE.gridRowSpacing - (left ? 0 : RACE.gridRowSpacing / 2);
      const d = left ? RACE.gridLateral : -RACE.gridLateral;
      const p = t.pointAt(s, d);
      const heading = t.headingAt(s);
      const proj = t.project(p.x, p.z);
      const a: AnimalState = {
        id: gridIndex,
        animalId: e.animalId,
        human: e.human,
        aiLevel: e.aiLevel,
        x: p.x,
        z: p.z,
        alt: 0,
        vy: 0,
        heading,
        speed: 0,
        grounded: true,
        prevX: p.x,
        prevZ: p.z,
        prevAlt: 0,
        prevHeading: heading,
        idx: proj.idx,
        s: proj.s,
        d: proj.d,
        totalDist: s,
        cpPassed: 0,
        lap: 1,
        lapStart: 0,
        bestLap: Infinity,
        finished: false,
        finishTime: 0,
        place: gridIndex + 1,
        energy: ENERGY.max,
        stumble: 0,
        respawn: 0,
        jumpHeld: false,
        inMud: false,
        stride: gridIndex * 1.7,
      };
      this.animals.push(a);
      this.stats.push(deriveStats(e.animalId));
    });
  }

  /** Ein Simulationsschritt. `inputs[i]` gehört zu `animals[i]`. */
  step(inputs: Input[]) {
    const dt = SIM_DT;
    const prevTime = this.time;
    this.time += dt;
    this.tick++;

    if (this.phase === 'countdown') {
      const before = Math.ceil(-prevTime);
      const after = Math.ceil(-this.time);
      if (after !== before && after > 0) this.events.push({ type: 'countdown', animal: -1, value: after });
      if (this.time >= 0) {
        this.phase = 'running';
        this.time = 0;
        this.events.push({ type: 'go', animal: -1 });
      }
    }
    const racing = this.phase !== 'countdown';

    for (const b of this.bolts) if (b.timer > 0) b.timer = Math.max(0, b.timer - dt);

    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      a.prevX = a.x;
      a.prevZ = a.z;
      a.prevAlt = a.alt;
      a.prevHeading = a.heading;
      if (racing) this.stepAnimal(a, this.stats[i], inputs[i], dt);
    }
    if (racing) {
      this.collideAnimals();
      this.updatePlaces();
      this.checkDone(dt);
    }
  }

  private stepAnimal(a: AnimalState, st: DerivedStats, inp: Input, dt: number) {
    const t = this.track;

    if (a.respawn > 0) {
      a.respawn -= dt;
      if (a.respawn <= 0) this.respawnAt(a);
      return;
    }

    // Untergrund und Energie bestimmen das erlaubte Tempo
    a.inMud = this.inMud(a.s, a.d);
    const surface = a.inMud ? OBSTACLES.mudFactor : 1;
    const energyFactor =
      a.energy >= ENERGY.slowThreshold
        ? 1
        : ENERGY.emptySpeedFactor + (1 - ENERGY.emptySpeedFactor) * (a.energy / ENERGY.slowThreshold);
    const aiFactor = a.human ? 1 : AI.levels[a.aiLevel].speedFactor;
    const maxSpeed = st.topSpeed * surface * energyFactor * aiFactor;

    if (a.stumble > 0) a.stumble = Math.max(0, a.stumble - dt);

    // Längsbewegung
    if (a.grounded) {
      if (a.speed > maxSpeed) {
        a.speed = Math.max(maxSpeed, a.speed - PHYSICS.overSpeedDecel * dt);
      } else if (inp.vorwaerts && a.stumble <= 0) {
        a.speed = Math.min(maxSpeed, a.speed + st.accel * dt);
      } else {
        a.speed = Math.max(0, a.speed - PHYSICS.coastDecel * dt);
      }
    }

    // Lenken
    const steer = (inp.rechts ? 1 : 0) - (inp.links ? 1 : 0);
    if (steer !== 0) {
      let w = Math.min(st.turnRate, st.grip / Math.max(0.1, a.speed));
      if (!a.grounded) w *= PHYSICS.airSteer;
      if (a.stumble > 0) w *= 0.5;
      a.heading = wrapAngle(a.heading + steer * w * dt);
    }

    // Springen (nur beim Drücken, nicht beim Halten)
    if (inp.springen && !a.jumpHeld && a.grounded && a.stumble <= 0) {
      a.vy = st.jumpVelocity;
      a.grounded = false;
      this.events.push({ type: 'jump', animal: a.id });
    }
    a.jumpHeld = inp.springen;

    // Bewegen
    a.x += Math.cos(a.heading) * a.speed * dt;
    a.z += Math.sin(a.heading) * a.speed * dt;
    if (!a.grounded) {
      a.vy -= PHYSICS.gravity * dt;
      a.alt += a.vy * dt;
      if (a.alt <= 0) {
        a.alt = 0;
        a.vy = 0;
        a.grounded = true;
        this.events.push({ type: 'land', animal: a.id });
      }
    }

    // Auf Strecke projizieren
    const prevS = a.s;
    const proj = t.project(a.x, a.z, a.idx);
    a.idx = proj.idx;
    a.s = proj.s;
    a.d = proj.d;

    // Bande (Zaun): zurückschieben, Richtung entlang der Strecke drehen, Tempo verlieren
    const limit = t.halfWidth - st.radius - PHYSICS.wallMargin;
    if (Math.abs(a.d) > limit) {
      const side = Math.sign(a.d);
      const push = Math.abs(a.d) - limit;
      const nx = t.tz[a.idx];
      const nz = -t.tx[a.idx];
      a.x -= nx * push * side;
      a.z -= nz * push * side;
      a.d = side * limit;
      const trackHeading = Math.atan2(t.tz[a.idx], t.tx[a.idx]);
      const rel = wrapAngle(a.heading - trackHeading);
      // Läuft das Tier in die Bande hinein? Dann sanft entlang lenken.
      if (Math.sign(-rel) === side && Math.abs(rel) < Math.PI / 2) {
        a.heading = wrapAngle(trackHeading + rel * 0.85);
      }
      a.speed *= 1 - PHYSICS.wallScrapeLoss * dt * Math.min(1, Math.abs(rel) * 3);
    }

    // Distanz und Kontrollpunkte
    const ds = t.delta(prevS, a.s);
    if (Math.abs(ds) < 20) a.totalDist += ds;
    this.updateCheckpoints(a);

    // Energie
    let drain = ENERGY.drainPerSecond * Math.min(1, a.speed / st.topSpeed);
    if (t.slope[a.idx] > ENERGY.uphillSlope) drain *= ENERGY.uphillFactor;
    a.energy = Math.max(0, a.energy - drain * dt);

    this.hitObstacles(a, st, prevS);
    this.collectBolts(a);

    a.stride += a.speed * dt * (st.species === 'pferd' ? 0.9 : 1.4);
  }

  private hitObstacles(a: AnimalState, st: DerivedStats, prevS: number) {
    const t = this.track;
    // Hürden: Beim Überqueren muss das Tier hoch genug sein
    for (let h = 0; h < this.hurdles.length; h++) {
      const hs = this.hurdles[h];
      const before = t.delta(hs, prevS);
      const after = t.delta(hs, a.s);
      if (before < 0 && after >= 0 && after - before < 5) {
        if (a.alt < OBSTACLES.hurdleHeight) {
          a.speed *= OBSTACLES.hurdleSpeedKeep;
          a.stumble = OBSTACLES.hurdleStumble;
          this.hurdleHit[h] = this.time;
          this.events.push({ type: 'stumble', animal: a.id });
        }
      }
    }
    // Heuballen: rund, man kann darüber springen
    for (const b of this.bales) {
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const r = OBSTACLES.baleRadius + st.radius;
      const dd = dx * dx + dz * dz;
      if (dd < r * r && a.alt < OBSTACLES.baleHeight) {
        const dist = Math.sqrt(dd) || 0.01;
        const nx = dx / dist;
        const nz = dz / dist;
        a.x = b.x + nx * r;
        a.z = b.z + nz * r;
        // Richtung tangential zum Ballen drehen, damit das Tier nicht hängen bleibt
        const fx = Math.cos(a.heading);
        const fz = Math.sin(a.heading);
        const into = fx * nx + fz * nz;
        if (into < 0) {
          const tx = fx - nx * into * 1.1;
          const tz = fz - nz * into * 1.1;
          a.heading = Math.atan2(tz, tx);
        }
        if (a.stumble <= 0) {
          a.speed *= OBSTACLES.baleSpeedKeep;
          a.stumble = OBSTACLES.baleStumble;
          this.events.push({ type: 'stumble', animal: a.id });
        }
      }
    }
  }

  private collectBolts(a: AnimalState) {
    for (const b of this.bolts) {
      if (b.timer > 0) continue;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      if (dx * dx + dz * dz < ENERGY.boltRadius * ENERGY.boltRadius && a.alt < 2.5) {
        b.timer = ENERGY.boltRespawn;
        a.energy = Math.min(ENERGY.max, a.energy + ENERGY.boltRefill);
        this.events.push({ type: 'bolt', animal: a.id });
      }
    }
  }

  private inMud(s: number, d: number): boolean {
    for (const m of this.mud) {
      const rel = this.track.delta(m.s, s);
      if (rel >= 0 && rel <= m.length && d >= m.d0 && d <= m.d1) return true;
    }
    return false;
  }

  private updateCheckpoints(a: AnimalState) {
    const K = RACE.checkpointsPerLap;
    const total = this.laps * K;
    while (!a.finished && a.totalDist >= (a.cpPassed + 1) * this.cpSpacing) {
      a.cpPassed++;
      if (a.cpPassed % K === 0) {
        // Runde beendet
        const lapTime = this.time - a.lapStart;
        a.bestLap = Math.min(a.bestLap, lapTime);
        a.lapStart = this.time;
        if (a.cpPassed >= total) {
          a.finished = true;
          a.finishTime = this.time;
          this.events.push({ type: 'finish', animal: a.id });
        } else {
          a.lap = a.cpPassed / K + 1;
          this.events.push({ type: 'lap', animal: a.id, value: a.lap });
        }
      }
    }
  }

  /** Tier fällt aus der Strecke (Loch, Lava …): nach kurzer Zeit am letzten Kontrollpunkt einsetzen. */
  startRespawn(a: AnimalState) {
    if (a.respawn > 0) return;
    a.respawn = RACE.respawnDelay;
    a.speed = 0;
  }

  private respawnAt(a: AnimalState) {
    const t = this.track;
    const dist = a.cpPassed * this.cpSpacing;
    const s = t.wrap(dist);
    const p = t.pointAt(s, 0);
    a.x = p.x;
    a.z = p.z;
    a.prevX = p.x;
    a.prevZ = p.z;
    a.alt = 0;
    a.vy = 0;
    a.grounded = true;
    a.heading = t.headingAt(s);
    a.prevHeading = a.heading;
    a.speed = 0;
    a.totalDist = dist;
    const proj = t.project(p.x, p.z);
    a.idx = proj.idx;
    a.s = proj.s;
    a.d = proj.d;
    a.respawn = 0;
    this.events.push({ type: 'respawn', animal: a.id });
  }

  private collideAnimals() {
    const n = this.animals.length;
    for (let i = 0; i < n; i++) {
      const a = this.animals[i];
      if (a.respawn > 0) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.animals[j];
        if (b.respawn > 0 || Math.abs(a.alt - b.alt) > 1.1) continue;
        const r = this.stats[i].radius + this.stats[j].radius;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dd = dx * dx + dz * dz;
        if (dd >= r * r) continue;
        const dist = Math.sqrt(dd) || 0.01;
        const overlap = (r - dist) * PHYSICS.bumpStrength;
        const ux = dx / dist;
        const uz = dz / dist;
        // Schwerere Tiere (grösserer Radius) werden weniger weggestossen
        const wa = this.stats[j].radius / r;
        const wb = this.stats[i].radius / r;
        a.x -= ux * overlap * wa;
        a.z -= uz * overlap * wa;
        b.x += ux * overlap * wb;
        b.z += uz * overlap * wb;
      }
    }
  }

  private updatePlaces() {
    const sorted = [...this.animals].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalDist - a.totalDist;
    });
    sorted.forEach((a, i) => (a.place = i + 1));
  }

  private checkDone(dt: number) {
    if (this.phase === 'done') return;
    const humans = this.animals.filter((a) => a.human);
    const allFinished = this.animals.every((a) => a.finished);
    const humansDone = humans.length > 0 && humans.every((a) => a.finished);
    if (allFinished) {
      this.phase = 'done';
      return;
    }
    if (humansDone) {
      if (this.doneTimer < 0) this.doneTimer = RACE.waitForOthersSeconds;
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) this.phase = 'done';
    }
  }

  /** Tiere, die das Ziel noch nicht erreicht haben, erhalten eine geschätzte Zeit. */
  results(): ResultRow[] {
    const totalDist = this.laps * this.track.length;
    const rows = this.animals.map((a) => {
      let time = a.finishTime;
      let estimated = false;
      if (!a.finished) {
        const avg = Math.max(5, a.totalDist / Math.max(1, this.time));
        time = this.time + Math.max(0, totalDist - a.totalDist) / avg;
        estimated = true;
      }
      return { animal: a.id, animalId: a.animalId, human: a.human, place: a.place, time, bestLap: a.bestLap, estimated };
    });
    rows.sort((a, b) => a.place - b.place);
    // Geschätzte Zeiten dürfen die Reihenfolge nicht verletzen
    for (let i = 1; i < rows.length; i++) if (rows[i].time < rows[i - 1].time) rows[i].time = rows[i - 1].time + 0.1;
    return rows;
  }

  drainEvents(): SimEvent[] {
    return this.events.splice(0, this.events.length);
  }
}

/** Ordnet Teilnehmer der Startaufstellung zu (Index 0 = vorderster Startplatz). */
function arrangeGrid(entrants: Entrant[]): Entrant[] {
  const humans = entrants.filter((e) => e.human);
  const bots = entrants.filter((e) => !e.human);
  const grid: (Entrant | undefined)[] = new Array(entrants.length).fill(undefined);
  let pos = Math.min(entrants.length, RACE.playerGridPosition) - 1;
  for (const h of humans) {
    while (grid[pos]) pos = (pos + 1) % grid.length;
    grid[pos] = h;
  }
  let bi = 0;
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = bots[bi++];
  return grid as Entrant[];
}
