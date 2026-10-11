/**
 * Verbindet das Rennen mit den Klängen: Ereignisse → Geräusche (leiser, je weiter weg vom eigenen Tier),
 * Schritte im Laufrhythmus, Tierstimmen beim Start, bei der Superkraft und beim Jubeln.
 */
import { getAnimal } from '../animals/animals';
import type { RaceSim } from '../game/simulation';
import { wrapAngle } from '../game/track';
import { ITEM_IDS, type SimEvent } from '../game/types';
import { audio } from './engine';
import { music } from './music';
import { sfx, step, voice, voicePitch } from './sfx';

export class GameAudio {
  private lastStride: number[] = [];
  private avalancheWarned = new Set<number>();
  private waveWarned = new Set<number>();

  constructor(
    private readonly sim: RaceSim,
    private readonly me: number,
  ) {
    this.lastStride = sim.animals.map((a) => a.stride);
  }

  /** Lautstärke (0–1) und Stereo-Position eines Tiers aus Sicht des eigenen Tiers */
  private where(i: number): { vol: number; pan: number } {
    if (i === this.me || this.me < 0) return { vol: 1, pan: 0 };
    const a = this.sim.animals[i];
    const m = this.sim.animals[this.me];
    const dx = a.x - m.x;
    const dz = a.z - m.z;
    const d = Math.hypot(dx, dz);
    const vol = Math.max(0, 1 - d / 45) ** 2;
    // Rechts vom eigenen Tier = rechts im Ohr
    const ang = wrapAngle(Math.atan2(dz, dx) - m.heading);
    return { vol, pan: Math.sin(ang) * 0.8 };
  }

  onEvent(e: SimEvent) {
    if (!audio.ready) return;
    const mine = e.animal === this.me;
    const w = e.animal >= 0 ? this.where(e.animal) : { vol: 1, pan: 0 };
    if (w.vol < 0.02 && !mine) return;
    const a = e.animal >= 0 ? this.sim.animals[e.animal] : null;
    switch (e.type) {
      case 'countdown':
        sfx.countdown();
        break;
      case 'go':
        sfx.go();
        if (this.me >= 0) voice(getAnimal(this.sim.animals[this.me].animalId).species, 0.8, 0, 'start', voicePitch(this.sim.animals[this.me].animalId));
        break;
      case 'jump':
        sfx.jump(mine ? 1 : w.vol * 0.5, w.pan);
        break;
      case 'land':
        if (mine) sfx.land(1);
        break;
      case 'stumble':
        sfx.stumble(w.vol, w.pan);
        break;
      case 'bolt':
        if (mine) sfx.bolt();
        break;
      case 'icon':
        if (mine) sfx.icon();
        break;
      case 'powerReady':
        if (mine) sfx.powerReady();
        break;
      case 'power':
        if (a) {
          sfx.power(a.power, w.vol, w.pan);
          voice(getAnimal(a.animalId).species, w.vol * 0.9, w.pan, 'kraft', voicePitch(a.animalId));
        }
        break;
      case 'item':
        if (mine) sfx.item(ITEM_IDS[e.value ?? 0]);
        break;
      case 'stunned':
        sfx.stunned(mine ? 1 : w.vol, w.pan);
        break;
      case 'blocked':
        sfx.blocked(mine ? 1 : w.vol, w.pan);
        break;
      case 'spin':
        sfx.spin(w.vol, w.pan);
        break;
      case 'slowed':
        if (mine) sfx.slowed(1);
        break;
      case 'hoop':
        if (mine) sfx.hoop();
        break;
      case 'liane':
        sfx.liane(mine ? 1 : w.vol * 0.6, w.pan);
        break;
      case 'welle':
        sfx.wave(mine ? 1 : w.vol * 0.6, w.pan);
        break;
      case 'ramp':
        sfx.ramp(mine ? 1 : w.vol * 0.6, w.pan);
        break;
      case 'splash':
        sfx.splash(mine ? 1 : w.vol * 0.6, w.pan);
        break;
      case 'bump':
        sfx.bump(w.vol, w.pan);
        break;
      case 'fall':
        sfx.fall(w.vol, w.pan);
        break;
      case 'respawn':
        if (mine) sfx.respawn();
        break;
      case 'quake':
        sfx.quake(Math.max(0.3, w.vol));
        break;
      case 'leapHit':
        sfx.leapHit(w.vol, w.pan);
        break;
      case 'lap':
        if (mine) {
          const last = e.value === this.sim.laps;
          sfx.lap(last);
          if (last) music.intensity = 1.35;
        }
        break;
      case 'finish':
        if (mine) {
          sfx.finish(this.sim.animals[this.me].place);
          voice(getAnimal(this.sim.animals[this.me].animalId).species, 1, 0, 'jubel', voicePitch(this.sim.animals[this.me].animalId));
        }
        break;
    }
  }

  /** Pro Frame: Schritte im Laufrhythmus, Grollen vor Lawinen */
  update() {
    if (!audio.ready) return;
    const sim = this.sim;
    sim.animals.forEach((a, i) => {
      const prev = this.lastStride[i];
      this.lastStride[i] = a.stride;
      if (!a.grounded || a.speed < 1 || a.respawn > 0 || a.active === 'spuernase') return;
      // Ein Schritt pro halbem Laufzyklus (Pferde: zwei Hufschläge kurz hintereinander)
      const k0 = Math.floor(prev / Math.PI);
      const k1 = Math.floor(a.stride / Math.PI);
      if (k1 === k0) return;
      const w = this.where(i);
      const vol = i === this.me ? 1 : w.vol * 0.35;
      if (vol < 0.03) return;
      const species = getAnimal(a.animalId).species;
      step(species, a.swimming ? 'tiefwasser' : a.surface, vol, w.pan);
      if (species === 'pferd' && !a.swimming) setTimeout(() => step(species, a.surface, vol * 0.7, w.pan), 70);
    });
    // Welle: Rauschen, wenn sie heranrollt und das eigene Tier in der Nähe ist
    const waves = sim.el.data.waves ?? [];
    for (let i = 0; i < waves.length; i++) {
      const wv = sim.el.wave(i, sim.time);
      const cycle = i * 100000 + Math.floor((sim.time + (waves[i].phase ?? 0)) / waves[i].period);
      if (wv.front !== null && !wv.active && !this.waveWarned.has(cycle) && this.me >= 0) {
        this.waveWarned.add(cycle);
        const ahead = sim.track.delta(sim.animals[this.me].s, waves[i].s * sim.track.length);
        if (Math.abs(ahead) < 60) sfx.waveRush(1 - Math.abs(ahead) / 60);
      }
    }
    // Lawine: einmal pro Abgang grollen, wenn das eigene Tier in der Nähe ist
    const avs = sim.el.data.avalanches ?? [];
    for (let i = 0; i < avs.length; i++) {
      const st = sim.el.avalanche(i, sim.time, sim.leaderLap);
      const cycle = Math.floor(sim.time / avs[i].period);
      if (st.warn && !this.avalancheWarned.has(cycle) && this.me >= 0) {
        this.avalancheWarned.add(cycle);
        const ahead = sim.track.delta(sim.animals[this.me].s, avs[i].s * sim.track.length);
        if (Math.abs(ahead) < 120) sfx.avalanche();
      }
    }
  }
}
