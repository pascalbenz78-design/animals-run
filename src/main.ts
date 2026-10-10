/**
 * Einstiegspunkt: verbindet Simulation, Darstellung, Eingabe, Menüs und Mehrspieler.
 * Die Simulation läuft mit fester Rate (SIM_HZ), die Darstellung interpoliert dazwischen.
 * Jedes Rennen entsteht aus einem «Renn-Aufbau» (RaceSetup) – allein, als Gastgeber oder als Mitspieler.
 */
import './ui/style.css';
import { RACE, SIM_DT } from './config/balance';
import { T } from './config/texts';
import { ANIMALS, getAnimal } from './animals/animals';
import { AiDriver } from './game/ai';
import { startPower } from './game/powers';
import { RaceSim } from './game/simulation';
import { Track } from './game/track';
import type { AiLevel, Entrant, Input } from './game/types';
import { InputManager, isTouchDevice } from './input/input';
import { Multiplayer } from './net/mp';
import { normalizeCode } from './net/peer';
import type { CupInfo, RaceSetup } from './net/protocol';
import { ClientRaceSync, HostRaceSync } from './net/raceSync';
import { RaceView } from './render/raceView';
import { GameRenderer } from './render/renderer';
import { TrackView, type Quality } from './render/trackView';
import { Ceremony } from './render/ceremony';
import { CUPS, getTrack, TRACKS } from './tracks';
import { settings, submitCup, submitTime, updateSettings } from './storage';
import { Hud } from './ui/hud';
import { renderLobby } from './ui/lobby';
import {
  applyTexts,
  buildAnimalPicker,
  stopAnimalPreview,
  buildControlsTable,
  buildCupCards,
  buildHelp,
  buildResults,
  buildStandings,
  buildTrackCards,
  type StandingRow,
  segmented,
  showHud,
  showScreen,
  type ScreenName,
} from './ui/menus';

type AppState = 'menu' | 'loading' | 'race' | 'paused' | 'results' | 'ceremony';

/** Laufender Cup: gleiche Gegner in allen Rennen, Punkte werden zusammengezählt */
interface CupState extends CupInfo {
  roster: string[];
}

type NetRole = { role: 'host'; sync: HostRaceSync } | { role: 'client'; sync: ClientRaceSync };

interface Session {
  trackId: string;
  sim: RaceSim;
  trackView: TrackView;
  view: RaceView;
  drivers: AiDriver[];
  hud: Hud | null;
  /** Index des menschlichen Tiers, −1 im Demo-Rennen */
  me: number;
  demo: boolean;
  names: string[];
  net: NetRole | null;
}

const params = new URLSearchParams(location.search);
/** Testhilfe: ?test lässt den Computer auch das Spieler-Tier steuern, ?timescale=4 beschleunigt. */
const TEST_AUTOPILOT = params.has('test');
const TIMESCALE = Math.max(0.1, Number(params.get('timescale') ?? 1));

const gr = new GameRenderer(document.getElementById('game')!, settings().quality);
const input = new InputManager();
input.autoRun = settings().autoRun;

let state: AppState = 'menu';
let screenNow: ScreenName = 'title';
let session: Session | null = null;
let accumulator = 0;
let lastFrame = performance.now();
let elapsed = 0;
let choice = {
  animal: settings().lastAnimal,
  track: settings().lastTrack,
  level: 'mittel' as AiLevel,
  mode: 'einzel' as 'einzel' | 'cup' | 'mp',
  cup: CUPS[0].id,
};
let cup: CupState | null = null;
let ceremony: Ceremony | null = null;
let optionsReturn: ScreenName = 'main';
let mp: Multiplayer | null = null;
/** Mitspieler: Cup-Wertung vom Gastgeber, falls sie vor dem eigenen Rennende ankommt */
let pendingCupInfo: CupInfo | null = null;

const $ = (id: string) => document.getElementById(id)!;

// ---------------------------------------------------------------------------
// Rennen aufbauen

