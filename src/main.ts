/**
 * Einstiegspunkt: verbindet Simulation, Darstellung, Eingabe und Menüs.
 * Die Simulation läuft mit fester Rate (SIM_HZ), die Darstellung interpoliert dazwischen.
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
import { RaceView } from './render/raceView';
import { GameRenderer } from './render/renderer';
import { TrackView, type Quality } from './render/trackView';
import { Ceremony } from './render/ceremony';
import { CUPS, getTrack, TRACKS } from './tracks';
import { settings, submitCup, submitTime, updateSettings } from './storage';
import { Hud } from './ui/hud';
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
interface CupState {
  id: string;
  name: string;
  tracks: string[];
  index: number;
  roster: string[];
  points: Record<string, number>;
  /** Punkte aus dem letzten Rennen */
  gained: Record<string, number>;
}

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
}

const params = new URLSearchParams(location.search);
/** Testhilfe: ?test lässt den Computer auch das Spieler-Tier steuern, ?timescale=4 beschleunigt. */
const TEST_AUTOPILOT = params.has('test');
const TIMESCALE = Math.max(0.1, Number(params.get('timescale') ?? 1));

const gr = new GameRenderer(document.getElementById('game')!, settings().quality);
const input = new InputManager();
input.autoRun = settings().autoRun;

let state: AppState = 'menu';
let session: Session | null = null;
let accumulator = 0;
let lastFrame = performance.now();
let elapsed = 0;
let choice = {
  animal: settings().lastAnimal,
  track: settings().lastTrack,
  level: 'mittel' as AiLevel,
  mode: 'einzel' as 'einzel' | 'cup',
  cup: CUPS[0].id,
};
let cup: CupState | null = null;
let ceremony: Ceremony | null = null;
let optionsReturn: ScreenName = 'main';

// ---------------------------------------------------------------------------
// Rennen aufbauen

/** Computergegner: zufällig aus den übrigen Tieren, jedes Tier nur einmal pro Rennen */
function pickOpponents(humanAnimal: string | null): string[] {
  const pool = ANIMALS.map((a) => a.id).filter((id) => id !== humanAnimal);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, RACE.animalsPerRace - (humanAnimal ? 1 : 0));
}

function buildSession(trackId: string, humanAnimal: string | null, level: AiLevel, demo: boolean, opponents?: string[]): Session {
  disposeSession();
  const data = getTrack(trackId);
  const track = new Track(data);
  const entrants: Entrant[] = [];
  if (humanAnimal) entrants.push({ animalId: humanAnimal, human: true, aiLevel: level });
  for (const id of opponents ?? pickOpponents(humanAnimal)) {
    if (entrants.length >= RACE.animalsPerRace) break;
    entrants.push({ animalId: id, human: false, aiLevel: level });
  }
  const seed = Math.floor(Math.random() * 1e6);
  const sim = new RaceSim(track, entrants, demo ? 99 : RACE.laps, seed);
  const trackView = new TrackView(track, sim, gr.quality);
  gr.scene.add(trackView.group);
  gr.applyTheme(data.theme);
  const view = new RaceView(gr, sim, trackView);
  const me = sim.animals.findIndex((a) => a.human);
  const drivers = sim.animals.map((_, i) => new AiDriver(i, seed));
  view.mode = demo ? 'orbit' : 'chase';
  view.focus = me >= 0 ? me : 0;
  // Gleichnamige Tiere unterscheiden (z. B. «Lenni 2»)
  // Menschen zuerst zählen, damit sie den Namen ohne Nummer erhalten
  const count = new Map<string, number>();
  const names: string[] = [];
  for (const a of [...sim.animals].sort((x, y) => Number(y.human) - Number(x.human))) {
    const n = (count.get(a.animalId) ?? 0) + 1;
    count.set(a.animalId, n);
    const base = getAnimal(a.animalId).name;
    names[a.id] = n === 1 ? base : `${base} ${n}`;
  }
  if (demo) {
    // Demo startet mitten im Rennen
    sim.time = 0;
    sim.phase = 'running';
  }
  accumulator = 0;
  return { trackId, sim, trackView, view, drivers, hud: me >= 0 ? new Hud(sim, me, trackId) : null, me, demo, names };
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
  session = buildSession(id, null, 'mittel', true);
}

