/**
 * Geräusche: Tierstimmen (Wiehern, Miauen, Bellen/Heulen, Fiepen), Schritte je Untergrund,
 * Einsammeln, Items, eine eigene Klangfolge je Superkraft, Countdown und Zieleinlauf.
 * Alles wird mit Oszillatoren und gefiltertem Rauschen erzeugt.
 */
import type { PowerId, Species } from '../animals/animals';
import { audio } from './engine';

const A = audio;

// ---------------------------------------------------------------- Tierstimmen

export function voice(species: Species, vol = 1, pan = 0, kind: 'start' | 'jubel' | 'kraft' = 'start') {
  if (!A.ready) return;
  const t = A.now;
  switch (species) {
    case 'pferd': {
      // Wiehern: steigt an, zittert und fällt ab
      const o = A.tone(620, 1.1, { type: 'sawtooth', vol: 0.11 * vol, attack: 0.05, release: 0.4, vibrato: 0.05, filter: 2400, pan, reverb: 0.4 });
      o?.frequency.setValueAtTime(620, t);
      o?.frequency.linearRampToValueAtTime(1150, t + 0.25);
      o?.frequency.linearRampToValueAtTime(980, t + 0.6);
      o?.frequency.linearRampToValueAtTime(420, t + 1.1);
      A.noise(0.4, { vol: 0.05 * vol, freq: 2500, q: 2, at: t + 0.7, pan });
      break;
    }
    case 'katze': {
      // «Miau»: Formant über einen Bandpass, Tonhöhe rauf und runter
      const o = A.tone(480, 0.7, { type: 'sawtooth', vol: 0.12 * vol, attack: 0.06, release: 0.25, filter: 1800, pan, reverb: 0.3 });
      o?.frequency.setValueAtTime(480, t);
      o?.frequency.linearRampToValueAtTime(kind === 'kraft' ? 1100 : 820, t + 0.25);
      o?.frequency.linearRampToValueAtTime(520, t + 0.7);
      break;
    }
    case 'hund': {
      if (kind === 'jubel') {
        // Husky heult
        const o = A.tone(420, 1.6, { type: 'triangle', vol: 0.14 * vol, attack: 0.2, release: 0.5, vibrato: 0.02, pan, reverb: 0.6 });
        o?.frequency.setValueAtTime(420, t);
        o?.frequency.linearRampToValueAtTime(720, t + 0.6);
        o?.frequency.linearRampToValueAtTime(560, t + 1.6);
      } else {
        for (const d of [0, 0.22]) {
          A.noise(0.12, { vol: 0.12 * vol, freq: 900, q: 1.2, at: t + d, pan });
          A.tone(320, 0.14, { type: 'square', vol: 0.08 * vol, slideTo: 180, filter: 1400, at: t + d, pan });
        }
      }
      break;
    }
    case 'hamster':
      // Fiepen
      for (const d of [0, 0.13, 0.26]) A.tone(2300 + d * 900, 0.09, { type: 'sine', vol: 0.09 * vol, slideTo: 3100, at: t + d, pan });
      break;
  }
}

// ---------------------------------------------------------------- Schritte

/** Ein Schritt bzw. Huf je nach Untergrund */
export function step(species: Species, surface: string, vol = 1, pan = 0) {
  if (!A.ready) return;
  const v = vol * (species === 'pferd' ? 1 : species === 'hamster' ? 0.35 : 0.55);
  switch (surface) {
    case 'wasser':
    case 'tiefwasser':
      A.noise(0.18, { vol: 0.09 * v, freq: 700, type: 'lowpass', slideTo: 300, pan });
      break;
    case 'eis':
      A.tone(2400 + Math.random() * 600, 0.04, { type: 'sine', vol: 0.04 * v, pan });
      A.noise(0.05, { vol: 0.05 * v, freq: 4000, type: 'highpass', pan });
      break;
    case 'sand':
      A.noise(0.09, { vol: 0.07 * v, freq: 2500, type: 'highpass', pan });
      break;
    case 'matsch':
      A.noise(0.12, { vol: 0.09 * v, freq: 350, type: 'lowpass', pan });
      break;
    default:
      if (species === 'pferd') {
        // Hufgetrappel: kurzes «Klopp»
        A.noise(0.05, { vol: 0.12 * v, freq: 1400 + Math.random() * 300, q: 3, pan });
        A.tone(180 + Math.random() * 40, 0.05, { type: 'triangle', vol: 0.08 * v, pan });
      } else A.noise(0.05, { vol: 0.08 * v, freq: 700, q: 1.5, pan });
  }
}

// ---------------------------------------------------------------- Ereignisse

