/**
 * Computergegner: erzeugen pro Schritt ein Input-Objekt – dieselben Regeln wie für Menschen.
 * Sie folgen der Ideallinie (mit Abweichung je nach Stufe), weichen Heuballen, Matsch und Fallen aus,
 * holen sich Blitze, Icons und Item-Kisten, springen über Hürden und setzen ihre Superkraft ein.
 */
import { AI, ICONS, OBSTACLES, PHYSICS, POWERS, SIM_DT } from '../config/balance';
import { findTargetAhead } from './powers';
import type { RaceSim } from './simulation';
import { mulberry32 } from './rng';
import { wrapAngle } from './track';
import { emptyInput, type AnimalState, type Input } from './types';

export class AiDriver {
  private readonly rng: () => number;
  private lane = 0;
  private laneTarget = 0;
  private laneTimer = 0;
  /** Sprungplan pro Hürde und Runde: Zeitfehler oder null (= verpasst). */
  private readonly jumpPlans = new Map<number, number | null>();
  private readonly boltPlans = new Map<number, boolean>();
  private avoidSide = 0;
  private readonly quakePlans = new Map<number, boolean>();
  /** Wie lange die Superkraft schon bereit ist */
  private powerHeldTime = 0;
  /** Zufällige Wartezeit für «leicht» */
  private powerPatience = 0;

  constructor(
    readonly index: number,
    seed: number,
  ) {
    this.rng = mulberry32(seed * 7919 + index * 104729);
  }

