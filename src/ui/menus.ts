/** Menü-Bildschirme: Texte einsetzen, Bildschirme wechseln, Karten und Auswahlfelder bauen. */
import { T } from '../config/texts';
import { ANIMALS, SPECIES_NAME, SPECIES_STATS, type BaseStats } from '../animals/animals';
import type { ResultRow } from '../game/types';
import { TRACKS } from '../tracks';
import { load } from '../storage';
import { formatTime } from './hud';

export type ScreenName = 'title' | 'main' | 'animal' | 'track' | 'options' | 'controls' | 'loading' | 'pause' | 'results' | 'none';

const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

/** Alle Elemente mit data-t="pfad.zum.text" mit dem Text aus texts.ts füllen. */
export function applyTexts() {
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
    const path = el.dataset.t!.split('.');
    let v: unknown = T;
    for (const k of path) v = (v as Record<string, unknown>)?.[k];
    if (typeof v === 'string') el.textContent = v;
  });
}

const SCREENS: ScreenName[] = ['title', 'main', 'animal', 'track', 'options', 'controls', 'loading', 'pause', 'results'];

export function showScreen(name: ScreenName) {
  for (const s of SCREENS) $(`scr-${s}`).classList.toggle('hidden', s !== name);
}

export function showHud(on: boolean) {
  $('hud').classList.toggle('hidden', !on);
}

/** Segment-Auswahl (z. B. Hoch/Mittel/Niedrig). */
export function segmented<V extends string>(el: HTMLElement, options: [V, string][], value: V, onChange: (v: V) => void) {
  el.innerHTML = '';
  for (const [v, label] of options) {
    const b = document.createElement('button');
    b.textContent = label;
    b.classList.toggle('on', v === value);
    b.addEventListener('click', () => {
      el.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onChange(v);
    });
    el.appendChild(b);
  }
}

function statRows(s: BaseStats): string {
  return (Object.keys(T.stats) as (keyof BaseStats)[])
    .map(
      (k) =>
        `<div class="stat"><span>${T.stats[k]}</span><span class="pips">${[1, 2, 3, 4, 5]
          .map((i) => `<i class="${i <= s[k] ? 'on' : ''}"></i>`)
          .join('')}</span></div>`,
    )
    .join('');
}

export function buildAnimalCards(selected: string, onSelect: (id: string) => void) {
  const box = $('animal-cards');
  box.innerHTML = '';
  for (const a of ANIMALS) {
    const card = document.createElement('button');
    card.className = 'card' + (a.id === selected ? ' sel' : '');
    const body = '#' + a.appearance.body.toString(16).padStart(6, '0');
    const mane = '#' + a.appearance.mane.toString(16).padStart(6, '0');
    card.innerHTML = `
      <h3>${a.name}<span>${a.icon}</span></h3>
      <div class="species">${SPECIES_NAME[a.species]}</div>
      <div class="swatch" style="background: linear-gradient(110deg, ${body} 0 62%, ${mane} 62% 100%)">${a.species === 'pferd' ? '🐴' : '🐱'}</div>
      <div class="desc">${a.description}</div>
      ${statRows(SPECIES_STATS[a.species])}`;
    card.addEventListener('click', () => {
      box.querySelectorAll('.card').forEach((c) => c.classList.remove('sel'));
      card.classList.add('sel');
      onSelect(a.id);
    });
    box.appendChild(card);
  }
}

export function buildTrackCards(selected: string, onSelect: (id: string) => void) {
  const box = $('track-cards');
  box.innerHTML = '';
  const best = load().bestTimes;
  TRACKS.forEach((t, i) => {
    const card = document.createElement('button');
    card.className = 'card' + (t.id === selected ? ' sel' : '');
    const sky = '#' + t.theme.skyTop.toString(16).padStart(6, '0');
    const ground = '#' + t.theme.ground.toString(16).padStart(6, '0');
    const b = best[t.id];
    card.innerHTML = `
      <h3>${i + 1}. ${t.name}</h3>
      <div class="species">${t.subtitle}</div>
      <div class="swatch" style="background: linear-gradient(${sky} 0 55%, ${ground} 55% 100%)">🚜🐔</div>
      <div class="desc">${T.bestTime}: ${b ? formatTime(b.time) : '–'}</div>`;
    card.addEventListener('click', () => {
      box.querySelectorAll('.card').forEach((c) => c.classList.remove('sel'));
      card.classList.add('sel');
      onSelect(t.id);
    });
    box.appendChild(card);
  });
}

export function buildControlsTable() {
  const tbl = $('controls-table');
  tbl.innerHTML =
    `<tr><th></th><th>${T.controls.pc}</th><th>${T.controls.touch}</th></tr>` +
    T.controls.rows.map(([a, b, c]) => `<tr><td><b>${a}</b></td><td>${b}</td><td>${c}</td></tr>`).join('');
}

export function buildResults(rows: ResultRow[], names: string[], me: number, newRecord: boolean) {
  $('record').classList.toggle('hidden', !newRecord);
  const tbl = $('results-table');
  tbl.innerHTML =
    `<tr><th>${T.results.place}</th><th>${T.results.animal}</th><th>${T.results.time}</th><th>${T.results.bestLap}</th></tr>` +
    rows
      .map(
        (r) =>
          `<tr class="${r.animal === me ? 'me' : ''}"><td>${r.place}.</td><td>${names[r.animal]} <small>(${r.animal === me ? T.results.you : T.results.computer})</small></td><td class="mono">${r.estimated ? '≈ ' : ''}${formatTime(r.time)}</td><td class="mono">${formatTime(r.bestLap)}</td></tr>`,
      )
      .join('');
}