export const sfx = {
  countdown() {
    A.tone(660, 0.18, { type: 'square', vol: 0.12, filter: 3000 });
  },
  go() {
    A.tone(990, 0.5, { type: 'square', vol: 0.13, filter: 3500, release: 0.3 });
    A.tone(1320, 0.5, { type: 'triangle', vol: 0.08, release: 0.3 });
  },
  jump(vol = 1, pan = 0) {
    A.tone(260, 0.16, { type: 'triangle', vol: 0.07 * vol, slideTo: 520, pan });
  },
  land(vol = 1, pan = 0) {
    A.noise(0.08, { vol: 0.07 * vol, freq: 400, type: 'lowpass', pan });
  },
  stumble(vol = 1, pan = 0) {
    A.noise(0.15, { vol: 0.15 * vol, freq: 300, type: 'lowpass', pan });
    A.tone(220, 0.25, { type: 'triangle', vol: 0.1 * vol, slideTo: 110, pan });
  },
  bolt() {
    A.tone(880, 0.12, { type: 'square', vol: 0.08, slideTo: 1760, filter: 5000 });
    A.tone(1760, 0.18, { type: 'sine', vol: 0.06, at: A.now + 0.07 });
  },
  icon() {
    A.tone(1318, 0.12, { type: 'sine', vol: 0.12 });
    A.tone(1760, 0.22, { type: 'sine', vol: 0.12, at: A.now + 0.08, reverb: 0.4 });
  },
  powerReady() {
    [784, 988, 1175, 1568].forEach((f, i) => A.tone(f, 0.18, { type: 'triangle', vol: 0.1, at: A.now + i * 0.07, reverb: 0.4 }));
  },
  hoop() {
    A.tone(1568, 0.3, { type: 'sine', vol: 0.12, reverb: 0.5 });
    A.noise(0.35, { vol: 0.08, freq: 600, slideTo: 3000 });
  },
  ramp(vol = 1, pan = 0) {
    A.tone(180, 0.35, { type: 'sine', vol: 0.12 * vol, slideTo: 700, pan });
  },
  splash(vol = 1, pan = 0) {
    A.noise(0.45, { vol: 0.16 * vol, freq: 1800, type: 'lowpass', slideTo: 400, pan });
  },
  bump(vol = 1, pan = 0) {
    A.noise(0.12, { vol: 0.15 * vol, freq: 200, type: 'lowpass', pan });
    A.tone(90, 0.15, { type: 'sine', vol: 0.15 * vol, pan });
  },
  fall(vol = 1, pan = 0) {
    A.tone(1200, 0.8, { type: 'sine', vol: 0.1 * vol, slideTo: 200, pan });
  },
  respawn() {
    A.tone(523, 0.12, { type: 'triangle', vol: 0.08 });
    A.tone(784, 0.18, { type: 'triangle', vol: 0.08, at: A.now + 0.1 });
  },
  stunned(vol = 1, pan = 0) {
    // «Bonk» und Sterne
    A.tone(700, 0.12, { type: 'square', vol: 0.09 * vol, slideTo: 300, filter: 2000, pan });
    for (let i = 0; i < 4; i++) A.tone(2000 + i * 300, 0.08, { type: 'sine', vol: 0.05 * vol, at: A.now + 0.12 + i * 0.09, pan });
  },
  blocked(vol = 1, pan = 0) {
    A.tone(1900, 0.35, { type: 'sine', vol: 0.1 * vol, reverb: 0.5, pan });
    A.tone(2850, 0.25, { type: 'sine', vol: 0.06 * vol, pan });
  },
  spin(vol = 1, pan = 0) {
    A.tone(900, 0.6, { type: 'triangle', vol: 0.09 * vol, slideTo: 300, vibrato: 0.15, pan });
  },
  slowed(vol = 1, pan = 0) {
    // «Wah-wah»
    A.tone(330, 0.3, { type: 'sawtooth', vol: 0.07 * vol, slideTo: 290, filter: 900, pan });
    A.tone(290, 0.45, { type: 'sawtooth', vol: 0.07 * vol, slideTo: 220, filter: 800, at: A.now + 0.3, pan });
  },
  item(kind: string) {
    switch (kind) {
      case 'turbo':
        A.noise(0.5, { vol: 0.12, freq: 400, slideTo: 4000 });
        A.tone(400, 0.4, { type: 'sawtooth', vol: 0.06, slideTo: 1200, filter: 3000 });
        break;
      case 'schnecke':
        A.tone(500, 0.6, { type: 'sine', vol: 0.1, slideTo: 200, vibrato: 0.1 });
        break;
      case 'schild':
        [1047, 1319, 1568].forEach((f, i) => A.tone(f, 0.5, { type: 'sine', vol: 0.08, at: A.now + i * 0.05, reverb: 0.6 }));
        break;
      case 'matsch':
        A.noise(0.3, { vol: 0.15, freq: 300, type: 'lowpass' });
        A.tone(160, 0.2, { type: 'sine', vol: 0.12, slideTo: 90, at: A.now + 0.1 });
        break;
    }
  },
  lap(last: boolean) {
    const notes = last ? [784, 988, 1175, 1568] : [784, 1047];
    notes.forEach((f, i) => A.tone(f, 0.16, { type: 'triangle', vol: 0.1, at: A.now + i * 0.1 }));
  },
  finish(place: number) {
    // Kleine Fanfare, bei Sieg länger
    const seq = place === 1 ? [523, 659, 784, 1047, 784, 1047] : place <= 3 ? [523, 659, 784, 1047] : [523, 659, 523];
    seq.forEach((f, i) => A.tone(f, i === seq.length - 1 ? 0.6 : 0.16, { type: 'square', vol: 0.08, filter: 3000, at: A.now + i * 0.13, reverb: 0.4 }));
  },
  quakeWarn(vol = 1) {
    A.tone(42, 0.6, { type: 'sine', vol: 0.3 * vol, attack: 0.3 });
    A.noise(0.6, { vol: 0.12 * vol, freq: 120, type: 'lowpass', attack: 0.3 });
  },
  quake(vol = 1) {
    A.tone(60, 0.9, { type: 'sine', vol: 0.35 * vol, slideTo: 30 });
    A.noise(0.9, { vol: 0.25 * vol, freq: 200, type: 'lowpass' });
  },
  leapHit(vol = 1, pan = 0) {
    A.noise(0.2, { vol: 0.2 * vol, freq: 250, type: 'lowpass', pan });
    A.tone(120, 0.25, { type: 'sine', vol: 0.2 * vol, slideTo: 60, pan });
  },
  avalanche() {
    A.noise(2.5, { vol: 0.18, freq: 160, type: 'lowpass', attack: 0.6 });
  },
  menuClick() {
    A.tone(880, 0.05, { type: 'triangle', vol: 0.06 });
  },

  /** Eigener Klang je Superkraft (zusätzlich zur Tierstimme) */
  power(p: PowerId, vol = 1, pan = 0) {
    const t = A.now;
    switch (p) {
      case 'turboGalopp':
        A.tone(200, 0.9, { type: 'sawtooth', vol: 0.09 * vol, slideTo: 900, filter: 2500, pan });
        for (let i = 0; i < 10; i++) A.noise(0.05, { vol: 0.1 * vol, freq: 1500, q: 3, at: t + 0.1 + i * 0.09, pan });
        break;
      case 'sprungAttacke':
        A.noise(0.6, { vol: 0.12 * vol, freq: 500, slideTo: 2500, pan });
        A.tone(300, 0.5, { type: 'triangle', vol: 0.1 * vol, slideTo: 900, pan });
        break;
      case 'apfelRegen':
        for (let i = 0; i < 5; i++) A.tone(500 - i * 30, 0.12, { type: 'sine', vol: 0.12 * vol, slideTo: 200, at: t + i * 0.6, pan });
        break;
      case 'schutzpflaster':
        [784, 988, 1175, 1568, 1976].forEach((f, i) => A.tone(f, 0.4, { type: 'sine', vol: 0.08 * vol, at: t + i * 0.06, reverb: 0.6, pan }));
        break;
      case 'wirbelsturm':
        A.noise(3, { vol: 0.16 * vol, freq: 300, slideTo: 2000, q: 4, attack: 0.3, pan });
        break;
      case 'maeusejagd':
        for (let i = 0; i < 6; i++) A.tone(2600 + (i % 2) * 400, 0.06, { type: 'sine', vol: 0.07 * vol, at: t + i * 0.12, pan });
        [523, 659, 784, 659, 784, 988].forEach((f, i) => A.tone(f, 0.1, { type: 'square', vol: 0.04 * vol, filter: 2000, at: t + 0.7 + i * 0.1, pan }));
        break;
      case 'erdbeben':
        sfx.quakeWarn(vol);
        break;
      case 'miauSchrei': {
        const o = A.tone(600, 0.9, { type: 'sawtooth', vol: 0.16 * vol, attack: 0.04, vibrato: 0.08, filter: 3000, pan, reverb: 0.5 });
        o?.frequency.linearRampToValueAtTime(1300, t + 0.3);
        o?.frequency.linearRampToValueAtTime(700, t + 0.9);
        break;
      }
      case 'spuernase':
        for (let i = 0; i < 4; i++) A.noise(0.07, { vol: 0.1 * vol, freq: 3000, q: 2, at: t + i * 0.1, pan });
        A.noise(1.2, { vol: 0.1 * vol, freq: 500, type: 'lowpass', at: t + 0.45, pan });
        break;
      case 'hamsterkugel':
        A.tone(220, 0.35, { type: 'sine', vol: 0.12 * vol, slideTo: 660, pan });
        A.noise(1.5, { vol: 0.08 * vol, freq: 250, type: 'lowpass', at: t + 0.3, pan });
        break;
    }
  },
};
