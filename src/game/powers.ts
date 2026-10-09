/**
 * Die zehn Superkräfte. Jede Kraft wird mit `startPower` ausgelöst und mit `updatePower`
 * pro Simulationsschritt fortgeführt. Alle Werte stehen in config/balance.ts (POWERS).
 */
import { OBSTACLES, PHYSICS, POWERS } from '../config/balance';
import type { RaceSim } from './simulation';
import { wrapAngle } from './track';
import { emptyInput, type AnimalState, type Input } from './types';

export function startPower(sim: RaceSim, a: AnimalState) {
  const P = POWERS;
  a.active = a.power;
  a.activeHits = 0;
  a.activeCount = 0;
  a.activeTarget = -1;
  a.activeDir = a.heading;
  sim.events.push({ type: 'power', animal: a.id });
  switch (a.power) {
    case 'turboGalopp':
      a.activeTime = P.turboGalopp.duration;
      sim.giveBoost(a, P.turboGalopp.boost, P.turboGalopp.duration);
      break;
    case 'sprungAttacke': {
      const P2 = P.sprungAttacke;
      a.activeTime = P2.leapTime;
      a.activeTarget = findTargetAhead(sim, a, P2.range);
      // Hoher Sprung, der genau nach leapTime landet
      a.vy = (PHYSICS.gravity * P2.leapTime) / 2;
      a.grounded = false;
      if (a.activeTarget < 0) a.speed = Math.max(a.speed, sim.stats[a.id].topSpeed * 1.15);
      break;
    }
    case 'apfelRegen':
      a.activeTime = P.apfelRegen.duration;
      break;
    case 'schutzpflaster':
      a.activeTime = P.schutzpflaster.duration;
      a.invuln = Math.max(a.invuln, P.schutzpflaster.duration);
      a.shield = 'pflaster';
      a.energy = 100;
      a.stun = 0;
      a.slow = 0;
      a.spin = 0;
      break;
    case 'wirbelsturm':
      a.activeTime = P.wirbelsturm.duration;
      break;
    case 'maeusejagd':
      a.activeTime = P.maeusejagd.duration;
      sim.giveBoost(a, P.maeusejagd.boost, P.maeusejagd.duration);
      break;
    case 'erdbeben':
      a.activeTime = P.erdbeben.warning;
      sim.events.push({ type: 'quakeWarn', animal: a.id });
      break;
    case 'miauSchrei':
      a.activeTime = P.miauSchrei.waveTime;
      break;
    case 'spuernase':
      a.activeTime = P.spuernase.duration;
      a.invuln = Math.max(a.invuln, P.spuernase.duration);
      a.shield = 'graben';
      a.alt = 0;
      a.vy = 0;
      a.grounded = true;
      sim.giveBoost(a, P.spuernase.boost, P.spuernase.duration);
      break;
    case 'hamsterkugel':
      a.activeTime = P.hamsterkugel.duration;
      sim.giveBoost(a, P.hamsterkugel.boost, P.hamsterkugel.duration);
      break;
  }
}