  think(sim: RaceSim): Input {
    const inp = emptyInput();
    const a = sim.animals[this.index];
    const st = sim.stats[this.index];
    const t = sim.track;
    if (a.respawn > 0 || sim.phase === 'countdown') return inp;
    const lvl = AI.levels[a.aiLevel];

    // Leicht schwankende Spur (je nach Stufe)
    this.laneTimer -= SIM_DT;
    if (this.laneTimer <= 0) {
      this.laneTimer = 1.2 + this.rng() * 2.2;
      this.laneTarget = (this.rng() * 2 - 1) * lvl.lineNoise;
    }
    this.lane += (this.laneTarget - this.lane) * Math.min(1, SIM_DT * 1.5);

    const look = AI.lookAheadBase + AI.lookAheadPerSpeed * a.speed;
    let desiredD = t.racingLine[t.indexAt(a.s + look)] + this.lane;
    // Distanz, auf der die seitliche Abweichung ausgeglichen wird
    let approach = Math.max(5, a.speed * 0.9);
    const maxD = t.halfWidth - st.radius - 0.6;

    // Ziel zum Einsammeln: Blitz (bei wenig Energie), eigenes Icon oder Item-Kiste
    const pick = this.choosePickup(sim, a, desiredD, lvl.boltSeek);
    if (pick) {
      desiredD = pick.d;
      approach = Math.min(approach, Math.max(3, pick.ahead));
    }

    // Matsch meiden, wenn möglich (nicht nötig in Kugel oder beim Buddeln)
    const passThrough = a.active === 'hamsterkugel' || a.active === 'spuernase';
    if (!passThrough) {
      for (const m of sim.mud) {
        const ahead = t.delta(a.s, m.s);
        if (ahead < -m.length || ahead > 40) continue;
        if (desiredD > m.d0 - st.radius && desiredD < m.d1 + st.radius) {
          const leftD = m.d1 + st.radius + 0.4;
          const rightD = m.d0 - st.radius - 0.4;
          const canLeft = leftD <= maxD;
          const canRight = rightD >= -maxD;
          if (canLeft && (!canRight || Math.abs(leftD - desiredD) < Math.abs(rightD - desiredD))) desiredD = leftD;
          else if (canRight) desiredD = rightD;
        }
      }
    }

    // Heuballen und Fallen (Äpfel, Matschfallen) ausweichen
    let avoiding = false;
    if (!passThrough) {
      const obstacles: { s: number; d: number; r: number }[] = sim.bales.map((b) => ({ s: b.s, d: b.d, r: OBSTACLES.baleRadius }));
      if (lvl.avoidHazards) {
        for (const h of sim.hazards) {
          if (h.owner === a.id) continue;
          const p = t.project(h.x, h.z, a.idx);
          obstacles.push({ s: p.s, d: p.d, r: 1.1 });
        }
      }
      for (const b of obstacles) {
        const ahead = t.delta(a.s, b.s);
        if (ahead < -3 || ahead > 32) continue;
        const clear = b.r + st.radius + 0.9;
        if (Math.abs(desiredD - b.d) < clear || (ahead < 12 && Math.abs(a.d - b.d) < clear)) {
          avoiding = true;
          if (this.avoidSide === 0) {
            const leftOk = b.d + clear <= maxD;
            const rightOk = b.d - clear >= -maxD;
            this.avoidSide = leftOk && (!rightOk || a.d >= b.d) ? 1 : -1;
          }
          desiredD = b.d + this.avoidSide * clear;
          approach = Math.min(approach, Math.max(3, ahead - 1));
        }
      }
    }
    if (!avoiding) this.avoidSide = 0;

    // Spurführung relativ zur Strecke: Streckenrichtung (leicht vorausgeschaut) plus Korrektur
    // der seitlichen Abweichung. So wird die Kurveninnenseite nicht abgeschnitten.
    desiredD = Math.max(-maxD, Math.min(maxD, desiredD));
    const trackHeading = t.headingAt(a.s + a.speed * 0.3);
    const want = trackHeading - Math.atan2(desiredD - a.d, approach);
    const diff = wrapAngle(want - a.heading);
    if (diff > AI.steerDeadzone) inp.rechts = true;
    else if (diff < -AI.steerDeadzone) inp.links = true;

    // Tempo: vor engen Kurven auslaufen lassen
    let maxK = 0;
    const scan = 8 + a.speed * 1.1;
    for (let k = 0; k <= scan; k += 2) maxK = Math.max(maxK, Math.abs(t.racingCurvature[t.indexAt(a.s + k)]));
    maxK = Math.max(maxK, 1e-4);
    let vAllowed = Math.min(Math.sqrt(st.grip / maxK), st.turnRate / maxK);
    if (a.boost > 0) vAllowed *= 1.15; // mit Schub lieber etwas mutiger
    inp.vorwaerts = a.speed < vAllowed * 1.05 || a.speed < 5;
    if (Math.abs(diff) > 0.9 && a.speed > 7) inp.vorwaerts = false;

    // Hürden: so abspringen, dass der höchste Punkt über der Hürde liegt
    if (a.grounded && a.speed > 2 && !passThrough && a.invuln <= 0) {
      for (let h = 0; h < sim.hurdles.length; h++) {
        const ahead = t.delta(a.s, sim.hurdles[h]);
        if (ahead <= 0 || ahead > 30) continue;
        const key = h + a.lap * 1000;
        if (!this.jumpPlans.has(key)) {
          const miss = this.rng() < lvl.jumpMissChance;
          this.jumpPlans.set(key, miss ? null : (this.rng() * 2 - 1) * lvl.jumpError);
        }
        const err = this.jumpPlans.get(key);
        if (err === null || err === undefined) continue;
        const tApex = st.jumpVelocity / PHYSICS.gravity;
        if (ahead / a.speed <= tApex + err) inp.springen = true;
      }
    }

    // Schwer: Simbas Erdbeben ausspringen
    if (lvl.dodgeQuake > 0 && a.grounded) {
      for (const o of sim.animals) {
        if (o.id === a.id || o.active !== 'erdbeben' || o.activeCount !== 0) continue;
        if (Math.hypot(o.x - a.x, o.z - a.z) > POWERS.erdbeben.radius + 2) continue;
        // Einmal pro Beben entscheiden, ob das Tier reagiert
        const key = o.id * 100000 + Math.round(sim.time - (POWERS.erdbeben.warning - o.activeTime));
        if (!this.quakePlans.has(key)) this.quakePlans.set(key, this.rng() < lvl.dodgeQuake);
        if (this.quakePlans.get(key) && o.activeTime <= 0.32) inp.springen = true;
      }
    }

    inp.superkraft = this.decidePower(sim, a, lvl.powerSkill);
    return inp;
  }

