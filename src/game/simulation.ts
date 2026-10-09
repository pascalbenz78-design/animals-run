/**
 * Renn-Simulation: rechnet das Rennen verbindlich mit fester Rate (SIM_HZ).
 * Kennt weder Darstellung noch Eingabegeräte – jedes Tier bekommt pro Schritt ein Input-Objekt.
 * Alle Zustände sind reine Daten (für Mehrspieler übertragbar), Zufall nur über den Sim-Zufallsgenerator.
 */
import { AI, BODY_RADIUS, EFFECTS, ENERGY, ICONS, ITEMS, OBSTACLES, PHYSICS, POWERS, RACE, SIM_DT, STAT_SCALE } from '../config/balance';
import { getAnimal, SPECIES_STATS, type Species } from '../animals/animals';
import type { TrackData } from '../tracks/types';
import { autopilotInput, startPower, updatePower } from './powers';
import { mulberry32 } from './rng';
import { Track, wrapAngle } from './track';
import {
  ITEM_IDS,
  type AnimalState,
  type Bale,
  type Bolt,
  type Entrant,
  type Hazard,
  type IconPoint,
  type Input,
  type ItemBox,
  type ItemId,
  type RacePhase,
  type ResultRow,
  type SimEvent,
} from './types';

export interface DerivedStats {
  species: Species;
  topSpeed: number;
  accel: number;
  jumpVelocity: number;
  swimFactor: number;
  turnRate: number;
  grip: number;
  radius: number;
  /** Anteil, um den das Tier bei Zusammenstössen weggestossen wird */
  pushFactor: number;
  /** Trittsicherheit (0 = normal, 1 = Matsch/Eis wirken nicht) */
  surefoot: number;
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
    pushFactor: def.traits?.pushFactor ?? 1,
    surefoot: def.traits?.surefoot ?? 0,
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
  readonly iconPoints: IconPoint[] = [];
  readonly itemBoxes: ItemBox[] = [];
  readonly hazards: Hazard[] = [];
  readonly events: SimEvent[] = [];
  /** Zuletzt angestossene Hürde je Index (für Wackel-Animation), Zeitpunkt in Sekunden. */
  readonly hurdleHit: number[] = [];
  phase: RacePhase = 'countdown';
  /** Rennzeit in Sekunden; negativ während des Countdowns. */
  time = -RACE.countdownSeconds;
  tick = 0;
  /** Zufall der Simulation (Items). Deterministisch bei gleichem Startwert. */
  readonly rng: () => number;
  private hazardId = 0;
  /** Bester Platz eines Menschen (für die Aufholhilfe der Computergegner) */
  private bestHumanPlace = 0;
  private doneTimer = -1;
  private readonly cpSpacing: number;