function startRace() {
  state = 'loading';
  const trackId = cup ? cup.tracks[cup.index] : choice.track;
  const data = getTrack(trackId);
  document.getElementById('loading-name')!.textContent = data.name;
  const [special, shortcut] = T.help.tracks[trackId];
  document.getElementById('loading-tip')!.textContent = `💡 ${special} ${T.help.shortcut}: ${shortcut}`;
  document.getElementById('loading-sub')!.textContent = cup ? `${cup.name} · ${T.cup.race} ${cup.index + 1}/${cup.tracks.length}` : data.subtitle;
  showScreen('loading');
  showHud(false);
  updateSettings({ lastAnimal: choice.animal, lastTrack: choice.track });
  // Kurz warten, damit der Ladebildschirm sichtbar wird
  setTimeout(
    () => {
      session = buildSession(trackId, choice.animal, choice.level, false, cup?.roster);
      session.view.resetCamera();
      state = 'race';
      showScreen('none');
      showHud(true);
      input.clear();
    },
    60,
  );
}

function startCup() {
  const def = CUPS.find((c) => c.id === choice.cup) ?? CUPS[0];
  const roster = pickOpponents(choice.animal);
  const points: Record<string, number> = { [choice.animal]: 0 };
  for (const id of roster) points[id] = 0;
  cup = { id: def.id, name: def.name, tracks: def.tracks, index: 0, roster, points, gained: {} };
  startRace();
}

function cupRows(): StandingRow[] {
  if (!cup) return [];
  return Object.keys(cup.points).map((id) => ({ name: getAnimal(id).name, me: id === choice.animal, points: cup!.points[id], gained: cup!.gained[id] ?? 0 }));
}

function finishRace() {
  if (!session) return;
  state = 'results';
  const s = session;
  const me = s.sim.animals[s.me];
  const isRecord = me.finished ? submitTime(s.trackId, me.animalId, me.finishTime, me.bestLap) : false;
  const results = s.sim.results();
  buildResults(results, s.names, s.me, isRecord);
  const title = document.getElementById('results-title')!;
  document.getElementById('cup-box')!.classList.toggle('hidden', !cup);
  document.getElementById('btn-again')!.classList.toggle('hidden', !!cup);
  document.getElementById('btn-next')!.classList.toggle('hidden', !cup);
  if (cup) {
    // Punkte verteilen: 15 – 12 – 10 – 8 – 6 – 4 – 2 – 1
    cup.gained = {};
    for (const r of results) {
      const pts = RACE.cupPoints[r.place - 1] ?? 0;
      cup.points[r.animalId] = (cup.points[r.animalId] ?? 0) + pts;
      cup.gained[r.animalId] = pts;
    }
    buildStandings('cup-table', cupRows());
    title.textContent = `${T.cup.race} ${cup.index + 1}/${cup.tracks.length} · ${getTrack(s.trackId).name}`;
    document.getElementById('btn-next')!.textContent = cup.index + 1 < cup.tracks.length ? T.cup.next : T.cup.ceremony;
  } else title.textContent = T.results.title;
  showScreen('results');
}

