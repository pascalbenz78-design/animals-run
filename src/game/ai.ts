/**
 * Computergegner: erzeugen pro Schritt ein Input-Objekt – dieselben Regeln wie für Menschen.
 * Sie folgen der Ideallinie (mit Abweichung je nach Stufe), weichen Heuballen, Matsch und Fallen aus,
 * holen sich Blitze, Icons und Item-Kisten, springen über Hürden und setzen ihre Superkraft ein.
 */
import { AI, ELEMENTS, ICONS, PHYSICS, POWERS, SIM_DT } from '../config/balance';
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
    // In der Nähe von Lava und Löchern konzentrierter laufen
    const danger = sim.el.zones.some((z) => (z.type === 'lava' || z.type === 'loch') && t.delta(a.s, z.s) > -z.length && t.delta(a.s, z.s) < 35);
    this.lane += ((danger ? this.laneTarget * 0.2 : this.laneTarget) - this.lane) * Math.min(1, SIM_DT * (danger ? 4 : 1.5));

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

    const el = sim.el;
    const passThrough = a.active === 'hamsterkugel' || a.active === 'spuernase';
    let mustJump = false;

    // Abkürzung: Weg folgen (eigene Steuerung) bzw. Einstieg ansteuern
    if (a.shortcut >= 0) return this.followShortcut(sim, a, inp);
    const sc = this.chooseShortcut(sim, a, lvl.useShortcuts);
    if (sc) {
      desiredD = sc.d;
      approach = Math.min(approach, Math.max(3, sc.ahead * 0.8));
    }

    // Untergründe meiden, wenn möglich (Matsch, Sand, Eis, Wasser, Lava, Löcher).
    // Geht eine gefährliche Fläche über die ganze Bahn, wird gesprungen.
    if (!passThrough && !sc) {
      for (const z of el.zones) {
        const ahead = t.delta(a.s, z.s);
        if (ahead < -z.length || ahead > 40) continue;
        const deadly = z.type === 'lava' || z.type === 'loch';
        if (z.type === 'tiefwasser' && z.d0 <= -t.halfWidth && z.d1 >= t.halfWidth) continue; // Schwimmstrecke: durch
        const fullWidth = z.d0 <= -maxD && z.d1 >= maxD;
        if (fullWidth) {
          // Graben/Spalte: kurz vorher abspringen
          if ((deadly || z.type === 'wasser') && ahead > 0 && z.length < 7) {
            const tApex = st.jumpVelocity / PHYSICS.gravity;
            if (ahead / Math.max(1, a.speed) <= tApex * 0.75) mustJump = true;
          }
          continue;
        }
        if (desiredD > z.d0 - st.radius - (deadly ? 0.8 : 0) && desiredD < z.d1 + st.radius + (deadly ? 0.8 : 0)) {
          const leftD = z.d1 + st.radius + (deadly ? 1.2 : 0.4);
          const rightD = z.d0 - st.radius - (deadly ? 1.2 : 0.4);
          const canLeft = leftD <= maxD;
          const canRight = rightD >= -maxD;
          if (canLeft && (!canRight || Math.abs(leftD - desiredD) < Math.abs(rightD - desiredD))) desiredD = leftD;
          else if (canRight) desiredD = rightD;
          if (deadly) approach = Math.min(approach, Math.max(3, ahead));
        }
      }
    }

    // Hängebrücke: in der Mitte bleiben
    for (let i = 0; i < (el.data.bridges ?? []).length; i++) {
      const b = el.data.bridges![i];
      const ahead = t.delta(a.s, b.s * t.length - b.length / 2);
      if (ahead > 25 || ahead < -b.length) continue;
      desiredD = el.bridgeOffset(i, sim.time + Math.max(0, ahead) / Math.max(4, a.speed));
      approach = Math.min(approach, 4);
    }

    // Kleine Tiere: hohe Hürden mit Lücke durch die Lücke nehmen
    if (st.radius <= ELEMENTS.gapRadius) {
      for (const hu of el.hurdles) {
        if (!hu.gap || st.jumpVelocity ** 2 / (2 * PHYSICS.gravity) >= hu.height + 0.05) continue;
        const ahead = t.delta(a.s, hu.s);
        if (ahead <= 0 || ahead > 35) continue;
        desiredD = (hu.gap[0] + hu.gap[1]) / 2;
        approach = Math.min(approach, Math.max(3, ahead * 0.8));
      }
    }

    // Reifen: durchzielen und rechtzeitig springen (nicht auf «leicht»)
    if (lvl.boltSeek > 0.5 && !passThrough) {
      for (const h of el.data.hoops ?? []) {
        const ahead = t.delta(a.s, h.s * t.length);
        if (ahead <= 0 || ahead > 30) continue;
        desiredD = h.d;
        approach = Math.min(approach, Math.max(3, ahead));
        const tUp = (st.jumpVelocity - Math.sqrt(Math.max(0, st.jumpVelocity ** 2 - 2 * PHYSICS.gravity * 0.9))) / PHYSICS.gravity;
        const tApex = st.jumpVelocity / PHYSICS.gravity;
        if (ahead / Math.max(1, a.speed) <= (tUp + tApex) / 2 + 0.05) mustJump = true;
      }
    }

    // Heuballen, Steine, Kakteen und Fallen (Äpfel, Matschfallen) ausweichen
    let avoiding = false;
    if (!passThrough) {
      const obstacles: { s: number; d: number; r: number }[] = el.obstacles.map((b) => ({ s: b.s, d: b.d, r: b.r }));
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
    // Beim Einstieg in eine Abkürzung darf die Zielspur über den Rand hinaus gehen
    if (!(sc && desiredD * sc.d > 0 && Math.abs(sc.d) > t.halfWidth)) desiredD = Math.max(-maxD, Math.min(maxD, desiredD));
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
    const grip = a.boost > 0 ? st.grip + (a.boostFactor - 1) * PHYSICS.boostGripAdd : st.grip;
    const vAllowed = Math.min(Math.sqrt(grip / maxK), st.turnRate / maxK);
    inp.vorwaerts = a.speed < vAllowed * 1.05 || a.speed < 5;
    if (Math.abs(diff) > 0.9 && a.speed > 7) inp.vorwaerts = false;

    // Tore: ist das Tor bei Ankunft zu, kurz abbremsen (nicht auf «leicht»)
    if (lvl.boltSeek > 0.5) {
      const gates = el.data.gates ?? [];
      for (let i = 0; i < gates.length; i++) {
        const ahead = t.delta(a.s, gates[i].s * t.length);
        if (ahead <= 0 || ahead > 14) continue;
        if (!el.gateOpen(i, sim.time + ahead / Math.max(3, a.speed)) && !el.gateOpen(i, sim.time)) inp.vorwaerts = ahead > 6 ? a.speed < 4 : false;
      }
    }

    // Rollende Stämme: springen, wenn der Stamm bei Ankunft da ist
    if (a.grounded && !passThrough && a.invuln <= 0) {
      const tApex = st.jumpVelocity / PHYSICS.gravity;
      for (let i = 0; i < (el.data.logs ?? []).length; i++) {
        const eta = tApex;
        const ahead = t.delta(a.s, el.logS(i, sim.time + eta));
        if (ahead > 0 && ahead / Math.max(1, a.speed) <= tApex + 0.05 && ahead < 14) mustJump = true;
      }
    }
    // Windradflügel: springen, wenn der Flügel gleich da ist, wo das Tier sein wird
    if (a.grounded && !passThrough && a.hitImmune <= 0) {
      const look2 = 0.22;
      const fx = a.x + Math.cos(a.heading) * a.speed * look2;
      const fz = a.z + Math.sin(a.heading) * a.speed * look2;
      for (let i = 0; i < (el.data.spinners ?? []).length; i++) {
        const arm = el.spinnerArm(i, sim.time + look2);
        const vx = arm.tx - arm.cx;
        const vz = arm.tz - arm.cz;
        const k = Math.max(0, Math.min(1, ((fx - arm.cx) * vx + (fz - arm.cz) * vz) / (vx * vx + vz * vz)));
        if (Math.hypot(fx - arm.cx - vx * k, fz - arm.cz - vz * k) < 1.6 + st.radius && this.rng() < lvl.boltSeek + 0.1) mustJump = true;
      }
    }
    if (mustJump && a.grounded) inp.springen = true;

    // Hürden: so abspringen, dass der höchste Punkt über der Hürde liegt
    if (a.grounded && a.speed > 2 && !passThrough && a.invuln <= 0) {
      for (let h = 0; h < el.hurdles.length; h++) {
        const hu = el.hurdles[h];
        const ahead = t.delta(a.s, hu.s);
        if (ahead <= 0 || ahead > 30) continue;
        // Zu hoch zum Springen? Dann durch die Lücke (kleine Tiere)
        if (hu.gap && st.radius <= ELEMENTS.gapRadius && st.jumpVelocity ** 2 / (2 * PHYSICS.gravity) < hu.height + 0.05) continue;
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

  private readonly shortcutPlans = new Map<number, boolean>();

  /** Soll eine Abkürzung genommen werden? Gibt die Zielspur zum Einstieg zurück. */
  private chooseShortcut(sim: RaceSim, a: AnimalState, chance: number): { d: number; ahead: number } | null {
    const el = sim.el;
    const t = sim.track;
    const st = sim.stats[a.id];
    for (let k = 0; k < el.shortcuts.length; k++) {
      const sc = el.shortcuts[k];
      const ahead = t.delta(a.s, sc.fromS);
      if (ahead < -2 || ahead > 45) continue;
      const kind = sc.def.kind;
      if (kind === 'klein' && st.radius > ELEMENTS.smallRadius) continue;
      // Versteckte Wege kennt nur, wer sucht (Spürnase) oder die Stufe «schwer»
      if (kind === 'versteckt' && a.active !== 'spuernase' && chance < 1) continue;
      const key = k + a.lap * 100;
      if (!this.shortcutPlans.has(key)) this.shortcutPlans.set(key, this.rng() < chance || a.active === 'spuernase');
      if (!this.shortcutPlans.get(key)) continue;
      const edge = t.halfWidth - 1.2;
      // Sprung-Abkürzungen: schon über die Schanze auf den Rand zuhalten
      const early = kind === 'sprung' ? 14 : 5;
      return { d: sc.def.side * (ahead < early ? t.halfWidth + 2 : edge), ahead: Math.max(0, ahead) };
    }
    return null;
  }

  /** Steuerung innerhalb einer Abkürzung: dem Weg folgen */
  private followShortcut(sim: RaceSim, a: AnimalState, inp: Input): Input {
    const el = sim.el;
    const p = el.shortcutPoint(a.shortcut, a.scAlong + Math.max(4, a.speed * 0.6));
    const diff = wrapAngle(Math.atan2(p.z - a.z, p.x - a.x) - a.heading);
    if (diff > AI.steerDeadzone) inp.rechts = true;
    else if (diff < -AI.steerDeadzone) inp.links = true;
    inp.vorwaerts = Math.abs(diff) < 0.8 || a.speed < 5;
    inp.superkraft = this.decidePower(sim, a, AI.levels[a.aiLevel].powerSkill);
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
        // Nur auf einer Geraden lohnt sich der Schub (in Kurven bremst die Haftung)
        for (let k = 0; k < 40; k += 3) maxK = Math.max(maxK, Math.abs(t.racingCurvature[t.indexAt(a.s + k)]));
        return maxK < 0.03 || held > 15;
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
          sim.el.hurdles.some((h) => {
            const d = t.delta(a.s, h.s);
            return d > 3 && d < 30;
          }) ||
          sim.el.obstacles.some((b) => {
            const d = t.delta(a.s, b.s);
            return d > 3 && d < 25;
          });
        return obstacleAhead || held > 6;
      }
    }
    return held > 5;
  }
}
