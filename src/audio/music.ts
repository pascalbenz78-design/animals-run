/**
 * Hintergrundmusik: ein kleiner Sequenzer spielt für jede Strecke eine eigene fröhliche Melodie
 * (Tonart, Tempo, Akkordfolge, Instrument, Schlagzeug), dazu Musik für Menü und Siegerehrung.
 * Die Melodien werden aus einem festen Startwert erzeugt – sie klingen also jedes Mal gleich.
 */
import { mulberry32 } from '../game/rng';
import { audio } from './engine';

type Instrument = 'zupf' | 'blech' | 'marimba' | 'floete' | 'glocke' | 'synth' | 'orgel';

interface Theme {
  bpm: number;
  /** Grundton (MIDI-Notennummer) */
  root: number;
  /** Tonleiter als Halbtonschritte */
  scale: number[];
  /** Akkordfolge als Stufen der Tonleiter (0 = I) */
  chords: number[];
  lead: Instrument;
  bass: OscillatorType;
  /** Schlagzeug: 0 ruhig … 2 treibend */
  drums: 0 | 1 | 2;
  /** Swing für lockere Rhythmen (0–0.3) */
  swing: number;
  seed: number;
}

const DUR = [0, 2, 4, 5, 7, 9, 11];
const MOLL = [0, 2, 3, 5, 7, 8, 10];
const DORISCH = [0, 2, 3, 5, 7, 9, 10];
const ORIENT = [0, 1, 4, 5, 7, 8, 10];
const PENTA = [0, 2, 4, 7, 9];