export function updatePower(sim: RaceSim, a: AnimalState, dt: number) {
  if (!a.active) return;
  const P = POWERS;
  a.activeTime -= dt;
  const ending = a.activeTime <= 0;

  switch (a.active) {
    case 'sprungAttacke': {
      const tgt = a.activeTarget >= 0 ? sim.animals[a.activeTarget] : null;
      if (tgt && !ending) {
        // Im Flug auf das Ziel zusteuern
        const rem = Math.max(0.05, a.activeTime);
        const dx = tgt.x + Math.cos(tgt.heading) * tgt.speed * rem - a.x;
        const dz = tgt.z + Math.sin(tgt.heading) * tgt.speed * rem - a.z;
        a.heading = Math.atan2(dz, dx);
        a.speed = Math.min(32, Math.hypot(dx, dz) / rem);
      }
      if (ending) {
        // Landung: alle Tiere direkt darunter werden ausgebremst
        let hit = false;
        for (const o of sim.animals) {
          if (o.id === a.id) continue;
          if (Math.hypot(o.x - a.x, o.z - a.z) < 3.2 + sim.stats[o.id].radius) {
            if (sim.stunAnimal(o, P.sprungAttacke.stun, a.id)) hit = true;
          }
        }
        if (hit) sim.events.push({ type: 'leapHit', animal: a.id });
        a.speed = Math.min(a.speed, sim.stats[a.id].topSpeed);
        sim.giveBoost(a, P.sprungAttacke.selfBoost, P.sprungAttacke.selfBoostTime);
      }
      break;
    }
    case 'apfelRegen': {
      const interval = P.apfelRegen.duration / P.apfelRegen.count;
      const elapsed = P.apfelRegen.duration - Math.max(0, a.activeTime);
      while (a.activeCount < P.apfelRegen.count && elapsed >= a.activeCount * interval) {
        sim.dropHazard(a, 'apfel', P.apfelRegen.lifetime, P.apfelRegen.spread[a.activeCount % P.apfelRegen.spread.length]);
        a.activeCount++;
      }
      break;
    }
    case 'wirbelsturm':
      for (const o of sim.animals) {
        if (o.id === a.id || a.activeHits & (1 << o.id)) continue;
        if (Math.hypot(o.x - a.x, o.z - a.z) <= P.wirbelsturm.radius) {
          a.activeHits |= 1 << o.id;
          sim.stunAnimal(o, P.wirbelsturm.stun, a.id);
        }
      }
      break;
    case 'erdbeben':
      if (ending && a.activeCount === 0) {
        // Auslösen: alle am Boden im Umkreis werden gestoppt – wer springt, entkommt
        a.activeCount = 1;
        sim.events.push({ type: 'quake', animal: a.id });
        for (const o of sim.animals) {
          if (o.id === a.id) continue;
          if (Math.hypot(o.x - a.x, o.z - a.z) > P.erdbeben.radius) continue;
          if (o.alt > 0.15) continue;
          sim.stunAnimal(o, P.erdbeben.stun, a.id);
        }
        // Schockwelle noch kurz sichtbar lassen
        a.activeTime = 0.8;
        return;
      }
      break;
    case 'miauSchrei': {
      const W = P.miauSchrei;
      const r = W.range * Math.min(1, 1 - a.activeTime / W.waveTime);
      for (const o of sim.animals) {
        if (o.id === a.id || a.activeHits & (1 << o.id)) continue;
        const dx = o.x - a.x;
        const dz = o.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist > r || dist < 0.1) continue;
        const ang = Math.abs(wrapAngle(Math.atan2(dz, dx) - a.activeDir));
        if (ang > W.halfAngle) continue;
        a.activeHits |= 1 << o.id;
        sim.stunAnimal(o, W.stun, a.id);
      }
      break;
    }
  }
  if (a.activeTime <= 0) {
    a.active = '';
    a.activeTime = 0;
  }
}

/** Nächstes Tier vor diesem (auf der Strecke) innerhalb der Reichweite, oder −1. */
export function findTargetAhead(sim: RaceSim, a: AnimalState, range: number): number {
  let best = -1;
  let bestGap = Infinity;
  for (const o of sim.animals) {
    if (o.id === a.id || o.finished || o.respawn > 0) continue;
    const gap = o.totalDist - a.totalDist;
    if (gap <= 0.5 || gap > range) continue;
    if (Math.hypot(o.x - a.x, o.z - a.z) > range + 3) continue;
    if (gap < bestGap) {
      bestGap = gap;
      best = o.id;
    }
  }
  return best;
}

/**
 * Autopilot für die Mäusejagd: folgt der Ideallinie, weicht Heuballen aus
 * und springt rechtzeitig über Hürden.
 */
export function autopilotInput(sim: RaceSim, a: AnimalState): Input {
  const inp = emptyInput();
  const t = sim.track;
  const st = sim.stats[a.id];
  inp.vorwaerts = true;
  const look = 6 + a.speed * 0.55;
  let desiredD = t.racingLine[t.indexAt(a.s + look)];
  let approach = Math.max(5, a.speed * 0.8);
  const maxD = t.halfWidth - st.radius - 0.6;
  for (const b of sim.bales) {
    const ahead = t.delta(a.s, b.s);
    if (ahead < -2 || ahead > 28) continue;
    const clear = OBSTACLES.baleRadius + st.radius + 1;
    if (Math.abs(desiredD - b.d) < clear) {
      desiredD = b.d + (b.d + clear <= maxD && (a.d >= b.d || b.d - clear < -maxD) ? clear : -clear);
      approach = Math.min(approach, Math.max(3, ahead - 1));
    }
  }
  desiredD = Math.max(-maxD, Math.min(maxD, desiredD));
  const want = t.headingAt(a.s + a.speed * 0.3) - Math.atan2(desiredD - a.d, approach);
  const diff = wrapAngle(want - a.heading);
  if (diff > 0.03) inp.rechts = true;
  else if (diff < -0.03) inp.links = true;
  if (a.grounded && a.speed > 2) {
    const tApex = st.jumpVelocity / PHYSICS.gravity;
    for (const hs of sim.hurdles) {
      const ahead = t.delta(a.s, hs);
      if (ahead > 0 && ahead / a.speed <= tApex) inp.springen = !a.jumpHeld;
    }
  }
  return inp;
}
