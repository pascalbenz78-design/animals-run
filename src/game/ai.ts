/**
 * Computergegner: erzeugen pro Schritt ein Input-Objekt – dieselben Regeln wie für Menschen.
 * Sie folgen der Ideallinie (mit Abweichung je nach Stufe), weichen Heuballen und Matsch aus,
 * holen sich Blitze, wenn die Energie knapp wird, und springen rechtzeitig über Hürden.
 */
import { AI, OBSTACLES, PHYSICS, SIM_DT } from '../config/balance';
import type { RaceSim } from './simulation';
import { mulberry32 } from './rng';
import { wrapAngle } from './track';
import { emptyInput, type Input } from './types';

export class AiDriver {
  private readonly rng: () => number;
  private lane = 0;
  private laneTarget = 0;
  private laneTimer = 0;
  /** Sprungplan pro Hürde und Runde: Zeitfehler oder null (= verpasst). */
  private readonly jumpPlans = new Map<number, number | null>();
  private readonly boltPlans = new Map<number, boolean>();
  private avoidSide = 0;

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

    // Energie: Ladestation ansteuern
    if (a.energy < AI.boltSeekEnergy) {
      let bestBolt = -1;
      let bestCost = Infinity;
      for (let i = 0; i < sim.bolts.length; i++) {
        const b = sim.bolts[i];
        const ahead = t.delta(a.s, b.s);
        if (ahead < -1 || ahead > 70) continue;
        const key = Math.round(b.s) + a.lap * 100000;
        if (!this.boltPlans.has(key)) this.boltPlans.set(key, this.rng() < lvl.boltSeek);
        if (!this.boltPlans.get(key)) continue;
        const eta = ahead / Math.max(4, a.speed);
        if (b.timer > eta + 0.2) continue;
        const cost = Math.abs(b.d - a.d) + Math.abs(b.d - desiredD) * 0.5;
        if (cost < bestCost) {
          bestCost = cost;
          bestBolt = i;
        }
      }
      if (bestBolt >= 0) {
        const b = sim.bolts[bestBolt];
        desiredD = b.d;
        const ahead = t.delta(a.s, b.s);
        approach = Math.min(approach, Math.max(3, ahead));
      }
    }

    // Matsch meiden, wenn möglich
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

    // Heuballen ausweichen
    let avoiding = false;
    for (const b of sim.bales) {
      const ahead = t.delta(a.s, b.s);
      if (ahead < -3 || ahead > 32) continue;
      const clear = OBSTACLES.baleRadius + st.radius + 0.9;
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
    if (!avoiding) this.avoidSide = 0;

    desiredD = Math.max(-maxD, Math.min(maxD, desiredD));
    // Spurführung relativ zur Strecke: Streckenrichtung (leicht vorausgeschaut) plus Korrektur
    // der seitlichen Abweichung. So wird die Kurveninnenseite nicht abgeschnitten.
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
    const vAllowed = Math.min(Math.sqrt(st.grip / maxK), st.turnRate / maxK);
    inp.vorwaerts = a.speed < vAllowed * 1.05 || a.speed < 5;
    if (Math.abs(diff) > 0.9 && a.speed > 7) inp.vorwaerts = false;

    // Hürden: so abspringen, dass der höchste Punkt über der Hürde liegt
    if (a.grounded && a.speed > 2) {
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
    return inp;
  }
}