/** Computergegner: zufällig aus den übrigen Tieren, jedes Tier nur einmal pro Rennen */
function pickOpponents(exclude: string[]): string[] {
  const pool = ANIMALS.map((a) => a.id).filter((id) => !exclude.includes(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, RACE.animalsPerRace - exclude.length);
}

function makeEntrants(humans: string[], opponents: string[], level: AiLevel): Entrant[] {
  return [...humans.map((id) => ({ animalId: id, human: true, aiLevel: level })), ...opponents.map((id) => ({ animalId: id, human: false, aiLevel: level }))];
}

function cupInfo(c: CupState | null): CupInfo | null {
  return c ? { id: c.id, name: c.name, tracks: c.tracks, index: c.index, points: c.points, gained: c.gained } : null;
}

function buildSession(setup: RaceSetup, myAnimal: string | null, demo: boolean): Session {
  disposeSession();
  const data = getTrack(setup.trackId);
  const track = new Track(data);
  const sim = new RaceSim(track, setup.entrants, setup.laps, setup.seed);
  const trackView = new TrackView(track, sim, gr.quality);
  gr.scene.add(trackView.group);
  gr.applyTheme(data.theme);
  const view = new RaceView(gr, sim, trackView);
  const me = myAnimal ? sim.animals.findIndex((a) => a.animalId === myAnimal) : -1;
  const drivers = sim.animals.map((_, i) => new AiDriver(i, setup.seed));
  view.mode = demo ? 'orbit' : 'chase';
  view.focus = me >= 0 ? me : 0;
  // Namen: Tiername, bei Mitspielern mit Spielername
  const names = sim.animals.map((a) => {
    const base = getAnimal(a.animalId).name;
    const h = setup.humans.find((x) => x.animal === a.animalId);
    const p = h && mp?.lobby.players.find((x) => x.id === h.playerId);
    return p && a.id !== me ? `${base} · ${p.name}` : base;
  });
  if (demo) {
    // Demo startet mitten im Rennen
    sim.time = 0;
    sim.phase = 'running';
  }
  accumulator = 0;
  return { trackId: setup.trackId, sim, trackView, view, drivers, hud: me >= 0 ? new Hud(sim, me, setup.trackId) : null, me, demo, names, net: null };
}

function disposeSession() {
  if (!session) return;
  session.view.dispose();
  gr.scene.remove(session.trackView.group);
  session.trackView.dispose();
  session = null;
}

function startDemo() {
  // Im Hintergrund des Titelbilds läuft ein Rennen auf einer zufälligen Strecke
  const id = TRACKS[Math.floor(Math.random() * TRACKS.length)].id;
  const seed = Math.floor(Math.random() * 1e6);
  session = buildSession({ trackId: id, laps: 99, seed, entrants: makeEntrants([], pickOpponents([]), 'mittel'), humans: [], cup: null }, null, true);
}

/** Ladebildschirm zeigen und das Rennen aus dem Aufbau starten */
function startFromSetup(setup: RaceSetup, role: 'local' | 'host' | 'client') {
  state = 'loading';
  const data = getTrack(setup.trackId);
  $('loading-name').textContent = data.name;
  const [special, shortcut] = T.help.tracks[setup.trackId];
  $('loading-tip').textContent = `💡 ${special} ${T.help.shortcut}: ${shortcut}`;
  const c = setup.cup;
  $('loading-sub').textContent = c ? `${c.name} · ${T.cup.race} ${c.index + 1}/${c.tracks.length}` : data.subtitle;
  showScreen('loading');
  screenNow = 'loading';
  showHud(false);
  stopAnimalPreview();
  // Kurz warten, damit der Ladebildschirm sichtbar wird
  setTimeout(() => {
    const s = buildSession(setup, choice.animal, false);
    if (role === 'host' && mp) {
      const humans = setup.humans.map((h) => ({ playerId: h.playerId, index: s.sim.animals.findIndex((a) => a.animalId === h.animal) }));
      s.net = { role: 'host', sync: new HostRaceSync(s.sim, s.me, humans, (pid, text) => mp?.sendTo(pid, text)) };
    } else if (role === 'client' && mp) {
      const sync = new ClientRaceSync(s.sim, s.me, (seq, b) => mp?.sendInput(seq, b));
      s.net = { role: 'client', sync };
      s.view.offsets = sync.offsets;
    }
    session = s;
    s.view.resetCamera();
    state = 'race';
    showScreen('none');
    screenNow = 'none';
    showHud(true);
    $('netinfo').classList.toggle('hidden', !mp);
    input.clear();
  }, 60);
}

/** Allein: Einzelrennen oder nächstes Cup-Rennen */
function startRace() {
  if (mp) return startMpRace();
  updateSettings({ lastAnimal: choice.animal, lastTrack: choice.track });
  const trackId = cup ? cup.tracks[cup.index] : choice.track;
  const opponents = cup ? cup.roster : pickOpponents([choice.animal]);
  const seed = Math.floor(Math.random() * 1e6);
  startFromSetup({ trackId, laps: RACE.laps, seed, entrants: makeEntrants([choice.animal], opponents, choice.level), humans: [], cup: cupInfo(cup) }, 'local');
}

function newCup(cupId: string, humans: string[]): CupState {
  const def = CUPS.find((c) => c.id === cupId) ?? CUPS[0];
  const roster = pickOpponents(humans);
  const points: Record<string, number> = {};
  for (const id of [...humans, ...roster]) points[id] = 0;
  return { id: def.id, name: def.name, tracks: def.tracks, index: 0, roster, points, gained: {} };
}

function startCup() {
  cup = newCup(choice.cup, [choice.animal]);
  startRace();
}

/** Gastgeber: Rennen für alle aufbauen und starten */
function startMpRace() {
  if (!mp || !mp.isHost) return;
  const l = mp.lobby;
  const players = l.players.filter((p) => p.connected && p.animal);
  const humans = players.map((p) => ({ playerId: p.id, animal: p.animal! }));
  choice.animal = mp.me?.animal ?? choice.animal;
  if (l.mode === 'cup') {
    if (!cup) cup = newCup(l.cup, humans.map((h) => h.animal));
  } else cup = null;
  const opponents = cup ? cup.roster : pickOpponents(humans.map((h) => h.animal));
  const setup: RaceSetup = {
    trackId: cup ? cup.tracks[cup.index] : l.track,
    laps: RACE.laps,
    seed: Math.floor(Math.random() * 1e6),
    entrants: makeEntrants(
      humans.map((h) => h.animal),
      opponents,
      l.level,
    ),
    humans,
    cup: cupInfo(cup),
  };
  mp.sendStart(setup);
  startFromSetup(setup, 'host');
}

function cupRows(): StandingRow[] {
  if (!cup) return [];
  const humanNames = new Map((mp?.setup?.humans ?? []).map((h) => [h.animal, mp?.lobby.players.find((p) => p.id === h.playerId)?.name ?? '']));
  return Object.keys(cup.points).map((id) => {
    const extra = humanNames.get(id);
    return { name: getAnimal(id).name + (extra && id !== choice.animal ? ` · ${extra}` : ''), me: id === choice.animal, points: cup!.points[id], gained: cup!.gained[id] ?? 0 };
  });
}

function showCupBox() {
  $('cup-box').classList.toggle('hidden', !cup);
  if (cup) buildStandings('cup-table', cupRows());
}

function finishRace() {
  if (!session) return;
  state = 'results';
  const s = session;
  const me = s.sim.animals[s.me];
  const isRecord = me.finished ? submitTime(s.trackId, me.animalId, me.finishTime, me.bestLap) : false;
  const results = s.sim.results();
  buildResults(results, s.names, s.me, isRecord);
  const role = s.net?.role ?? 'local';
  if (role !== 'client' && cup) {
    // Punkte verteilen: 15 – 12 – 10 – 8 – 6 – 4 – 2 – 1
    cup.gained = {};
    for (const r of results) {
      const pts = RACE.cupPoints[r.place - 1] ?? 0;
      cup.points[r.animalId] = (cup.points[r.animalId] ?? 0) + pts;
      cup.gained[r.animalId] = pts;
    }
  }
  if (role === 'host') mp?.sendResults(cupInfo(cup));
  if (role === 'client') {
    // Cup-Wertung kommt vom Gastgeber (evtl. erst kurz danach)
    cup = pendingCupInfo ? { ...pendingCupInfo, roster: [] } : null;
  }
  const title = $('results-title');
  title.textContent = cup ? `${T.cup.race} ${cup.index + 1}/${cup.tracks.length} · ${getTrack(s.trackId).name}` : T.results.title;
  showCupBox();
  // Knöpfe je nach Rolle
  const btnMenu = $('btn-results-menu');
  const btnAgain = $('btn-again');
  const btnNext = $('btn-next');
  $('results-wait').classList.toggle('hidden', role !== 'client');
  btnMenu.textContent = role === 'host' ? T.mp.toLobby : role === 'client' ? T.mp.leave : T.results.menu;
  btnAgain.classList.toggle('hidden', !!cup || role === 'client');
  btnNext.classList.toggle('hidden', !cup || role === 'client');
  if (cup) btnNext.textContent = cup.index + 1 < cup.tracks.length ? T.cup.next : T.cup.ceremony;
  showScreen('results');
  screenNow = 'results';
}

function nextCupRace() {
  if (!cup) return;
  cup.index++;
  if (cup.index < cup.tracks.length) startRace();
  else {
    if (mp?.isHost) mp.sendCeremony(cupInfo(cup)!);
    startCeremony();
  }
}

/** Siegerehrung: die drei Besten auf dem Podest */
function startCeremony() {
  if (!cup) return;
  disposeSession();
  state = 'ceremony';
  showHud(false);
  const order = Object.keys(cup.points).sort((a, b) => cup!.points[b] - cup!.points[a]);
  ceremony = new Ceremony(gr, order.slice(0, 3));
  const myPlace = order.indexOf(choice.animal) + 1;
  submitCup(cup.id, choice.animal, myPlace);
  cup.gained = {};
  buildStandings('ceremony-table', cupRows());
  $('ceremony-title').textContent = `${T.cup.title} · ${cup.name}`;
  $('ceremony-you').textContent = `${T.cup.youPlace} ${myPlace}!`;
  $('btn-ceremony-menu').textContent = mp ? (mp.isHost ? T.mp.toLobby : T.mp.leave) : T.results.menu;
  showScreen('ceremony');
  screenNow = 'ceremony';
}

// ---------------------------------------------------------------------------
// Hauptschleife

function frame(now: number) {
  requestAnimationFrame(frame);
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  dt = Math.min(dt, 0.1);
  elapsed += dt;
  updateFps(dt);

  if (ceremony) ceremony.update(dt);
  else if (session && state !== 'paused' && state !== 'loading') simulate(dt);
  gr.render(elapsed);
}

/** Simulation um dt weiterrechnen und den Frame vorbereiten. */
function simulate(dt: number) {
  if (!session) return;
  const s = session;
  accumulator += dt * TIMESCALE;
  let steps = 0;
  const handle = (e: Parameters<Hud['handleEvent']>[0]) => {
    s.hud?.handleEvent(e);
    s.view.handleEvent(e);
  };
  while (accumulator >= SIM_DT && steps < 20 * TIMESCALE) {
    const local = TEST_AUTOPILOT && s.me >= 0 ? s.drivers[s.me].think(s.sim) : input.sample();
    if (s.net?.role === 'client') {
      // Mitspieler: eigenes Tier vorausrechnen, Ereignisse kommen vom Gastgeber
      for (const e of s.net.sync.step(local, s.drivers)) handle(e);
    } else {
      let inputs: Input[];
      if (s.net?.role === 'host') inputs = s.net.sync.inputs(local, s.drivers, false);
      else
        inputs = s.sim.animals.map((a, i) => {
          if (a.human && !a.finished && i === s.me) return local;
          return s.drivers[i].think(s.sim);
        });
      s.sim.step(inputs);
      const ev = s.sim.drainEvents();
      for (const e of ev) handle(e);
      if (s.net?.role === 'host') s.net.sync.afterStep(ev);
    }
    accumulator -= SIM_DT;
    steps++;
  }
  if (accumulator > SIM_DT) accumulator = 0; // zu langsames Gerät: nicht aufholen
  if (s.demo) {
    // Kamera folgt dem Führenden
    const leader = s.sim.animals.find((a) => a.place === 1);
    if (leader && leader.id !== s.view.focus && Math.floor(elapsed) % 12 === 0) s.view.focus = leader.id;
  }
  s.view.update(accumulator / SIM_DT, dt, elapsed);
  s.hud?.update(dt);
  if (mp && !s.demo) {
    const others = mp.lobby.players.filter((p) => !p.host && p.connected).length;
    $('netinfo').textContent = mp.isHost ? `${T.mp.host} · ${others} ${T.mp.players}` : `${T.mp.ping} ${mp.ping >= 0 ? mp.ping + ' ms' : '–'}`;
  }
  if (state === 'race' && s.sim.phase === 'done') finishRace();
}

// FPS-Anzeige mit ?fps
const fpsEl = $('fps');
const showFps = params.has('fps');
fpsEl.classList.toggle('hidden', !showFps);
let fpsAcc = 0;
let fpsFrames = 0;
function updateFps(dt: number) {
  if (!showFps) return;
  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc >= 0.5) {
    fpsEl.textContent = `${Math.round(fpsFrames / fpsAcc)} fps · ${gr.renderer.info.render.calls} Draw-Calls`;
    fpsAcc = 0;
    fpsFrames = 0;
  }
}