  constructor(trackData: TrackData | Track, entrants: Entrant[], laps = RACE.laps, seed = 1) {
    this.track = trackData instanceof Track ? trackData : new Track(trackData);
    this.laps = laps;
    this.rng = mulberry32(seed);
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
    for (const row of t.data.items) {
      for (const d of row.ds) {
        const p = t.pointAt(row.s * L, d);
        this.itemBoxes.push({ x: p.x, z: p.z, s: row.s * L, d, timer: 0 });
      }
    }
    // Icon-Punkte: normale Punkte plus automatisch verteilte Punkte der Aufholhilfe
    for (const ic of t.data.icons) this.addIconPoint(ic.s * L, ic.d, 0);
    for (let k = 1; k <= ICONS.extraMax; k++) {
      const s = ((k - 0.5) / ICONS.extraMax + 0.03) * L;
      const d = ((k * 7) % 5) * 1.6 - 3.2;
      this.addIconPoint(s, d, k);
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
      this.animals.push(newAnimal(gridIndex, e, p.x, p.z, heading, proj.idx, proj.s, proj.d, s, this.iconPoints.length));
      this.stats.push(deriveStats(e.animalId));
    });
  }

  private addIconPoint(s: number, d: number, rank: number) {
    const p = this.track.pointAt(s, d);
    this.iconPoints.push({ x: p.x, z: p.z, s: this.track.wrap(s), d, rank });
  }

  /** Sieht dieses Tier den Icon-Punkt? (Aufholhilfe: hintere Plätze sehen mehr Punkte) */
  iconVisibleFor(a: AnimalState, i: number): boolean {
    const p = this.iconPoints[i];
    if (a.iconTimers[i] > 0) return false;
    return p.rank === 0 || p.rank <= ICONS.extraByPlace[Math.min(8, a.place)];
  }

  /** Ist das Tier gegen Superkräfte, Items und Hindernisse geschützt? */
  isProtected(a: AnimalState): boolean {
    return a.invuln > 0 || a.respawn > 0;
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
    for (const b of this.itemBoxes) if (b.timer > 0) b.timer = Math.max(0, b.timer - dt);
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      h.age += dt;
      if (h.life <= 0) this.hazards.splice(i, 1);
    }

    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      a.prevX = a.x;
      a.prevZ = a.z;
      a.prevAlt = a.alt;
      a.prevHeading = a.heading;
      if (racing) this.stepAnimal(a, this.stats[i], inputs[i], dt);
    }
    if (racing) {
      for (const a of this.animals) updatePower(this, a, dt);
      this.collideAnimals();
      this.updatePlaces();
      this.checkDone(dt);
    }
  }

  private tickEffects(a: AnimalState, dt: number) {
    const dec = (v: number) => (v > 0 ? Math.max(0, v - dt) : 0);
    a.stumble = dec(a.stumble);
    a.boost = dec(a.boost);
    a.stun = dec(a.stun);
    a.slow = dec(a.slow);
    a.spin = dec(a.spin);
    a.invuln = dec(a.invuln);
    a.hitImmune = dec(a.hitImmune);
    if (a.invuln <= 0) a.shield = '';
    for (let i = 0; i < a.iconTimers.length; i++) if (a.iconTimers[i] > 0) a.iconTimers[i] = Math.max(0, a.iconTimers[i] - dt);
  }

  private stepAnimal(a: AnimalState, st: DerivedStats, rawInput: Input, dt: number) {
    const t = this.track;
    this.tickEffects(a, dt);

    if (a.respawn > 0) {
      a.respawn -= dt;
      if (a.respawn <= 0) this.respawnAt(a);
      return;
    }

    // Superkraft auslösen (nur beim Drücken)
    if (rawInput.superkraft && !a.powerHeld && a.icons >= ICONS.needed && a.stun <= 0 && !a.active) {
      a.icons = 0;
      startPower(this, a);
    }
    a.powerHeld = rawInput.superkraft;

    // Mäusejagd: Autopilot übernimmt die Steuerung
    const inp = a.active === 'maeusejagd' ? autopilotInput(this, a) : rawInput;
    const stunned = a.stun > 0;
    const passThrough = a.active === 'spuernase' || a.active === 'hamsterkugel';

    // Untergrund und Energie bestimmen das erlaubte Tempo
    a.inMud = !passThrough && this.inMud(a.s, a.d);
    const surface = a.inMud ? 1 - (1 - OBSTACLES.mudFactor) * (1 - st.surefoot) : 1;
    const energyFactor =
      a.energy >= ENERGY.slowThreshold
        ? 1
        : ENERGY.emptySpeedFactor + (1 - ENERGY.emptySpeedFactor) * (a.energy / ENERGY.slowThreshold);
    let aiFactor = a.human ? 1 : AI.levels[a.aiLevel].speedFactor;
    // Leichte Aufholhilfe für Computergegner, die hinter dem besten Menschen liegen
    if (!a.human && this.bestHumanPlace > 0 && a.place > this.bestHumanPlace)
      aiFactor *= 1 + Math.min(4, a.place - this.bestHumanPlace) * AI.rubberBandPerPlace;
    let maxSpeed = st.topSpeed * surface * energyFactor * aiFactor;
    if (a.boost > 0) maxSpeed *= a.boostFactor;
    if (a.slow > 0) maxSpeed *= a.slowFactor;
    if (a.spin > 0) maxSpeed *= EFFECTS.spinSpeed;

    // Längsbewegung
    if (stunned) {
      a.speed = Math.max(0, a.speed - PHYSICS.overSpeedDecel * 3 * dt);
    } else if (a.grounded) {
      const accel = a.boost > 0 ? st.accel * 2.2 : st.accel;
      if (a.speed > maxSpeed) {
        a.speed = Math.max(maxSpeed, a.speed - PHYSICS.overSpeedDecel * dt);
      } else if (inp.vorwaerts && a.stumble <= 0) {
        a.speed = Math.min(maxSpeed, a.speed + accel * dt);
      } else {
        a.speed = Math.max(0, a.speed - PHYSICS.coastDecel * dt);
      }
    }

    // Lenken
    const steer = stunned ? 0 : (inp.rechts ? 1 : 0) - (inp.links ? 1 : 0);
    if (steer !== 0) {
      // Während eines Schubs mehr Haftung, damit der Schub auch in Kurven wirkt
      const grip = a.boost > 0 ? st.grip * a.boostFactor * PHYSICS.boostGrip : st.grip;
      let w = Math.min(st.turnRate, grip / Math.max(0.1, a.speed));
      if (!a.grounded) w *= PHYSICS.airSteer;
      if (a.stumble > 0 || a.spin > 0) w *= 0.5;
      a.heading = wrapAngle(a.heading + steer * w * dt);
    }
    // Rutschen: Richtung schwankt
    if (a.spin > 0) a.heading = wrapAngle(a.heading + Math.sin(a.spin * 18) * 1.6 * dt);

    // Springen (nur beim Drücken, nicht beim Halten). Nicht beim Buddeln.
    if (inp.springen && !a.jumpHeld && a.grounded && a.stumble <= 0 && !stunned && a.active !== 'spuernase') {
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

    if (!passThrough) this.hitObstacles(a, st, prevS);
    this.collectBolts(a);
    this.collectIcons(a);
    this.collectItems(a);
    this.hitHazards(a);

    a.stride += a.speed * dt * (st.species === 'pferd' ? 0.9 : st.species === 'hamster' ? 2.2 : 1.4);
  }

  private hitObstacles(a: AnimalState, st: DerivedStats, prevS: number) {
    const t = this.track;
    const prot = a.invuln > 0;
    // Hürden: Beim Überqueren muss das Tier hoch genug sein
    for (let h = 0; h < this.hurdles.length; h++) {
      const hs = this.hurdles[h];
      const before = t.delta(hs, prevS);
      const after = t.delta(hs, a.s);
      if (before < 0 && after >= 0 && after - before < 5 && a.alt < OBSTACLES.hurdleHeight && !prot) {
        a.speed *= OBSTACLES.hurdleSpeedKeep;
        a.stumble = OBSTACLES.hurdleStumble;
        this.hurdleHit[h] = this.time;
        this.events.push({ type: 'stumble', animal: a.id });
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
        // mit kleinem Abstand hinausschieben, sonst bleibt das Tier am Rand hängen
        a.x = b.x + nx * (r + 0.05);
        a.z = b.z + nz * (r + 0.05);
        // Richtung tangential zum Ballen drehen, damit das Tier nicht hängen bleibt
        const fx = Math.cos(a.heading);
        const fz = Math.sin(a.heading);
        const into = fx * nx + fz * nz;
        if (into < 0) a.heading = Math.atan2(fz - nz * into * 1.1, fx - nx * into * 1.1);
        if (a.stumble <= 0 && !prot && a.speed > 3) {
          a.speed *= OBSTACLES.baleSpeedKeep;
          a.stumble = OBSTACLES.baleStumble;
          this.events.push({ type: 'stumble', animal: a.id });
        }
      }
    }
  }

  private collectBolts(a: AnimalState) {
    if (a.active === 'spuernase') return; // unterirdisch
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

  private collectIcons(a: AnimalState) {
    if (a.icons >= ICONS.needed || a.active) return;
    const r2 = ICONS.radius * ICONS.radius;
    for (let i = 0; i < this.iconPoints.length; i++) {
      const p = this.iconPoints[i];
      const dx = a.x - p.x;
      const dz = a.z - p.z;
      if (dx * dx + dz * dz > r2 || a.alt > 2.5 || !this.iconVisibleFor(a, i)) continue;
      a.iconTimers[i] = ICONS.respawn;
      a.icons++;
      this.events.push({ type: 'icon', animal: a.id, value: a.icons });
      if (a.icons >= ICONS.needed) {
        this.events.push({ type: 'powerReady', animal: a.id });
        return;
      }
    }
  }

  private collectItems(a: AnimalState) {
    if (a.active === 'spuernase') return;
    const r2 = ITEMS.boxRadius * ITEMS.boxRadius;
    for (const b of this.itemBoxes) {
      if (b.timer > 0) continue;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      if (dx * dx + dz * dz > r2 || a.alt > 2.5) continue;
      b.timer = ITEMS.boxRespawn;
      this.applyItem(a, this.rollItem(a.place));
      return;
    }
  }

  /** Item auslosen: hinten eher hilfreich, vorne eher die Falle. */
  private rollItem(place: number): ItemId {
    const odds = ITEMS.odds[Math.max(1, Math.min(8, place))];
    let r = this.rng() * odds.reduce((s, x) => s + x, 0);
    for (let i = 0; i < odds.length; i++) {
      r -= odds[i];
      if (r <= 0) return ITEM_IDS[i];
    }
    return 'turbo';
  }

  applyItem(a: AnimalState, item: ItemId) {
    a.lastItem = item;
    this.events.push({ type: 'item', animal: a.id, value: ITEM_IDS.indexOf(item) });
    switch (item) {
      case 'turbo':
        this.giveBoost(a, ITEMS.turbo.boost, ITEMS.turbo.duration);
        break;
      case 'schnecke':
        for (const o of this.animals) {
          if (o.id === a.id || o.place >= a.place || o.finished) continue;
          if (this.isProtected(o)) {
            this.events.push({ type: 'blocked', animal: o.id, by: a.id });
            continue;
          }
          o.slow = ITEMS.schnecke.duration;
          o.slowFactor = ITEMS.schnecke.factor;
          this.events.push({ type: 'slowed', animal: o.id, by: a.id });
        }
        break;
      case 'schild':
        a.invuln = Math.max(a.invuln, ITEMS.schild.duration);
        a.shield = 'schild';
        break;
      case 'matsch':
        this.dropHazard(a, 'matsch', ITEMS.matsch.lifetime);
        break;
    }
  }

  giveBoost(a: AnimalState, factor: number, duration: number) {
    if (a.boost > 0 && a.boostFactor > factor) {
      a.boost = Math.max(a.boost, duration);
      return;
    }
    a.boost = duration;
    a.boostFactor = factor;
  }

  /** Apfel oder Matschfalle hinter dem Tier ablegen. */
  dropHazard(a: AnimalState, kind: Hazard['kind'], life: number, lateral = 0) {
    const back = this.stats[a.id].radius + 1.6;
    const fx = Math.cos(a.heading);
    const fz = Math.sin(a.heading);
    this.hazards.push({
      kind,
      // seitlicher Versatz entlang der linken Normalen (fz, −fx)
      x: a.x - fx * back + fz * lateral,
      z: a.z - fz * back - fx * lateral,
      owner: a.id,
      life,
      age: 0,
      id: this.hazardId++,
    });
  }

  private hitHazards(a: AnimalState) {
    if (a.alt > 0.5 || a.active === 'spuernase' || a.active === 'hamsterkugel') return;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.owner === a.id && (h.kind === 'apfel' || h.age < ITEMS.matsch.ownerImmunity)) continue;
      const r = h.kind === 'apfel' ? POWERS.apfelRegen.radius : ITEMS.matsch.radius;
      const rr = r + this.stats[a.id].radius * 0.6;
      const dx = a.x - h.x;
      const dz = a.z - h.z;
      if (dx * dx + dz * dz > rr * rr) continue;
      this.hazards.splice(i, 1);
      if (this.isProtected(a)) {
        this.events.push({ type: 'blocked', animal: a.id, by: h.owner });
        continue;
      }
      if (h.kind === 'apfel') {
        a.spin = POWERS.apfelRegen.spin;
        this.events.push({ type: 'spin', animal: a.id, by: h.owner });
      } else {
        a.slow = ITEMS.matsch.duration;
        a.slowFactor = ITEMS.matsch.factor;
        this.events.push({ type: 'slowed', animal: a.id, by: h.owner });
      }
    }
  }

  /** Tier stoppen (Superkräfte). Gibt false zurück, wenn es geschützt war. */
  stunAnimal(victim: AnimalState, duration: number, by: number): boolean {
    if (victim.finished) return false;
    if (this.isProtected(victim)) {
      this.events.push({ type: 'blocked', animal: victim.id, by });
      return false;
    }
    if (victim.hitImmune > 0) return false;
    victim.stun = Math.max(victim.stun, duration);
    victim.hitImmune = duration + EFFECTS.hitImmunity;
    victim.speed *= 0.2;
    if (victim.active === 'maeusejagd' || victim.active === 'wirbelsturm') victim.activeTime = 0;
    this.events.push({ type: 'stunned', animal: victim.id, by });
    return true;
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
        a.lastLap = lapTime;
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
      if (a.respawn > 0 || a.active === 'spuernase') continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.animals[j];
        if (b.respawn > 0 || b.active === 'spuernase' || Math.abs(a.alt - b.alt) > 1.1) continue;
        const sa = this.stats[i];
        const sb = this.stats[j];
        const r = sa.radius + sb.radius;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dd = dx * dx + dz * dz;
        if (dd >= r * r) continue;
        const dist = Math.sqrt(dd) || 0.01;
        const overlap = (r - dist) * PHYSICS.bumpStrength;
        const ux = dx / dist;
        const uz = dz / dist;
        // Schwerere Tiere (grösserer Radius) werden weniger weggestossen; Hamsterkugel schubst kräftig
        let wa = (sb.radius / r) * sa.pushFactor;
        let wb = (sa.radius / r) * sb.pushFactor;
        if (a.active === 'hamsterkugel') {
          wa = 0;
          wb = 2.5;
        } else if (b.active === 'hamsterkugel') {
          wa = 2.5;
          wb = 0;
        }
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
    this.bestHumanPlace = sorted.findIndex((a) => a.human) + 1;
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

function newAnimal(
  id: number,
  e: Entrant,
  x: number,
  z: number,
  heading: number,
  idx: number,
  s: number,
  d: number,
  totalDist: number,
  iconPoints: number,
): AnimalState {
  return {
    id,
    animalId: e.animalId,
    human: e.human,
    aiLevel: e.aiLevel,
    x,
    z,
    alt: 0,
    vy: 0,
    heading,
    speed: 0,
    grounded: true,
    prevX: x,
    prevZ: z,
    prevAlt: 0,
    prevHeading: heading,
    idx,
    s,
    d,
    totalDist,
    cpPassed: 0,
    lap: 1,
    lapStart: 0,
    bestLap: Infinity,
    lastLap: 0,
    finished: false,
    finishTime: 0,
    place: id + 1,
    energy: ENERGY.max,
    stumble: 0,
    respawn: 0,
    jumpHeld: false,
    powerHeld: false,
    inMud: false,
    stride: id * 1.7,
    power: getAnimal(e.animalId).power,
    icons: 0,
    iconTimers: new Array(iconPoints).fill(0),
    active: '',
    activeTime: 0,
    activeTarget: -1,
    activeDir: 0,
    activeHits: 0,
    activeCount: 0,
    boost: 0,
    boostFactor: 1,
    stun: 0,
    slow: 0,
    slowFactor: 1,
    spin: 0,
    invuln: 0,
    shield: '',
    hitImmune: 0,
    lastItem: '',
  };
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
