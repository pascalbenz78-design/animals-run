/** Menü-Bildschirme: Texte einsetzen, Bildschirme wechseln, Karten und Auswahlfelder bauen. */
import { T } from '../config/texts';
import { ANIMALS, getAnimal, SPECIES_STATS, type BaseStats } from '../animals/animals';
import { AnimalPreview } from './preview';
import type { ResultRow } from '../game/types';
import { CUPS, TRACKS } from '../tracks';
import { load } from '../storage';
import { formatTime } from './hud';

export type ScreenName = 'title' | 'main' | 'animal' | 'track' | 'options' | 'controls' | 'loading' | 'pause' | 'results' | 'ceremony' | 'help' | 'mp' | 'lobby' | 'none';

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

const SCREENS: ScreenName[] = ['title', 'main', 'animal', 'track', 'options', 'controls', 'loading', 'pause', 'results', 'ceremony', 'help', 'mp', 'lobby'];

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

let preview: AnimalPreview | null = null;

/** Zeigt Name, Tierart, Werte und Superkraft des gewählten Tiers. */
function showAnimalInfo(id: string) {
  const a = getAnimal(id);
  const [powerName, powerText] = T.powers[a.power];
  $('animal-info').innerHTML = `
    <h3>${a.name} <span class="species">${T.species[a.species]}</span></h3>
    <div class="desc">${T.animals[a.id]}</div>
    ${statRows(SPECIES_STATS[a.species])}
    <div class="power"><span class="power-ico">${a.icon}</span><div><b>${powerName}</b><br>${powerText}</div></div>
    <div class="tipline">💡 ${T.help.animals[a.id][0]}</div>`;
  preview?.show(id);
}

/** Tierwahl: Raster mit allen Tieren, Info-Feld und 3D-Vorschau. `taken` = schon vergeben (Mehrspieler). */
export function buildAnimalPicker(selected: string, onSelect: (id: string) => void, taken: string[] = []) {
  if (!preview) preview = new AnimalPreview($<HTMLCanvasElement>('preview'));
  const grid = $('animal-grid');
  grid.innerHTML = '';
  for (const a of ANIMALS) {
    const b = document.createElement('button');
    b.className = 'pick-btn' + (a.id === selected ? ' sel' : '');
    b.disabled = taken.includes(a.id);
    b.style.setProperty('--c', a.uiColor);
    b.innerHTML = `<span class="pick-ico">${a.icon}</span><span>${a.name}</span>`;
    b.addEventListener('click', () => {
      grid.querySelectorAll('.pick-btn').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      onSelect(a.id);
      showAnimalInfo(a.id);
    });
    grid.appendChild(b);
  }
  showAnimalInfo(selected);
  preview.start();
}

export function stopAnimalPreview() {
  preview?.stop();
}

/** Symbol je Strecke für die Karten */
const TRACK_EMOJI: Record<string, string> = {
  bauernhof: '🚜🐔',
  reitturnier: '🏇🏆',
  sandstrand: '🏖️🌊',
  herbstwald: '🍂🌲',
  wueste: '🌵🐪',
  alpen: '🏔️❄️',
  dschungel: '🌴🦜',
  vulkan: '🌋🔥',
};

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function buildTrackCards(selected: string, onSelect: (id: string) => void) {
  const box = $('track-cards');
  box.innerHTML = '';
  box.classList.add('tracks');
  const best = load().bestTimes;
  TRACKS.forEach((t, i) => {
    const card = document.createElement('button');
    card.className = 'card' + (t.id === selected ? ' sel' : '');
    const b = best[t.id];
    card.innerHTML = `
      <h3>${i + 1}. ${t.name}</h3>
      <div class="species">${t.subtitle}</div>
      <div class="swatch" style="background: linear-gradient(${hex(t.theme.skyTop)} 0 55%, ${hex(t.theme.ground)} 55% 100%)">${TRACK_EMOJI[t.id] ?? ''}</div>
      <div class="desc">${T.bestTime}: ${b ? formatTime(b.time) : '–'}</div>`;
    card.addEventListener('click', () => {
      box.querySelectorAll('.card').forEach((c) => c.classList.remove('sel'));
      card.classList.add('sel');
      onSelect(t.id);
    });
    box.appendChild(card);
  });
}