// ---------------------------------------------------------------------------
// Menüs

function go(screen: ScreenName) {
  // Tierwahl im Mehrspieler: «Weiter» und «Zurück» führen in die Lobby
  if (choice.mode === 'mp' && screenNow === 'animal' && (screen === 'track' || screen === 'main')) {
    if (screen === 'track') mp?.pick(choice.animal);
    screen = 'lobby';
  }
  if (screen === 'animal') {
    const taken = mp ? mp.lobby.players.filter((p) => p.id !== mp!.myId && p.animal).map((p) => p.animal!) : [];
    if (taken.includes(choice.animal)) choice.animal = ANIMALS.find((a) => !taken.includes(a.id))!.id;
    buildAnimalPicker(choice.animal, (id) => (choice.animal = id), taken);
  } else stopAnimalPreview();
  if (screen === 'track') {
    const title = $('track-title');
    if (choice.mode === 'cup') {
      title.textContent = T.menu.chooseCup;
      buildCupCards(choice.cup, (id) => (choice.cup = id));
    } else {
      title.textContent = T.menu.chooseTrack;
      buildTrackCards(choice.track, (id) => (choice.track = id));
    }
    segmented(
      $('difficulty'),
      (['leicht', 'mittel', 'schwer'] as AiLevel[]).map((l) => [l, T.difficulty[l]]),
      choice.level,
      (v) => (choice.level = v),
    );
  }
  if (screen === 'options') buildOptions();
  if (screen === 'help') buildHelp();
  if (screen === 'mp') {
    ($('mp-name') as HTMLInputElement).value = settings().playerName;
    $('mp-status').textContent = '';
  }
  if (screen === 'lobby' && mp) renderLobby(mp);
  showScreen(screen);
  screenNow = screen;
}

