/**
 * Renn-Simulation: rechnet das Rennen verbindlich mit fester Rate (SIM_HZ).
 * Kennt weder Darstellung noch Eingabegeräte – jedes Tier bekommt pro Schritt ein Input-Objekt.
 * Alle Zustände sind reine Daten (für Mehrspieler übertragbar), Zufall nur über den Sim-Zufallsgenerator.
 */
import { AI, BODY_RADIUS, EFFECTS, ELEMENTS, ENERGY, ICONS, ITEMS, OBSTACLES, PHYSICS, POWERS, RACE, SIM_DT, STAT_SCALE } from '../config/balance';
import { getAnimal, SPECIES_STATS, type Species } from '../animals/animals';
import type { TrackData } from '../tracks/types';
import { Elements } from './elements';
import { autopilotInput, startPower, updatePower } from './powers';
import { mulberry32 } from './rng';
import { Track, wrapAngle } from './track';
import {
  ITEM_IDS,
  type AnimalState,
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

export class RaceSim {
  readonly track: Track;
  readonly laps: number;
  readonly animals: AnimalState[] = [];
  readonly stats: DerivedStats[] = [];
  readonly bolts: Bolt[] = [];
  /** Streckenelemente (Untergründe, Hürden, Hindernisse, bewegte Teile, Abkürzungen) */
  readonly el: Elements;
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
  /** Nächste ID für Äpfel und Fallen (für Mehrspieler übertragbar) */
  hazardId = 0;
  /** Bester Platz eines Menschen (für die Aufholhilfe der Computergegner) */
  private bestHumanPlace = 0;
  doneTimer = -1;
  private readonly cpSpacing: number;
  /** Höchste Runde im Feld (für Ereignisse wie Lawinen ab Runde 3) */
  leaderLap = 1;

  constructor(trackData: TrackData | Track, entrants: Entrant[], laps = RACE.laps, seed = 1) {
    this.track = trackData instanceof Track ? trackData : new Track(trackData);
    this.laps = laps;
    this.rng = mulberry32(seed);
    const t = this.track;
    const L = t.length;
    this.cpSpacing = L / RACE.checkpointsPerLap;

    this.el = new Elements(t, t.data);
    this.hurdleHit.length = this.el.hurdles.length;
    this.hurdleHit.fill(-99);
    for (const st of t.data.bolts) {
      for (const d of st.ds) {
        const p = t.pointAt(st.s * L, d);
        this.bolts.push({ x: p.x, z: p.z, s: st.s * L, d, timer: 0 });
      }
    }
    // Jede Reihe zeigt alle Items (je Reihe anders angeordnet)
    t.data.items.forEach((row, r) => {
      row.ds.forEach((d, k) => {
        const p = t.pointAt(row.s * L, d);
        this.itemBoxes.push({ x: p.x, z: p.z, s: row.s * L, d, timer: 0, hidden: !!row.hidden, item: ITEM_IDS[(k + r * 3) % ITEM_IDS.length], row: r });
      });
    });
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
      this.leaderLap = Math.max(...this.animals.map((a) => a.lap));
      this.updateAvalanches();
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
    // Springen bleibt aber immer möglich (z. B. über Lavaspalten)
    let inp = rawInput;
    if (a.active === 'maeusejagd') {
      inp = autopilotInput(this, a);
      inp.springen = inp.springen || rawInput.springen;
    }
    const stunned = a.stun > 0;
    const digging = a.active === 'spuernase';
    const ball = a.active === 'hamsterkugel';
    const passThrough = digging || ball;

    // Untergrund (Brücke, Wasser, Eis, Sand, Matsch, Lava …)
    const el = this.el;
    let surface = '';
    let current = 0;
    const bridge = a.shortcut < 0 ? el.bridgeAt(a.s) : -1;
    if (bridge >= 0) {
      const b = el.data.bridges![bridge];
      const onBridge = Math.abs(a.d - el.bridgeOffset(bridge, this.time)) <= b.width / 2 - 0.2;
      if (!onBridge) {
        if (b.below === 'schlucht' && a.alt < 0.3) {
          this.fall(a);
          return;
        }
        surface = 'tiefwasser';
      }
    } else if (a.shortcut < 0 && !digging) {
      const z = el.surfaceAt(a.s, a.d);
      if (z) {
        surface = z.type;
        current = z.current;
      }
    }
    if ((surface === 'lava' || surface === 'loch') && a.alt < 0.15) {
      this.fall(a);
      return;
    }
    if (ball && surface !== 'lava' && surface !== 'loch') surface = '';
    const wasSwimming = a.swimming;
    a.swimming = surface === 'tiefwasser';
    if (a.swimming && !wasSwimming) this.events.push({ type: 'splash', animal: a.id });
    if (surface === 'wasser' && a.surface !== 'wasser' && a.alt < 0.2) this.events.push({ type: 'splash', animal: a.id });
    a.surface = surface;
    a.inMud = surface === 'matsch';
    const onIce = surface === 'eis';
    const sure = st.surefoot;
    let surfaceFactor = 1;
    if (surface === 'matsch' || surface === 'wasser' || surface === 'sand') {
      const f = ELEMENTS.surfaceSpeed[surface];
      surfaceFactor = 1 - (1 - f) * (surface === 'wasser' ? 1 : 1 - sure);
    }
    if (a.swimming) {
      // Im tiefen Wasser kein Sprung; das Tempo hängt vom Wert «Schwimmen» ab
      surfaceFactor = st.swimFactor;
      a.alt = 0;
      a.vy = 0;
      a.grounded = true;
    }
    const iceK = onIce ? 1 - (1 - ELEMENTS.ice.grip) * (1 - sure) : 1;

    const energyFactor =
      a.energy >= ENERGY.slowThreshold
        ? 1
        : ENERGY.emptySpeedFactor + (1 - ENERGY.emptySpeedFactor) * (a.energy / ENERGY.slowThreshold);
    let aiFactor = a.human ? 1 : AI.levels[a.aiLevel].speedFactor;
    // Leichte Aufholhilfe für Computergegner, die hinter dem besten Menschen liegen
    if (!a.human && this.bestHumanPlace > 0 && a.place > this.bestHumanPlace)
      aiFactor *= 1 + Math.min(4, a.place - this.bestHumanPlace) * AI.rubberBandPerPlace;
    let maxSpeed = st.topSpeed * surfaceFactor * energyFactor * aiFactor;
    if (a.boost > 0) maxSpeed *= a.boostFactor;
    if (a.slow > 0) maxSpeed *= a.slowFactor;
    if (a.spin > 0) maxSpeed *= EFFECTS.spinSpeed;

    // Längsbewegung (auf Eis langsamer anfahren und länger rutschen)
    if (stunned) {
      a.speed = Math.max(0, a.speed - PHYSICS.overSpeedDecel * 3 * dt);
    } else if (a.grounded) {
      let accel = a.boost > 0 ? st.accel * 2.2 : st.accel;
      if (onIce) accel *= ELEMENTS.ice.accel + (1 - ELEMENTS.ice.accel) * sure;
      if (a.speed > maxSpeed) {
        a.speed = Math.max(maxSpeed, a.speed - PHYSICS.overSpeedDecel * dt);
      } else if (inp.vorwaerts && a.stumble <= 0) {
        a.speed = Math.min(maxSpeed, a.speed + accel * dt);
      } else {
        a.speed = Math.max(0, a.speed - PHYSICS.coastDecel * (onIce ? ELEMENTS.ice.coast : 1) * dt);
      }
    }

    // Lenken
    const steer = stunned ? 0 : (inp.rechts ? 1 : 0) - (inp.links ? 1 : 0);
    if (steer !== 0) {
      // Während eines Schubs mehr Haftung, damit der Schub auch in Kurven wirkt
      const grip = (a.boost > 0 ? st.grip + (a.boostFactor - 1) * PHYSICS.boostGripAdd : st.grip) * iceK;
      let w = Math.min(st.turnRate, grip / Math.max(0.1, a.speed));
      if (!a.grounded) w *= PHYSICS.airSteer;
      if (a.stumble > 0 || a.spin > 0) w *= 0.5;
      a.heading = wrapAngle(a.heading + steer * w * dt);
    }
    // Rutschen: Richtung schwankt
    if (a.spin > 0) a.heading = wrapAngle(a.heading + Math.sin(a.spin * 18) * 1.6 * dt);
    // Auf Eis folgt die Bewegungsrichtung der Blickrichtung nur langsam
    if (onIce && a.grounded) {
      const rate = ELEMENTS.ice.slide * (1 + sure * 3);
      a.moveHeading = wrapAngle(a.moveHeading + wrapAngle(a.heading - a.moveHeading) * Math.min(1, rate * dt));
    } else a.moveHeading = a.heading;

    // Springen (nur beim Drücken, nicht beim Halten). Nicht beim Buddeln oder Schwimmen.
    // Sprunghilfe: kurz vor der Landung gedrückt, wird der Sprung bei der Landung ausgeführt.
    if (inp.springen && !a.jumpHeld) a.jumpBuffer = OBSTACLES.jumpBuffer;
    else if (a.jumpBuffer > 0) a.jumpBuffer = Math.max(0, a.jumpBuffer - dt);
    if (a.jumpBuffer > 0 && a.grounded && a.stumble <= 0 && !stunned && !digging && !a.swimming) {
      a.jumpBuffer = 0;
      a.vy = st.jumpVelocity;
      a.grounded = false;
      this.events.push({ type: 'jump', animal: a.id });
    }
    a.jumpHeld = inp.springen;

    // Bewegen (plus Strömung im Wasser)
    a.x += Math.cos(a.moveHeading) * a.speed * dt;
    a.z += Math.sin(a.moveHeading) * a.speed * dt;
    if (current !== 0) {
      a.x += t.tx[a.idx] * current * dt;
      a.z += t.tz[a.idx] * current * dt;
    }
    // Schaukelnde Brücke nimmt die Tiere seitlich mit
    if (bridge >= 0 && surface === '') {
      const shift = el.bridgeOffset(bridge, this.time) - el.bridgeOffset(bridge, this.time - dt);
      a.x += t.tz[a.idx] * shift;
      a.z += -t.tx[a.idx] * shift;
    }
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

    // Auf Strecke projizieren (oder in der Abkürzung weiterlaufen)
    const prevS = a.s;
    if (a.shortcut >= 0) this.stepShortcut(a, st);
    else {
      const proj = t.project(a.x, a.z, a.idx);
      a.idx = proj.idx;
      a.s = proj.s;
      a.d = proj.d;
      // Bande (Zaun): zurückschieben – ausser beim Einstieg in eine Abkürzung
      const limit = t.halfWidth - st.radius - PHYSICS.wallMargin;
      if (Math.abs(a.d) > limit && !this.tryEnterShortcut(a, st)) {
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
          a.moveHeading = a.heading;
        }
        a.speed *= 1 - PHYSICS.wallScrapeLoss * dt * Math.min(1, Math.abs(rel) * 3);
      }
    }

    // Distanz und Kontrollpunkte
    const ds = t.delta(prevS, a.s);
    if (Math.abs(ds) < 20) a.totalDist += ds;
    this.updateCheckpoints(a);

    // Energie
    let drain = ENERGY.drainPerSecond * Math.min(1, a.speed / st.topSpeed);
    if (t.slope[a.idx] > ENERGY.uphillSlope) drain *= ENERGY.uphillFactor;
    if (a.swimming) drain *= ENERGY.swimFactor;
    a.energy = Math.max(0, a.energy - drain * dt);

    this.crossElements(a, prevS, passThrough);
    this.hitWaves(a, st);
    if (!passThrough && a.shortcut < 0) this.hitObstacles(a, st, prevS);
    this.collectBolts(a);
    this.collectIcons(a);
    this.collectItems(a);
    this.hitHazards(a);

    a.stride += a.speed * dt * (st.species === 'pferd' ? 0.9 : st.species === 'hamster' ? 2.2 : 1.4);
  }

  private hitObstacles(a: AnimalState, st: DerivedStats, prevS: number) {
    const t = this.track;
    const el = this.el;
    const prot = a.invuln > 0;
    // Hürden: Beim Überqueren muss das Tier hoch genug sein (Hamster passen durch Lücken)
    for (let h = 0; h < el.hurdles.length; h++) {
      const hu = el.hurdles[h];
      const before = t.delta(hu.s, prevS);
      const after = t.delta(hu.s, a.s);
      if (!(before < 0 && after >= 0 && after - before < 5) || a.alt >= hu.height - OBSTACLES.hurdleTolerance || prot) continue;
      if (hu.gap && st.radius <= ELEMENTS.gapRadius && a.d >= hu.gap[0] && a.d <= hu.gap[1]) continue;
      a.speed *= OBSTACLES.hurdleSpeedKeep;
      a.stumble = OBSTACLES.hurdleStumble;
      this.hurdleHit[h] = this.time;
      this.events.push({ type: 'stumble', animal: a.id });
    }
    // Runde Hindernisse (Heuballen, Steine, Kakteen …): ausweichen oder darüber springen
    for (const b of el.obstacles) {
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const r = b.r + st.radius;
      const dd = dx * dx + dz * dz;
      if (dd < r * r && a.alt < b.h) {
        const dist = Math.sqrt(dd) || 0.01;
        const nx = dx / dist;
        const nz = dz / dist;
        // mit kleinem Abstand hinausschieben, sonst bleibt das Tier am Rand hängen
        a.x = b.x + nx * (r + 0.05);
        a.z = b.z + nz * (r + 0.05);
        // Richtung tangential zum Hindernis drehen
        const fx = Math.cos(a.heading);
        const fz = Math.sin(a.heading);
        const into = fx * nx + fz * nz;
        if (into < 0) {
          a.heading = Math.atan2(fz - nz * into * 1.1, fx - nx * into * 1.1);
          a.moveHeading = a.heading;
        }
        if (a.stumble <= 0 && !prot && a.speed > 3) {
          a.speed *= OBSTACLES.baleSpeedKeep;
          a.stumble = OBSTACLES.baleStumble;
          this.events.push({ type: 'stumble', animal: a.id });
        }
      }
    }
    // Rollende Baumstämme
    const logs = el.data.logs ?? [];
    for (let i = 0; i < logs.length; i++) {
      const rel = t.delta(el.logS(i, this.time), a.s);
      if (Math.abs(rel) < ELEMENTS.log.radius + st.radius * 0.6 && a.alt < ELEMENTS.log.height && a.stumble <= 0 && !prot) {
        a.speed *= OBSTACLES.hurdleSpeedKeep;
        a.stumble = OBSTACLES.hurdleStumble;
        this.events.push({ type: 'stumble', animal: a.id });
      }
    }
    // Windräder: der Flügel fegt knapp über den Boden
    const spinners = el.data.spinners ?? [];
    for (let i = 0; i < spinners.length; i++) {
      if (a.alt >= ELEMENTS.spinner.height || a.stumble > 0 || a.hitImmune > 0 || prot) continue;
      const arm = el.spinnerArm(i, this.time);
      const vx = arm.tx - arm.cx;
      const vz = arm.tz - arm.cz;
      const l2 = vx * vx + vz * vz;
      const k = Math.max(0, Math.min(1, ((a.x - arm.cx) * vx + (a.z - arm.cz) * vz) / l2));
      const qx = arm.cx + vx * k;
      const qz = arm.cz + vz * k;
      const dist = Math.hypot(a.x - qx, a.z - qz);
      if (dist < ELEMENTS.spinner.width + st.radius) {
        a.speed *= OBSTACLES.baleSpeedKeep;
        a.stumble = OBSTACLES.baleStumble + 0.2;
        a.hitImmune = ELEMENTS.spinner.immunity;
        // Vom Flügel weggeschoben
        a.x += ((a.x - qx) / (dist || 1)) * 0.8;
        a.z += ((a.z - qz) / (dist || 1)) * 0.8;
        this.events.push({ type: 'stumble', animal: a.id });
      }
    }
  }

  /** Reifen, Schanzen, Geysire und Tore beim Überqueren */
  private crossElements(a: AnimalState, prevS: number, passThrough: boolean) {
    if (a.shortcut >= 0) return;
    const t = this.track;
    const el = this.el;
    const L = t.length;
    const crossed = (s: number) => {
      const before = t.delta(s, prevS);
      const after = t.delta(s, a.s);
      return before < 0 && after >= 0 && after - before < 5;
    };
    for (const h of el.data.hoops ?? []) {
      if (crossed(h.s * L) && Math.abs(a.d - h.d) < ELEMENTS.hoop.radius && a.alt >= ELEMENTS.hoop.minAlt) {
        this.giveBoost(a, ELEMENTS.hoop.boost, ELEMENTS.hoop.duration);
        this.events.push({ type: 'hoop', animal: a.id });
      }
    }
    // Lianen: hineinspringen und weiterschwingen
    for (const li of el.data.lianas ?? []) {
      if (a.alt < ELEMENTS.liane.minAlt || a.swimming || Math.abs(a.d - li.d) > li.width / 2 || !crossed(li.s * L)) continue;
      a.vy = Math.max(a.vy, ELEMENTS.liane.launch);
      a.grounded = false;
      this.giveBoost(a, ELEMENTS.liane.boost, ELEMENTS.liane.duration);
      this.events.push({ type: 'liane', animal: a.id });
    }
    const ramps = el.data.ramps ?? [];
    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i];
      const kind = r.kind ?? 'schanze';
      if (!a.grounded || a.swimming || a.active === 'spuernase' || Math.abs(a.d - r.d) > r.width / 2 || !crossed(r.s * L)) continue;
      if (kind === 'geysir' && !el.geyserActive(this.time, i)) continue;
      a.vy = ELEMENTS.ramp[kind];
      a.alt = Math.max(a.alt, ELEMENTS.rampHeight[kind]);
      a.grounded = false;
      this.events.push({ type: 'ramp', animal: a.id });
    }
    const gates = el.data.gates ?? [];
    for (let i = 0; i < gates.length; i++) {
      if (a.active === 'spuernase' || el.gateOpen(i, this.time) || !crossed(gates[i].s * L)) continue;
      // Tor zu: zurückprallen
      a.x = a.prevX - Math.cos(a.heading) * 0.6;
      a.z = a.prevZ - Math.sin(a.heading) * 0.6;
      const proj = t.project(a.x, a.z, a.idx);
      a.idx = proj.idx;
      a.s = proj.s;
      a.d = proj.d;
      a.speed = 0;
      if (!passThrough) a.stumble = ELEMENTS.gate.stumble;
      this.events.push({ type: 'bump', animal: a.id });
    }
  }

  /** Wellen: die Wellenfront schiebt Tiere am Boden zur Seite (drüberspringen geht) */
  private hitWaves(a: AnimalState, st: DerivedStats) {
    const waves = this.el.data.waves ?? [];
    if (!waves.length || a.shortcut >= 0 || a.invuln > 0 || a.hitImmune > 0) return;
    const W = ELEMENTS.wave;
    const t = this.track;
    for (let i = 0; i < waves.length; i++) {
      const wv = this.el.wave(i, this.time);
      if (!wv.active || wv.front === null || a.alt >= W.jumpAlt) continue;
      const w = waves[i];
      const rel = t.delta(w.s * t.length - w.length / 2, a.s);
      if (rel < 0 || rel > w.length || Math.abs(a.d - wv.front) > W.band + st.radius) continue;
      // nach links (weg vom Meer) schieben
      a.x += t.tz[a.idx] * W.push;
      a.z += -t.tx[a.idx] * W.push;
      a.d += W.push;
      a.speed *= W.speedKeep;
      a.hitImmune = W.immunity;
      this.events.push({ type: 'welle', animal: a.id });
    }
  }

  /** Lawinen: Schneewalze fegt quer über die Bahn */
  private updateAvalanches() {
    const avs = this.el.data.avalanches ?? [];
    const A = ELEMENTS.avalanche;
    for (let i = 0; i < avs.length; i++) {
      const st = this.el.avalanche(i, this.time, this.leaderLap);
      if (st.front === null) continue;
      const av = avs[i];
      for (const a of this.animals) {
        if (a.respawn > 0 || a.alt > 1.5 || a.shortcut >= 0) continue;
        const rel = this.track.delta(av.s * this.track.length - av.length / 2, a.s);
        if (rel < 0 || rel > av.length || Math.abs(a.d - st.front) > A.band) continue;
        this.stunAnimal(a, A.stun, -1);
      }
    }
  }

  /** Abkürzung betreten, wenn das Tier an einem Einstieg über den Rand läuft */
  private tryEnterShortcut(a: AnimalState, st: DerivedStats): boolean {
    const el = this.el;
    for (let k = 0; k < el.shortcuts.length; k++) {
      const sc = el.shortcuts[k];
      if (Math.sign(a.d) !== sc.def.side) continue;
      const rel = this.track.delta(sc.fromS, a.s);
      if (rel < -5 || rel > 6) continue;
      if (!el.shortcutAllowed(k, st.radius, a.alt)) continue;
      const p = el.projectShortcut(k, a.x, a.z);
      if (p.e > ELEMENTS.shortcut.width / 2 + 1 || p.u > 0.25) continue;
      a.shortcut = k;
      a.scAlong = p.along;
      return true;
    }
    return false;
  }

  /** In der Abkürzung: auf dem Weg halten, Fortschritt auf die Hauptstrecke umrechnen */
  private stepShortcut(a: AnimalState, st: DerivedStats) {
    const el = this.el;
    const t = this.track;
    const k = a.shortcut;
    const sc = el.shortcuts[k];
    const p = el.projectShortcut(k, a.x, a.z);
    const maxE = ELEMENTS.shortcut.width / 2 - st.radius * 0.5;
    if (p.e > maxE) {
      const q = el.shortcutPoint(k, p.along);
      a.x = q.x + ((a.x - q.x) * maxE) / p.e;
      a.z = q.z + ((a.z - q.z) * maxE) / p.e;
      a.speed *= 1 - 0.8 * SIM_DT;
    }
    a.scAlong = p.along;
    a.s = t.wrap(sc.fromS + p.u * sc.skip);
    a.idx = t.indexAt(a.s);
    a.d = sc.def.side * t.halfWidth;
    // Ausstieg am Ende (oder rückwärts am Anfang)
    if (p.u > 0.97 || p.u < 0.01) {
      const proj = t.project(a.x, a.z, t.indexAt(p.u > 0.5 ? sc.toS : sc.fromS));
      if (Math.abs(proj.d) < t.halfWidth + 1) {
        a.shortcut = -1;
        a.idx = proj.idx;
        a.s = proj.s;
        a.d = proj.d;
      }
    }
  }

  /** In Lava, ein Loch oder eine Schlucht gefallen */
  private fall(a: AnimalState) {
    this.events.push({ type: 'fall', animal: a.id });
    this.startRespawn(a);
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
      if (b.hidden) {
        this.applyItem(a, this.rollItem(a.place));
        return;
      }
      this.applyItem(a, b.item);
      // Neue Kiste: ein Item, das in der Reihe gerade fehlt (sonst zufällig)
      const shown = new Set(this.itemBoxes.filter((o) => o.row === b.row && o !== b).map((o) => o.item));
      const missing = ITEM_IDS.filter((id) => !shown.has(id));
      const pool = missing.length ? missing : ITEM_IDS;
      b.item = pool[Math.floor(this.rng() * pool.length) % pool.length];
      return;
    }
  }

  /** Item auslosen (versteckte Kisten): hinten eher hilfreich, vorne eher die Falle. */
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
    // Am letzten Kontrollpunkt – aber nie in Lava, Wasser oder auf einer Brücke
    // Auch keine Spalte direkt davor: aus dem Stand kommt man nicht darüber
    let dist = a.cpPassed * this.cpSpacing;
    const unsafe = (s: number) => {
      const sz = this.el.surfaceAt(t.wrap(s), 0);
      return (sz && sz.type !== 'sand' && sz.type !== 'matsch') || this.el.bridgeAt(t.wrap(s)) >= 0;
    };
    const deadlyAhead = (s: number) => {
      for (let k = 0; k <= 12; k += 1) {
        const sz = this.el.surfaceAt(t.wrap(s + k), 0);
        if (sz && (sz.type === 'lava' || sz.type === 'loch')) return true;
      }
      return false;
    };
    for (let k = 0; k < 60 && (unsafe(dist) || deadlyAhead(dist)); k++) dist += 2;
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
    a.moveHeading = a.heading;
    a.prevHeading = a.heading;
    a.speed = 0;
    a.totalDist = dist;
    a.shortcut = -1;
    a.swimming = false;
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
    moveHeading: heading,
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
    jumpBuffer: 0,
    powerHeld: false,
    inMud: false,
    surface: '',
    swimming: false,
    shortcut: -1,
    scAlong: 0,
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