  /** Wählt das lohnendste Objekt zum Einsammeln vor dem Tier. */
  private choosePickup(sim: RaceSim, a: AnimalState, lineD: number, boltSeek: number): { d: number; ahead: number } | null {
    const t = sim.track;
    let best: { d: number; ahead: number } | null = null;
    let bestCost = Infinity;
    const consider = (s: number, d: number, bonus: number, maxAhead: number) => {
      const ahead = t.delta(a.s, s);
      if (ahead < -1 || ahead > maxAhead) return;
      const lateral = Math.abs(d - a.d);
      // Nicht unmöglich weit zur Seite ziehen
      if (lateral > 2 + ahead * 0.35) return;
      const cost = lateral + Math.abs(d - lineD) * 0.4 - bonus;
      if (cost < bestCost) {
        bestCost = cost;
        best = { d, ahead };
      }
    };
    // Blitze, wenn die Energie knapp wird (vorher entschieden, ob überhaupt)
    if (a.energy < AI.boltSeekEnergy) {
      for (const b of sim.bolts) {
        const key = Math.round(b.s) + a.lap * 100000;
        if (!this.boltPlans.has(key)) this.boltPlans.set(key, this.rng() < boltSeek);
        if (!this.boltPlans.get(key)) continue;
        const eta = Math.max(0, t.delta(a.s, b.s)) / Math.max(4, a.speed);
        if (b.timer > eta + 0.2) continue;
        consider(b.s, b.d, 6 + (AI.boltSeekEnergy - a.energy) * 0.1, 70);
      }
    }
    // Eigene Icons (nur wenn die Superkraft noch nicht geladen ist)
    if (a.icons < ICONS.needed && !a.active && boltSeek > 0.5) {
      for (let i = 0; i < sim.iconPoints.length; i++) {
        if (!sim.iconVisibleFor(a, i)) continue;
        const p = sim.iconPoints[i];
        consider(p.s, p.d, 3, 45);
      }
    }
    // Item-Kisten
    for (const b of sim.itemBoxes) {
      if (b.timer > 0) continue;
      consider(b.s, b.d, 1.5, 35);
    }
    return best;
  }

  /** Entscheidet, ob die Superkraft jetzt ausgelöst wird. */
  private decidePower(sim: RaceSim, a: AnimalState, skill: 'zufall' | 'gezielt' | 'taktisch'): boolean {
    if (a.icons < ICONS.needed || a.active || a.stun > 0) {
      this.powerHeldTime = 0;
      return false;
    }
    if (this.powerHeldTime === 0) this.powerPatience = 3 + this.rng() * 9;
    this.powerHeldTime += SIM_DT;
    const held = this.powerHeldTime;
    if (skill === 'zufall') return held > this.powerPatience;

    const t = sim.track;
    const tactical = skill === 'taktisch';
    const others = sim.animals.filter((o) => o.id !== a.id && !o.finished && o.respawn <= 0);
    const near = (r: number, grounded = false) =>
      others.filter((o) => Math.hypot(o.x - a.x, o.z - a.z) <= r && (!grounded || o.alt < 0.15) && o.invuln <= 0).length;
    switch (a.power) {
      case 'turboGalopp': {
        let maxK = 0;
        for (let k = 0; k < 55; k += 3) maxK = Math.max(maxK, Math.abs(t.racingCurvature[t.indexAt(a.s + k)]));
        return maxK < 0.022 || held > 8;
      }
      case 'sprungAttacke':
        return findTargetAhead(sim, a, POWERS.sprungAttacke.range - (tactical ? 3 : 0)) >= 0 || held > 15;
      case 'apfelRegen':
        return others.some((o) => a.totalDist - o.totalDist > 2 && a.totalDist - o.totalDist < 28) || held > 12;
      case 'schutzpflaster':
        return a.energy < 45 || others.some((o) => o.active === 'erdbeben' || o.active === 'miauSchrei') || held > 10;
      case 'wirbelsturm':
        return near(POWERS.wirbelsturm.radius - 1) >= (tactical ? 2 : 1) || held > 14;
      case 'maeusejagd':
        return held > 1;
      case 'erdbeben':
        return near(POWERS.erdbeben.radius - 4, true) >= (tactical ? 3 : 2) || (held > 12 && near(POWERS.erdbeben.radius, true) >= 1);
      case 'miauSchrei': {
        const W = POWERS.miauSchrei;
        const inCone = others.filter((o) => {
          const dx = o.x - a.x;
          const dz = o.z - a.z;
          const dist = Math.hypot(dx, dz);
          return dist < W.range - 4 && Math.abs(wrapAngle(Math.atan2(dz, dx) - a.heading)) < W.halfAngle * 0.8 && o.invuln <= 0;
        }).length;
        return inCone >= (tactical ? 2 : 1) || (held > 10 && inCone >= 1) || held > 20;
      }
      case 'spuernase':
      case 'hamsterkugel': {
        // Lohnt sich vor Hindernissen
        const obstacleAhead =
          sim.hurdles.some((h) => {
            const d = t.delta(a.s, h);
            return d > 3 && d < 30;
          }) ||
          sim.bales.some((b) => {
            const d = t.delta(a.s, b.s);
            return d > 3 && d < 25;
          });
        return obstacleAhead || held > 6;
      }
    }
    return held > 5;
  }
}