function buildOptions() {
  const s = settings();
  segmented<Quality>(
    $('opt-quality'),
    (['hoch', 'mittel', 'niedrig'] as Quality[]).map((q) => [q, T.options.qualityValues[q]]),
    s.quality,
    (q) => {
      updateSettings({ quality: q });
      gr.setQuality(q);
      // Dekoration und Schatten neu aufbauen
      if (session?.demo) startDemo();
    },
  );
  segmented($('opt-autorun'), [['1', T.options.on], ['0', T.options.off]], s.autoRun ? '1' : '0', (v) => {
    updateSettings({ autoRun: v === '1' });
    input.autoRun = v === '1';
    applyBodyFlags();
  });
  segmented($('opt-hints'), [['1', T.options.on], ['0', T.options.off]], s.controlHints ? '1' : '0', (v) => {
    updateSettings({ controlHints: v === '1' });
    applyBodyFlags();
  });
}

function applyBodyFlags() {
  const s = settings();
  document.body.classList.toggle('autorun', s.autoRun);
  $('t-run').textContent = s.autoRun ? T.hud.brake : T.hud.run;
  const touch = isTouchDevice();
  $('touch').classList.toggle('hidden', !touch);
  $('key-hints').classList.toggle('hidden', touch || !s.controlHints);
}