export const THEMES: Record<string, Theme> = {
  menu: { bpm: 104, root: 60, scale: DUR, chords: [0, 5, 3, 4], lead: 'marimba', bass: 'triangle', drums: 1, swing: 0.1, seed: 1 },
  ceremony: { bpm: 96, root: 62, scale: DUR, chords: [0, 3, 4, 0, 5, 3, 4, 4], lead: 'blech', bass: 'triangle', drums: 1, swing: 0, seed: 2 },
  bauernhof: { bpm: 122, root: 62, scale: DUR, chords: [0, 3, 4, 0, 0, 3, 4, 4], lead: 'zupf', bass: 'triangle', drums: 1, swing: 0.18, seed: 11 },
  reitturnier: { bpm: 128, root: 60, scale: DUR, chords: [0, 4, 5, 3, 0, 3, 4, 4], lead: 'blech', bass: 'sawtooth', drums: 2, swing: 0, seed: 12 },
  sandstrand: { bpm: 112, root: 65, scale: DUR, chords: [0, 5, 1, 4], lead: 'marimba', bass: 'sine', drums: 1, swing: 0.22, seed: 13 },
  herbstwald: { bpm: 100, root: 62, scale: DORISCH, chords: [0, 3, 0, 6, 0, 3, 4, 0], lead: 'floete', bass: 'triangle', drums: 0, swing: 0.12, seed: 14 },
  wueste: { bpm: 112, root: 62, scale: ORIENT, chords: [0, 0, 1, 0, 6, 5, 1, 0], lead: 'zupf', bass: 'triangle', drums: 1, swing: 0.08, seed: 15 },
  alpen: { bpm: 118, root: 67, scale: DUR, chords: [0, 4, 0, 3, 0, 4, 4, 0], lead: 'glocke', bass: 'triangle', drums: 1, swing: 0.15, seed: 16 },
  dschungel: { bpm: 126, root: 64, scale: PENTA, chords: [0, 0, 3, 2], lead: 'marimba', bass: 'sine', drums: 2, swing: 0.2, seed: 17 },
  vulkan: { bpm: 138, root: 57, scale: MOLL, chords: [0, 5, 6, 4, 0, 5, 3, 4], lead: 'synth', bass: 'sawtooth', drums: 2, swing: 0, seed: 18 },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Note {
  /** Zeitpunkt in Achteln */
  at: number;
  dur: number;
  note: number;
}

/** Erzeugt ein 8-taktiges Stück: Melodie, Bass, Begleitung */
function compose(th: Theme) {
  const rnd = mulberry32(th.seed * 9973);
  const deg = (d: number, oct = 0) => {
    const n = th.scale.length;
    const o = Math.floor(d / n);
    const i = ((d % n) + n) % n;
    return th.root + th.scale[i] + 12 * (o + oct);
  };
  const bars = 8;
  const melody: Note[] = [];
  const bass: Note[] = [];
  const chords: Note[] = [];
  // Ein Motiv (Rhythmus) für 2 Takte, das wiederholt und variiert wird
  const motif: number[] = [];
  for (let i = 0; i < 16; i++) motif.push(rnd() < (i % 2 === 0 ? 0.75 : 0.35) ? 1 : 0);
  motif[0] = 1;
  let cur = 2;
  for (let b = 0; b < bars; b++) {
    const ch = th.chords[b % th.chords.length];
    // Bass: Grundton auf 1 und 3, Quinte dazwischen
    bass.push({ at: b * 8, dur: 2, note: deg(ch, -2) });
    bass.push({ at: b * 8 + 3, dur: 1, note: deg(ch + 4, -2) });
    bass.push({ at: b * 8 + 4, dur: 2, note: deg(ch, -2) });
    bass.push({ at: b * 8 + 6, dur: 1, note: deg(ch + 2, -2) });
    // Begleitung: Dreiklang
    for (const k of [0, 2, 4]) chords.push({ at: b * 8 + (b % 2 ? 2 : 0), dur: 6, note: deg(ch + k, -1) });
    // Melodie: Schritte in der Tonleiter, auf Akkordtöne ausgerichtet
    for (let s = 0; s < 8; s++) {
      if (!motif[(b % 2) * 8 + s]) continue;
      const step = rnd();
      cur += step < 0.35 ? 1 : step < 0.7 ? -1 : step < 0.85 ? 2 : -2;
      if (s === 0) {
        // Auf schweren Zählzeiten einen Akkordton nehmen
        const target = [ch, ch + 2, ch + 4, ch + 7].reduce((a, c) => (Math.abs(c - cur) < Math.abs(a - cur) ? c : a));
        cur = target;
      }
      cur = Math.max(-1, Math.min(9, cur));
      const len = motif[(b % 2) * 8 + s + 1] ? 1 : 2;
      melody.push({ at: b * 8 + s, dur: len, note: deg(cur, 1) });
    }
  }
  // Schluss: Grundton
  melody.push({ at: bars * 8 - 2, dur: 2, note: deg(0, 1) });
  return { melody, bass, chords, length: bars * 8 };
}

function playLead(inst: Instrument, f: number, at: number, dur: number, vol: number) {
  const o = { at, dest: 'music' as const, reverb: 0.3 };
  switch (inst) {
    case 'zupf':
      audio.tone(f, Math.min(dur, 0.35), { ...o, type: 'triangle', vol: 0.16 * vol, attack: 0.004, release: 0.3 });
      audio.tone(f * 2, 0.12, { ...o, type: 'square', vol: 0.03 * vol, attack: 0.002, release: 0.1, filter: 2500 });
      break;
    case 'blech':
      audio.tone(f, dur * 0.9, { ...o, type: 'sawtooth', vol: 0.07 * vol, attack: 0.04, release: 0.08, filter: 1800 });
      break;
    case 'marimba':
      audio.tone(f, 0.3, { ...o, type: 'sine', vol: 0.2 * vol, attack: 0.003, release: 0.27 });
      audio.tone(f * 4, 0.06, { ...o, type: 'sine', vol: 0.04 * vol, attack: 0.002, release: 0.05 });
      break;
    case 'floete':
      audio.tone(f, dur * 0.95, { ...o, type: 'sine', vol: 0.13 * vol, attack: 0.06, release: 0.1, vibrato: 0.006 });
      break;
    case 'glocke':
      audio.tone(f, 0.6, { ...o, type: 'sine', vol: 0.12 * vol, attack: 0.002, release: 0.55 });
      audio.tone(f * 2.76, 0.3, { ...o, type: 'sine', vol: 0.04 * vol, attack: 0.002, release: 0.28 });
      break;
    case 'synth':
      audio.tone(f, dur * 0.85, { ...o, type: 'square', vol: 0.06 * vol, attack: 0.01, release: 0.06, filter: 2200 });
      break;
    case 'orgel':
      audio.tone(f, dur * 0.95, { ...o, type: 'triangle', vol: 0.1 * vol, attack: 0.02, release: 0.05 });
      break;
  }
}

export class MusicPlayer {
  private theme: Theme | null = null;
  private piece: ReturnType<typeof compose> | null = null;
  private name = '';
  private timer = 0;
  /** Nächste zu planende Achtel und deren Zeitpunkt */
  private nextStep = 0;
  private nextTime = 0;
  private stepDur = 0.25;
  /** Lauter/intensiver ab der letzten Runde */
  intensity = 1;

  constructor() {
    audio.listeners.push(() => {
      if (this.name) this.play(this.name, true);
    });
  }

  /** Musik wechseln (gleiche Musik läuft weiter). */
  play(name: string, force = false) {
    if (!force && name === this.name && this.timer) return;
    this.name = name;
    this.stop(false);
    const th = THEMES[name] ?? THEMES.menu;
    this.theme = th;
    this.piece = compose(th);
    this.stepDur = 60 / th.bpm / 2;
    if (!audio.ctx) return;
    this.nextStep = 0;
    this.nextTime = audio.now + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  stop(clearName = true) {
    if (clearName) this.name = '';
    clearInterval(this.timer);
    this.timer = 0;
  }

  /** Noten der nächsten ~0,25 s planen (genaues Timing über die Audio-Uhr) */
  private schedule() {
    const th = this.theme;
    const pc = this.piece;
    if (!th || !pc || !audio.ctx) return;
    const ahead = audio.now + 0.25;
    while (this.nextTime < ahead) {
      const step = this.nextStep % pc.length;
      const swing = step % 2 === 1 ? th.swing * this.stepDur : 0;
      const t = this.nextTime + swing;
      for (const n of pc.melody) if (n.at === step) playLead(th.lead, midi(n.note), t, n.dur * this.stepDur, this.intensity);
      for (const n of pc.bass)
        if (n.at === step) audio.tone(midi(n.note), n.dur * this.stepDur * 0.9, { at: t, dest: 'music', type: th.bass, vol: 0.13, attack: 0.01, release: 0.05, filter: 900 });
      for (const n of pc.chords)
        if (n.at === step) audio.tone(midi(n.note), n.dur * this.stepDur, { at: t, dest: 'music', type: 'triangle', vol: 0.035, attack: 0.05, release: 0.3, filter: 1500 });
      // Schlagzeug
      const beat = step % 8;
      if (th.drums >= 1 && (beat === 0 || beat === 4)) audio.tone(110, 0.14, { at: t, dest: 'music', type: 'sine', vol: 0.22, slideTo: 45, attack: 0.002, release: 0.12 });
      if (th.drums >= 1 && (beat === 2 || beat === 6)) audio.noise(0.12, { at: t, dest: 'music', vol: 0.07, freq: 1800, q: 0.8 });
      if (th.drums >= 2 || (th.drums === 1 && step % 2 === 0)) audio.noise(0.04, { at: t, dest: 'music', vol: 0.025 * this.intensity, freq: 8000, type: 'highpass' });
      if (th.drums === 0 && beat === 0) audio.noise(0.3, { at: t, dest: 'music', vol: 0.03, freq: 400, type: 'lowpass' });
      this.nextTime += this.stepDur;
      this.nextStep++;
    }
  }
}

export const music = new MusicPlayer();
