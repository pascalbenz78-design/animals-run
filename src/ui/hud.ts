/** Anzeige während des Rennens: Platz, Runde, Zeit, Energie, Minikarte, Countdown, Meldungen. */
import { ENERGY, ICONS } from '../config/balance';
import { T } from '../config/texts';
import { getAnimal } from '../animals/animals';
import type { RaceSim } from '../game/simulation';
import { wrapAngle } from '../game/track';
import { ITEM_IDS, type SimEvent } from '../game/types';
import { submitLap } from '../storage';

const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

export function formatTime(t: number): string {
  if (!isFinite(t)) return '–';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export class Hud {
  private readonly place = $('hud-place');
  private readonly lap = $('hud-lap');
  private readonly time = $('hud-time');
  private readonly energy = $('hud-energy-fill');
  private readonly countdown = $('countdown');
  private readonly toastEl = $('toast');
  private readonly warn = $('warn');
  private readonly lapInfo = $('lapinfo');
  private readonly power = $('hud-power');
  private readonly powerSlots = $('hud-power-slots');
  private readonly powerBtn = $('t-power');
  private readonly itemPop = $('itempop');
  private readonly speedLines = $('speedlines');
  private lastIcons = -1;
  private lastPowerState = '';
  private readonly map = $<HTMLCanvasElement>('minimap');
  private readonly ctx = this.map.getContext('2d')!;
  private mapPath: Path2D | null = null;
  private mapTf = { s: 1, ox: 0, oz: 0 };
  private wrongWayTime = 0;

  constructor(
    private readonly sim: RaceSim,
    private readonly me: number,
    private readonly trackId: string,
  ) {
    this.buildMap();
    this.countdown.textContent = '';
    this.toastEl.className = '';
    this.warn.textContent = '';
    this.lapInfo.className = '';
    this.itemPop.className = '';
    $('hud-power-ico').textContent = getAnimal(sim.animals[me].animalId).icon;
    this.power.title = T.powers[sim.animals[me].power][0];
  }

  /** Superkraft-Anzeige: Tier-Icon und gesammelte Icons (0/3); leuchtet, wenn bereit. */
  private updatePower() {
    const a = this.sim.animals[this.me];
    if (a.icons !== this.lastIcons) {
      this.lastIcons = a.icons;
      this.powerSlots.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < a.icons));
    }
    const state = a.active ? 'active' : a.icons >= ICONS.needed ? 'ready' : '';
    if (state !== this.lastPowerState) {
      this.lastPowerState = state;
      this.power.classList.toggle('ready', state === 'ready');
      this.power.classList.toggle('active', state === 'active');
      this.powerBtn.classList.toggle('ready', state === 'ready');
    }
    this.speedLines.classList.toggle('on', a.boost > 0 && !a.finished);
  }

  private popItem(index: number) {
    const [emoji, name] = T.items[ITEM_IDS[index]];
    this.itemPop.innerHTML = `<span class="big">${emoji}</span>${name}`;
    this.itemPop.className = '';
    void this.itemPop.offsetWidth;
    this.itemPop.className = 'show';
  }

  /** Nach jeder Runde: Rundenzeit, eigene Bestzeit und bisherige Bestzeit anzeigen. */
  private showLapTime(lapNumber: number) {
    const a = this.sim.animals[this.me];
    const time = a.lastLap;
    const { previous, isNew } = submitLap(this.trackId, a.animalId, time);
    let second: string;
    if (previous === null) second = `<div class="new">${T.hud.firstRecord}</div>`;
    else if (isNew)
      second = `<div class="new">${T.hud.newRecord} <span class="faster">−${(previous - time).toFixed(2)}</span><br><small>${T.hud.previous}: ${formatTime(previous)}</small></div>`;
    else second = `<div>${T.hud.record}: ${formatTime(previous)} <span class="slower">+${(time - previous).toFixed(2)}</span></div>`;
    this.lapInfo.innerHTML = `<div class="big">${T.hud.lapTime} ${lapNumber}: ${formatTime(time)}</div>${second}`;
    this.lapInfo.className = '';
    void this.lapInfo.offsetWidth; // Animation neu starten
    this.lapInfo.className = 'show';
  }

  private buildMap() {
    const t = this.sim.track;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < t.count; i++) {
      minX = Math.min(minX, t.px[i]);
      maxX = Math.max(maxX, t.px[i]);
      minZ = Math.min(minZ, t.pz[i]);
      maxZ = Math.max(maxZ, t.pz[i]);
    }
    const size = this.map.width;
    const pad = 16;
    const s = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    this.mapTf = { s, ox: pad - minX * s + ((size - pad * 2) - (maxX - minX) * s) / 2, oz: pad - minZ * s + ((size - pad * 2) - (maxZ - minZ) * s) / 2 };
    const p = new Path2D();
    for (let i = 0; i <= t.count; i += 4) {
      const k = i % t.count;
      const x = t.px[k] * s + this.mapTf.ox;
      const y = t.pz[k] * s + this.mapTf.oz;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
    this.mapPath = p;
  }

  private drawMap() {
    const c = this.ctx;
    const { s, ox, oz } = this.mapTf;
    c.clearRect(0, 0, this.map.width, this.map.height);
    if (this.mapPath) {
      c.lineJoin = 'round';
      c.strokeStyle = 'rgba(43,26,14,0.85)';
      c.lineWidth = 11;
      c.stroke(this.mapPath);
      c.strokeStyle = '#f2d7a8';
      c.lineWidth = 6;
      c.stroke(this.mapPath);
    }
    // Startlinie
    const t = this.sim.track;
    c.fillStyle = '#fff';
    c.fillRect(t.px[0] * s + ox - 3, t.pz[0] * s + oz - 3, 6, 6);
    const order = [...this.sim.animals].sort((a, b) => (a.id === this.me ? 1 : 0) - (b.id === this.me ? 1 : 0));
    for (const a of order) {
      const x = a.x * s + ox;
      const y = a.z * s + oz;
      const mine = a.id === this.me;
      c.beginPath();
      c.arc(x, y, mine ? 7 : 5, 0, Math.PI * 2);
      c.fillStyle = mine ? '#ffd23f' : getAnimal(a.animalId).uiColor;
      c.fill();
      c.lineWidth = mine ? 3 : 1.5;
      c.strokeStyle = mine ? '#2b1a0e' : '#fff';
      c.stroke();
    }
  }

  update(dt: number) {
    const a = this.sim.animals[this.me];
    this.place.textContent = `${a.place}.`;
    this.lap.textContent = `${Math.min(a.lap, this.sim.laps)}/${this.sim.laps}`;
    const t = a.finished ? a.finishTime : Math.max(0, this.sim.time);
    this.time.textContent = formatTime(t);
    const e = a.energy / ENERGY.max;
    this.energy.style.width = `${Math.max(0, e * 100).toFixed(1)}%`;
    const low = a.energy < ENERGY.slowThreshold;
    this.energy.classList.toggle('low', low);
    this.drawMap();
    this.updatePower();

    // Falsche Richtung?
    const trackHeading = this.sim.track.headingAt(a.s);
    const wrong = Math.abs(wrapAngle(a.heading - trackHeading)) > 1.9 && a.speed > 1.5 && !a.finished;
    this.wrongWayTime = wrong ? this.wrongWayTime + dt : 0;
    let warnText = '';
    if (this.wrongWayTime > 0.8) warnText = T.hud.wrongWay;
    else if (low && !a.finished && this.sim.phase === 'running') warnText = T.hud.lowEnergy;
    if (this.warn.textContent !== warnText) this.warn.textContent = warnText;
  }

  toast(text: string) {
    this.toastEl.textContent = text;
    this.toastEl.className = '';
    void this.toastEl.offsetWidth; // Animation neu starten
    this.toastEl.className = 'show';
  }

  private showCountdown(text: string) {
    this.countdown.textContent = text;
    this.countdown.className = '';
    void this.countdown.offsetWidth;
    this.countdown.className = 'pop';
  }

  handleEvent(e: SimEvent) {
    if (e.type === 'countdown') this.showCountdown(String(e.value));
    else if (e.type === 'go') this.showCountdown(T.hud.go);
    else if (e.animal === this.me) {
      if (e.type === 'item') this.popItem(e.value!);
      else if (e.type === 'stunned') this.toast(T.stunned);
      else if (e.type === 'powerReady') this.toast(T.powerReady);
      else if (e.type === 'power') this.toast(T.powers[this.sim.animals[this.me].power][0] + '!');
      if (e.type === 'lap' || e.type === 'finish') this.showLapTime(e.type === 'lap' ? e.value! - 1 : this.sim.laps);
      if (e.type === 'lap') this.toast(e.value === this.sim.laps ? T.hud.lastLap : `${T.hud.lap} ${e.value}/${this.sim.laps}`);
      else if (e.type === 'finish') this.toast(`${T.hud.finish} ${this.sim.animals[this.me].place}. ${T.hud.place}`);
      else if (e.type === 'bolt') {
        const bar = this.energy.parentElement!;
        bar.classList.remove('flash');
        void bar.offsetWidth;
        bar.classList.add('flash');
      }
    }
  }
}
