/**
 * Einstiegspunkt: verbindet Simulation, Darstellung, Eingabe und Menüs.
 * Die Simulation läuft mit fester Rate (SIM_HZ), die Darstellung interpoliert dazwischen.
 */
import './ui/style.css';
import { RACE, SIM_DT } from './config/balance';
import { T } from './config/texts';
import { ANIMALS, getAnimal } from './animals/animals';
import { AiDriver } from './game/ai';
import { RaceSim } from './game/simulation';
import { Track } from './game/track';
import type { AiLevel, Entrant, Input } from './game/types';
import { InputManager, isTouchDevice } from './input/input';
import { RaceView } from './render/raceView';
import { GameRenderer } from './render/renderer';
import { TrackView, type Quality } from './render/trackView';
import { getTrack } from './tracks';
import { settings, submitTime, updateSettings } from './storage';
import { Hud } from './ui/hud';
import {
  applyTexts,
  buildAnimalCards,
  buildControlsTable,
  buildResults,
  buildTrackCards,
  segmented,
  showHud,
  showScreen,
  type ScreenName,
} from './ui/menus';

type AppState = 'menu' | 'loading' | 'race' | 'paused' | 'results';

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
let choice = { animal: settings().lastAnimal, track: settings().lastTrack, level: 'mittel' as AiLevel };
let optionsReturn: ScreenName = 'main';

// ---------------------------------------------------------------------------
// Rennen aufbauen

function buildSession(trackId: string, humanAnimal: string | null, level: AiLevel, demo: boolean): Session {
  disposeSession();
  const data = getTrack(trackId);
  const track = new Track(data);
  const entrants: Entrant[] = [];
  if (humanAnimal) entrants.push({ animalId: humanAnimal, human: true, aiLevel: level });
  // Computergegner: abwechselnd die anderen Tiere (Phase 1: Lenni und Aramis)
  const others = ANIMALS.map((a) => a.id).filter((id) => id !== humanAnimal);
  const pool = others.length ? others : ANIMALS.map((a) => a.id);
  let k = 0;
  while (entrants.length < RACE.animalsPerRace) {
    const id = k % 2 === 0 || !humanAnimal ? pool[k % pool.length] : humanAnimal;
    entrants.push({ animalId: id, human: false, aiLevel: level });
    k++;
  }
  const sim = new RaceSim(track, entrants, demo ? 99 : RACE.laps);
  const trackView = new TrackView(track, sim, gr.quality);
  gr.scene.add(trackView.group);
  gr.applyTheme(data.theme);
  const view = new RaceView(gr, sim, trackView);
  const me = sim.animals.findIndex((a) => a.human);
  const seed = Math.floor(Math.random() * 1e6);
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
  session = buildSession('bauernhof', null, 'mittel', true);
}

function startRace() {
  state = 'loading';
  const data = getTrack(choice.track);
  document.getElementById('loading-name')!.textContent = data.name;
  document.getElementById('loading-sub')!.textContent = data.subtitle;
  showScreen('loading');
  showHud(false);
  updateSettings({ lastAnimal: choice.animal, lastTrack: choice.track });
  // Zwei Frames warten, damit der Ladebildschirm sichtbar wird
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      session = buildSession(choice.track, choice.animal, choice.level, false);
      session.view.resetCamera();
      state = 'race';
      showScreen('none');
      showHud(true);
      input.clear();
    }),
  );
}

function finishRace() {
  if (!session) return;
  state = 'results';
  const s = session;
  const me = s.sim.animals[s.me];
  const isRecord = me.finished ? submitTime(s.trackId, me.animalId, me.finishTime, me.bestLap) : false;
  buildResults(s.sim.results(), s.names, s.me, isRecord);
  showScreen('results');
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

  if (session && state !== 'paused' && state !== 'loading') {
    const s = session;
    accumulator += dt * TIMESCALE;
    let steps = 0;
    while (accumulator >= SIM_DT && steps < 20 * TIMESCALE) {
      const inputs: Input[] = s.sim.animals.map((a, i) => {
        if (a.human && !a.finished && !TEST_AUTOPILOT) return input.sample();
        return s.drivers[i].think(s.sim);
      });
      s.sim.step(inputs);
      for (const e of s.sim.drainEvents()) s.hud?.handleEvent(e);
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
  gr.render(elapsed);
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
  if (screen === 'animal') buildAnimalCards(choice.animal, (id) => (choice.animal = id));
  if (screen === 'track') {
    buildTrackCards(choice.track, (id) => (choice.track = id));
    segmented(
      document.getElementById('difficulty')!,
      (['leicht', 'mittel', 'schwer'] as AiLevel[]).map((l) => [l, T.difficulty[l]]),
      choice.level,
      (v) => (choice.level = v),
    );
  }
  if (screen === 'options') buildOptions();
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
  document.getElementById('btn-start')!.addEventListener('click', startRace);
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
  startRace: (animal = 'lenni', track = 'bauernhof') => {
    choice = { ...choice, animal, track };
    startRace();
  },
};