/** Cup-Wahl: zwei Karten mit den je 4 Strecken und dem besten Ergebnis */
export function buildCupCards(selected: string, onSelect: (id: string) => void) {
  const box = $('track-cards');
  box.innerHTML = '';
  box.classList.remove('tracks');
  const best = load().cupBest;
  for (const cup of CUPS) {
    const card = document.createElement('button');
    card.className = 'card' + (cup.id === selected ? ' sel' : '');
    const b = best[cup.id];
    const names = cup.tracks.map((id) => TRACKS.find((t) => t.id === id)!.name);
    card.innerHTML = `
      <h3>${cup.name}<span>${cup.icon}</span></h3>
      <div class="swatch">${cup.tracks.map((id) => (TRACK_EMOJI[id] ?? '').slice(0, 2)).join(' ')}</div>
      <div class="desc">${names.join(' · ')}</div>
      <div class="species">${T.cup.best}: ${b ? b.place + '. ' + T.results.place : T.cup.none}</div>`;
    card.addEventListener('click', () => {
      box.querySelectorAll('.card').forEach((c) => c.classList.remove('sel'));
      card.classList.add('sel');
      onSelect(cup.id);
    });
    box.appendChild(card);
  }
}

export interface StandingRow {
  name: string;
  me: boolean;
  points: number;
  /** Punkte aus dem letzten Rennen */
  gained: number;
}

/** Cup-Wertung als Tabelle (sortiert nach Punkten) */
export function buildStandings(tableId: string, rows: StandingRow[]) {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  $(tableId).innerHTML =
    `<tr><th>${T.results.place}</th><th>${T.results.animal}</th><th>${T.cup.points}</th><th></th></tr>` +
    sorted
      .map(
        (r, i) =>
          `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}.</td><td>${r.name}</td><td class="mono"><b>${r.points}</b></td><td class="plus">${r.gained ? '+' + r.gained : ''}</td></tr>`,
      )
      .join('');
}

/** Hilfe: Spielregeln, Tiere und Strecken (FAQ) in drei Bereichen */
export function buildHelp(tab: 'regeln' | 'tiere' | 'strecken' = 'regeln') {
  segmented($('help-tabs'), (['regeln', 'tiere', 'strecken'] as const).map((k) => [k, T.help.tabs[k]]), tab, (v) => buildHelp(v));
  const body = $('help-body');
  if (tab === 'regeln') {
    body.innerHTML = T.help.rules.map(([h, txt]) => `<h3>${h}</h3><p>${txt}</p>`).join('');
  } else if (tab === 'tiere') {
    body.innerHTML = ANIMALS.map((a) => {
      const [strength, tip] = T.help.animals[a.id];
      const [powerName] = T.powers[a.power];
      return `<h3>${a.icon} ${a.name} <small>· ${T.species[a.species]} · ${powerName}</small></h3><p>${strength}<br><b>${T.help.tip}:</b> ${tip}</p>`;
    }).join('');
  } else {
    body.innerHTML = TRACKS.map((t, i) => {
      const [special, shortcut] = T.help.tracks[t.id];
      return `<h3>${i + 1}. ${t.name} <small>· ${t.subtitle}</small></h3><p>${special}<br><b>${T.help.shortcut}:</b> ${shortcut}</p>`;
    }).join('');
  }
  body.scrollTop = 0;
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
          `<tr class="${r.animal === me ? 'me' : ''}"><td>${r.place}.</td><td>${names[r.animal]} <small>(${r.animal === me ? T.results.you : r.human ? T.results.player : T.results.computer})</small></td><td class="mono">${r.estimated ? '≈ ' : ''}${formatTime(r.time)}</td><td class="mono">${formatTime(r.bestLap)}</td></tr>`,
      )
      .join('');
}