function togglePause() {
  // Im Mehrspieler läuft das Rennen weiter – nur das Menü wird gezeigt
  if (mp) {
    if (state !== 'race') return;
    const open = screenNow === 'pause';
    showScreen(open ? 'none' : 'pause');
    screenNow = open ? 'none' : 'pause';
    $('btn-restart').classList.add('hidden');
    return;
  }
  $('btn-restart').classList.remove('hidden');
  if (state === 'race') {
    state = 'paused';
    showScreen('pause');
    screenNow = 'pause';
  } else if (state === 'paused') {
    state = 'race';
    showScreen('none');
    screenNow = 'none';
    input.clear();
  }
}

function toMenu() {
  if (mp) {
    mp.leave();
    mp = null;
  }
  state = 'menu';
  cup = null;
  pendingCupInfo = null;
  if (choice.mode === 'mp') choice.mode = 'einzel';
  if (ceremony) {
    ceremony.dispose();
    ceremony = null;
  }
  showHud(false);
  startDemo();
  go('main');
}

/** Zurück in die Lobby (nach einem Rennen im Mehrspieler) */
function enterLobby() {
  state = 'menu';
  cup = null;
  pendingCupInfo = null;
  if (ceremony) {
    ceremony.dispose();
    ceremony = null;
  }
  showHud(false);
  if (!session?.demo) startDemo();
  go('lobby');
}

