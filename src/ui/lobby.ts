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
      const ready = p.host ? '' : p.ready ? `<td class="ok">✓ ${T.mp.ready}</td>` : `<td class="wait">${T.mp.notReady}</td>`;
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
        <div class="opt" id="lobby-track-row"><span>${T.mp.track}</span><select id="lobby-track">${TRACKS.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}</select></div>
        <div class="opt" id="lobby-cup-row"><span>${T.mp.cup}</span><select id="lobby-cup">${CUPS.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</select></div>
        <div class="opt"><span>${T.mp.level}</span><div id="lobby-level" class="seg"></div></div>`;
      segmented($('lobby-mode'), (['einzel', 'cup'] as GameMode[]).map((m) => [m, T.mp.modes[m]]), l.mode, (v) => mp.setSettings({ mode: v }));
      segmented($('lobby-level'), (['leicht', 'mittel', 'schwer'] as AiLevel[]).map((v) => [v, T.difficulty[v]]), l.level, (v) => mp.setSettings({ level: v }));
      $<HTMLSelectElement>('lobby-track').addEventListener('change', (e) => mp.setSettings({ track: (e.target as HTMLSelectElement).value }));
      $<HTMLSelectElement>('lobby-cup').addEventListener('change', (e) => mp.setSettings({ cup: (e.target as HTMLSelectElement).value }));
    }
    $<HTMLSelectElement>('lobby-track').value = l.track;
    $<HTMLSelectElement>('lobby-cup').value = l.cup;
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