function nextCupRace() {
  if (!cup) return;
  cup.index++;
  if (cup.index < cup.tracks.length) startRace();
  else startCeremony();
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
  document.getElementById('ceremony-title')!.textContent = `${T.cup.title} · ${cup.name}`;
  document.getElementById('ceremony-you')!.textContent = `${T.cup.youPlace} ${myPlace}!`;
  showScreen('ceremony');
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
  {
    const s = session;
    accumulator += dt * TIMESCALE;
    let steps = 0;
    while (accumulator >= SIM_DT && steps < 20 * TIMESCALE) {
      const inputs: Input[] = s.sim.animals.map((a, i) => {
        if (a.human && !a.finished && !TEST_AUTOPILOT) return input.sample();
        return s.drivers[i].think(s.sim);
      });
      s.sim.step(inputs);
      for (const e of s.sim.drainEvents()) {
        s.hud?.handleEvent(e);
        s.view.handleEvent(e);
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
    if (state === 'race' && s.sim.phase === 'done') finishRace();
  }
}

// FPS-Anzeige mit ?fps
const fpsEl = document.getElementById('fps')!;
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
  if (screen === 'animal') buildAnimalPicker(choice.animal, (id) => (choice.animal = id));
  else stopAnimalPreview();
  if (screen === 'track') {
    const title = document.getElementById('track-title')!;
    if (choice.mode === 'cup') {
      title.textContent = T.menu.chooseCup;
      buildCupCards(choice.cup, (id) => (choice.cup = id));
    } else {
      title.textContent = T.menu.chooseTrack;
      buildTrackCards(choice.track, (id) => (choice.track = id));
    }
    segmented(
      document.getElementById('difficulty')!,
      (['leicht', 'mittel', 'schwer'] as AiLevel[]).map((l) => [l, T.difficulty[l]]),
      choice.level,
      (v) => (choice.level = v),
    );
  }
  if (screen === 'options') buildOptions();
  if (screen === 'help') buildHelp();
  showScreen(screen);
}

function buildOptions() {
  const s = settings();
  segmented<Quality>(
    document.getElementById('opt-quality')!,
    (['hoch', 'mittel', 'niedrig'] as Quality[]).map((q) => [q, T.options.qualityValues[q]]),
    s.quality,
    (q) => {
      updateSettings({ quality: q });
      gr.setQuality(q);
      // Dekoration und Schatten neu aufbauen
      if (session?.demo) startDemo();
    },
  );
  segmented(document.getElementById('opt-autorun')!, [['1', T.options.on], ['0', T.options.off]], s.autoRun ? '1' : '0', (v) => {
    updateSettings({ autoRun: v === '1' });
    input.autoRun = v === '1';
    applyBodyFlags();
  });
  segmented(document.getElementById('opt-hints')!, [['1', T.options.on], ['0', T.options.off]], s.controlHints ? '1' : '0', (v) => {
    updateSettings({ controlHints: v === '1' });
    applyBodyFlags();
  });
}

function applyBodyFlags() {
  const s = settings();
  document.body.classList.toggle('autorun', s.autoRun);
  document.getElementById('t-run')!.textContent = s.autoRun ? T.hud.brake : T.hud.run;
  const touch = isTouchDevice();
  document.getElementById('touch')!.classList.toggle('hidden', !touch);
  document.getElementById('key-hints')!.classList.toggle('hidden', touch || !s.controlHints);
}

function togglePause() {
  if (state === 'race') {
    state = 'paused';
    showScreen('pause');
  } else if (state === 'paused') {
    state = 'race';
    showScreen('none');
    input.clear();
  }
}

function toMenu() {
  state = 'menu';
  cup = null;
  if (ceremony) {
    ceremony.dispose();
    ceremony = null;
  }
  showHud(false);
  startDemo();
  go('main');
}

function setupUi() {
  applyTexts();
  buildControlsTable();
  applyBodyFlags();
  document.querySelectorAll<HTMLElement>('[data-go]').forEach((b) =>
    b.addEventListener('click', () => go(b.dataset.go as ScreenName)),
  );
  document.getElementById('scr-title')!.addEventListener('click', () => go('main'));
  window.addEventListener('keydown', (e) => {
    if (!document.getElementById('scr-title')!.classList.contains('hidden') && e.code !== 'Escape') go('main');
  });
  document.getElementById('btn-start')!.addEventListener('click', () => (choice.mode === 'cup' ? startCup() : startRace()));
  document.getElementById('btn-single')!.addEventListener('click', () => {
    choice.mode = 'einzel';
    go('animal');
  });
  document.getElementById('btn-cup')!.addEventListener('click', () => {
    choice.mode = 'cup';
    go('animal');
  });
  document.getElementById('btn-next')!.addEventListener('click', nextCupRace);
  document.getElementById('btn-ceremony-menu')!.addEventListener('click', toMenu);
  document.getElementById('btn-pause')!.addEventListener('click', togglePause);
  document.getElementById('btn-resume')!.addEventListener('click', togglePause);
  document.getElementById('btn-restart')!.addEventListener('click', startRace);
  document.getElementById('btn-quit')!.addEventListener('click', toMenu);
  document.getElementById('btn-pause-options')!.addEventListener('click', () => {
    optionsReturn = 'pause';
    go('options');
  });
  document.getElementById('btn-options-back')!.addEventListener('click', () => {
    showScreen(optionsReturn);
    optionsReturn = 'main';
  });
  document.querySelectorAll('[data-go="options"]').forEach((b) => b.addEventListener('click', () => (optionsReturn = 'main')));
  document.getElementById('btn-again')!.addEventListener('click', startRace);
  document.getElementById('btn-results-menu')!.addEventListener('click', toMenu);
  input.onPause = togglePause;

  // Touch-Tasten
  input.bindTouchButton(document.getElementById('t-left')!, 'links');
  input.bindTouchButton(document.getElementById('t-right')!, 'rechts');
  input.bindTouchButton(document.getElementById('t-jump')!, 'springen');
  input.bindTouchButton(document.getElementById('t-run')!, 'vorwaerts');
  input.bindTouchButton(document.getElementById('t-power')!, 'superkraft');

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
  // Seite im Hintergrund: Rennen pausieren
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'race') togglePause();
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
    choice = { ...choice, animal, track };
    startRace();
  },
};