let noticeTimer = 0;
function notice(text: string) {
  const el = $('notice');
  el.textContent = text;
  el.className = '';
  void el.offsetWidth;
  el.className = 'show';
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (el.className = ''), 4600);
}

// ---------------------------------------------------------------------------
// Mehrspieler

function makeMultiplayer(): Multiplayer {
  return new Multiplayer({
    lobby: () => {
      if (screenNow === 'lobby' && mp) renderLobby(mp);
    },
    startRace: (setup) => {
      const mine = setup.humans.find((h) => h.playerId === mp?.myId);
      if (mine) choice.animal = mine.animal;
      cup = setup.cup ? { ...setup.cup, roster: [] } : null;
      pendingCupInfo = null;
      if (ceremony) {
        ceremony.dispose();
        ceremony = null;
      }
      startFromSetup(setup, 'client');
    },
    snapshot: (msg) => {
      if (session?.net?.role === 'client') session.net.sync.onSnapshot(msg.s, msg.ack, msg.ev);
    },
    input: (pid, seq, b) => {
      if (session?.net?.role === 'host') session.net.sync.setInput(pid, seq, b);
    },
    connection: (pid, connected, oldId) => {
      if (session?.net?.role !== 'host') return;
      if (oldId) session.net.sync.rebind(oldId, pid);
      session.net.sync.setConnected(pid, connected);
    },
    results: (info) => {
      pendingCupInfo = info;
      if (state === 'results' && info) {
        cup = { ...info, roster: [] };
        $('results-title').textContent = `${T.cup.race} ${info.index + 1}/${info.tracks.length} · ${session ? getTrack(session.trackId).name : ''}`;
        showCupBox();
      }
    },
    ceremony: (info) => {
      cup = { ...info, roster: [] };
      startCeremony();
    },
    toLobby: () => enterLobby(),
    notice: (text) => notice(text),
    leave: (reason) => {
      toMenu();
      notice(reason);
    },
  });
}

function playerName(): string {
  const raw = ($('mp-name') as HTMLInputElement).value.trim().slice(0, 14);
  const name = raw || 'Spieler';
  updateSettings({ playerName: raw });
  return name;
}

function mpStatus(text: string, ok = false) {
  const el = $('mp-status');
  el.textContent = text;
  el.classList.toggle('ok', ok);
}

async function createRoom() {
  mpStatus(T.mp.creating, true);
  mp?.leave();
  mp = makeMultiplayer();
  try {
    await mp.create(playerName());
    choice.mode = 'mp';
    mp.pick(choice.animal);
    go('lobby');
  } catch (e) {
    mp = null;
    mpStatus((e as Error).message);
  }
}

