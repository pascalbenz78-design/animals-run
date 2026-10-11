/** Lobby-Anzeige im Mehrspieler: Spieler, Einstellungen, Bereit/Start. */
import { T } from '../config/texts';
import { getAnimal } from '../animals/animals';
import type { AiLevel } from '../game/types';
import type { Multiplayer } from '../net/mp';
import type { GameMode } from '../net/protocol';
import { CUPS, TRACKS } from '../tracks';
import { segmented } from './menus';

const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

export function renderLobby(mp: Multiplayer) {
  const l = mp.lobby;
  $('lobby-code').textContent = l.code;
  // Spielerliste
  $('lobby-players').innerHTML = l.players
    .map((p) => {
      const animal = p.animal ? `${getAnimal(p.animal).icon} ${getAnimal(p.animal).name}` : `<i>${T.mp.choosing}</i>`;
      const role = p.host ? ` <small>(${T.mp.host})</small>` : '';
      const me = p.id === mp.myId ? ` <small>(${T.mp.you})</small>` : '';
      const ready = !p.connected
        ? `<td class="wait">${T.mp.disconnected}</td>`
        : p.host
          ? ''
          : p.ready
            ? `<td class="ok">✓ ${T.mp.ready}</td>`
            : `<td class="wait">${T.mp.notReady}</td>`;
      const ping = p.host ? '' : p.ping >= 0 ? `${p.ping} ms` : '';
      return `<tr class="${p.id === mp.myId ? 'me' : ''}"><td><b>${escapeHtml(p.name)}</b>${role}${me}</td><td>${animal}</td>${ready || '<td></td>'}<td class="mono">${ping}</td></tr>`;
    })
    .join('');

  // Einstellungen: Gastgeber kann ändern, Mitspieler sehen sie
  const box = $('lobby-settings');
  if (mp.isHost) {
    if (!box.dataset.built) {
      box.dataset.built = '1';
      box.innerHTML = `
        <div class="opt"><span>${T.mp.mode}</span><div id="lobby-mode" class="seg"></div></div>
        <div class="opt stack" id="lobby-track-row"><span>${T.mp.track}</span><div id="lobby-track" class="chips">${TRACKS.map((t) => `<button data-v="${t.id}">${t.name}</button>`).join('')}</div></div>
        <div class="opt stack" id="lobby-cup-row"><span>${T.mp.cup}</span><div id="lobby-cup" class="chips">${CUPS.map((c) => `<button data-v="${c.id}">${c.icon} ${c.name}</button>`).join('')}</div></div>
        <div class="opt"><span>${T.mp.level}</span><div id="lobby-level" class="seg"></div></div>`;
      segmented($('lobby-mode'), (['einzel', 'cup'] as GameMode[]).map((m) => [m, T.mp.modes[m]]), l.mode, (v) => mp.setSettings({ mode: v }));
      segmented($('lobby-level'), (['leicht', 'mittel', 'schwer'] as AiLevel[]).map((v) => [v, T.difficulty[v]]), l.level, (v) => mp.setSettings({ level: v }));
      // Strecken und Cups als Knöpfe (eine Auswahlliste würde bei jeder Lobby-Aktualisierung zuklappen)
      chips($('lobby-track'), (v) => mp.setSettings({ track: v }));
      chips($('lobby-cup'), (v) => mp.setSettings({ cup: v }));
    }
    markChip($('lobby-track'), l.track);
    markChip($('lobby-cup'), l.cup);
    $('lobby-track-row').classList.toggle('hidden', l.mode !== 'einzel');
    $('lobby-cup-row').classList.toggle('hidden', l.mode !== 'cup');
  } else {
    delete box.dataset.built;
    const what =
      l.mode === 'cup' ? `${T.mp.cup}: ${CUPS.find((c) => c.id === l.cup)?.name ?? ''}` : `${T.mp.track}: ${TRACKS.find((t) => t.id === l.track)?.name ?? ''}`;
    box.innerHTML = `
      <div class="opt"><span>${T.mp.mode}</span><b>${T.mp.modes[l.mode]}</b></div>
      <div class="opt"><span>${what.split(':')[0]}</span><b>${what.split(':')[1]}</b></div>
      <div class="opt"><span>${T.mp.level}</span><b>${T.difficulty[l.level]}</b></div>`;
  }

  // Knöpfe und Status
  const me = mp.me;
  const btn = $<HTMLButtonElement>('btn-lobby-ready');
  const status = $('lobby-status');
  if (mp.isHost) {
    btn.textContent = T.mp.start;
    btn.disabled = !mp.canStart();
    status.textContent = mp.canStart() ? T.mp.hostHidden : T.mp.waitAll;
  } else {
    btn.textContent = me?.ready ? T.mp.unready : T.mp.setReady;
    btn.disabled = !me?.animal;
    status.textContent = me?.ready ? T.mp.waitHost : '';
  }
}

function chips(el: HTMLElement, onPick: (v: string) => void) {
  el.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
    b.addEventListener('click', () => {
      markChip(el, b.dataset.v!);
      onPick(b.dataset.v!);
    }),
  );
}

function markChip(el: HTMLElement, value: string) {
  el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === value));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