async function joinRoom() {
  const code = normalizeCode(($('mp-code') as HTMLInputElement).value);
  if (code.length !== 4) return mpStatus(T.mp.errCode);
  mpStatus(T.mp.connecting, true);
  mp?.leave();
  mp = makeMultiplayer();
  try {
    await mp.join(code, playerName());
    choice.mode = 'mp';
    go('lobby');
  } catch (e) {
    mp?.leave();
    mp = null;
    mpStatus((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Bedienelemente

function setupUi() {
  applyTexts();
  buildControlsTable();
  applyBodyFlags();
  document.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go as ScreenName)));
  $('scr-title').addEventListener('click', () => go('main'));
  window.addEventListener('keydown', (e) => {
    if (!$('scr-title').classList.contains('hidden') && e.code !== 'Escape') go('main');
  });
  $('btn-start').addEventListener('click', () => (choice.mode === 'cup' ? startCup() : startRace()));
  $('btn-single').addEventListener('click', () => {
    choice.mode = 'einzel';
    go('animal');
  });
  $('btn-cup').addEventListener('click', () => {
    choice.mode = 'cup';
    go('animal');
  });
  $('btn-next').addEventListener('click', nextCupRace);
  $('btn-ceremony-menu').addEventListener('click', () => (mp?.isHost ? (mp.backToLobby(), enterLobby()) : toMenu()));
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-resume').addEventListener('click', togglePause);
  $('btn-restart').addEventListener('click', startRace);
  $('btn-quit').addEventListener('click', toMenu);
  $('btn-pause-options').addEventListener('click', () => {
    optionsReturn = 'pause';
    go('options');
  });
  $('btn-options-back').addEventListener('click', () => {
    showScreen(optionsReturn);
    screenNow = optionsReturn;
    optionsReturn = 'main';
  });
  document.querySelectorAll('[data-go="options"]').forEach((b) => b.addEventListener('click', () => (optionsReturn = 'main')));
  $('btn-again').addEventListener('click', startRace);
  $('btn-results-menu').addEventListener('click', () => {
    if (mp?.isHost) {
      mp.backToLobby();
      enterLobby();
    } else toMenu();
  });
  // Mehrspieler
  $('btn-mp-create').addEventListener('click', createRoom);
  $('btn-mp-join').addEventListener('click', joinRoom);
  $('mp-code').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') joinRoom();
  });
  $('btn-lobby-leave').addEventListener('click', toMenu);
  $('btn-lobby-animal').addEventListener('click', () => go('animal'));
  $('btn-lobby-ready').addEventListener('click', () => {
    if (!mp) return;
    if (mp.isHost) {
      if (mp.canStart()) startMpRace();
    } else mp.setReady(!mp.me?.ready);
  });
  input.onPause = togglePause;

  // Touch-Tasten
  input.bindTouchButton($('t-left'), 'links');
  input.bindTouchButton($('t-right'), 'rechts');
  input.bindTouchButton($('t-jump'), 'springen');
  input.bindTouchButton($('t-run'), 'vorwaerts');
  input.bindTouchButton($('t-power'), 'superkraft');

  // Vollbild (Handy): danach Querformat sperren, falls möglich
  document.querySelectorAll('.fs-btn').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
        } else await document.exitFullscreen();
      } catch {
        // Vollbild nicht unterstützt
      }
    }),
  );
  // Seite im Hintergrund: Rennen pausieren (nicht im Mehrspieler)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'race' && !mp) togglePause();
  });
}

setupUi();
startDemo();
showScreen('title');
requestAnimationFrame(frame);

// Für automatisierte Tests im Browser
(window as unknown as { __game: unknown }).__game = {
  get state() {
    return state;
  },
  get session() {
    return session;
  },
  get mp() {
    return mp;
  },
  /** Testhilfe: Spiel ohne Bildschirm-Takt um `seconds` vorspulen und ein Bild zeichnen. */
  advance: (seconds: number) => {
    const steps = Math.round(seconds * 30);
    for (let i = 0; i < steps; i++) {
      elapsed += 1 / 30;
      simulate(1 / 30);
    }
    gr.render(elapsed);
    return session ? { time: session.sim.time, phase: session.sim.phase } : null;
  },
  /** Testhilfe: Superkraft des eigenen Tiers sofort auslösen. */
  usePower: () => {
    if (!session || session.me < 0) return;
    const a = session.sim.animals[session.me];
    a.icons = 0;
    startPower(session.sim, a);
  },
  startCup: (animal = 'lenni', cupId = 'pfoten') => {
    choice = { ...choice, animal, cup: cupId, mode: 'cup' };
    startCup();
  },
  /** Testhilfe: aktuelles Rennen sofort beenden (alle Tiere im Ziel) */
  finishNow: () => {
    if (!session) return;
    for (const a of session.sim.animals) {
      if (!a.finished) {
        a.finished = true;
        a.finishTime = session.sim.time + a.id;
      }
    }
    session.sim.phase = 'done';
  },
  nextCupRace: () => nextCupRace(),
  startRace: (animal = 'lenni', track = 'bauernhof') => {
    choice = { ...choice, animal, track, mode: 'einzel' };
    cup = null;
    startRace();
  },
};
