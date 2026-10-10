/**
 * Eingabe vom Menschen: Tastatur, Touch-Tasten und Gamepad werden zu einem Input-Objekt
 * zusammengeführt. Die Simulation sieht nur dieses Objekt.
 */
import { emptyInput, type Input } from '../game/types';

type Action = keyof Input;

const KEYMAP: Record<string, Action> = {
  ArrowUp: 'vorwaerts',
  KeyW: 'vorwaerts',
  ArrowLeft: 'links',
  KeyA: 'links',
  ArrowRight: 'rechts',
  KeyD: 'rechts',
  Space: 'springen',
  KeyE: 'superkraft',
  ShiftLeft: 'superkraft',
  ShiftRight: 'superkraft',
};

export class InputManager {
  private readonly keys = new Set<string>();
  /** Bremstaste (S / Pfeil runter): hebt Auto-Lauf auf, solange gedrückt */
  private braking = false;
  private readonly touch = emptyInput();
  autoRun = false;
  onPause: (() => void) | null = null;
  /** Wird beim allerersten Tastendruck/Touch ausgelöst (Browser-Regel für Ton). */
  onFirstInteraction: (() => void) | null = null;
  private gamepadPausePrev = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.firstInteraction();
      // In Eingabefeldern (Name, Raumcode) gehören alle Tasten dem Feld – auch S, P, W, A, D und Leertaste
      if (isTyping(e.target)) return;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        this.braking = true;
        e.preventDefault();
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        this.onPause?.();
        return;
      }
      if (KEYMAP[e.code]) {
        this.keys.add(e.code);
        // Leertaste/Pfeile sollen die Seite nicht scrollen
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.braking = false;
    });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => this.firstInteraction(), { once: false });
  }

  private firstInteraction() {
    if (this.onFirstInteraction) {
      const f = this.onFirstInteraction;
      this.onFirstInteraction = null;
      f();
    }
  }

  /** Touch-Taste binden (mehrere Finger gleichzeitig möglich). */
  bindTouchButton(el: HTMLElement, action: Action) {
    const active = new Set<number>();
    const set = () => {
      this.touch[action] = active.size > 0;
      el.classList.toggle('pressed', active.size > 0);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // manche Browser erlauben das nicht – Taste funktioniert trotzdem
      }
      active.add(e.pointerId);
      set();
    });
    const up = (e: PointerEvent) => {
      active.delete(e.pointerId);
      set();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  sample(): Input {
    const inp = emptyInput();
    for (const code of this.keys) inp[KEYMAP[code]] = true;
    for (const k of Object.keys(inp) as Action[]) if (k !== 'vorwaerts' && this.touch[k]) inp[k] = true;
    this.pollGamepad(inp);
    // Mit Auto-Lauf wird die Lauf-Taste zur Bremse
    if (this.autoRun) inp.vorwaerts = !this.braking && !this.touch.vorwaerts;
    else if (this.touch.vorwaerts) inp.vorwaerts = true;
    return inp;
  }

  private pollGamepad(inp: Input) {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      const b = (i: number) => !!p.buttons[i]?.pressed;
      const x = p.axes[0] ?? 0;
      if (b(0) || b(7)) inp.vorwaerts = true; // A oder rechter Trigger
      if (b(1)) inp.springen = true; // B
      if (b(2) || b(5)) inp.superkraft = true; // X oder RB
      if (x < -0.35 || b(14)) inp.links = true;
      if (x > 0.35 || b(15)) inp.rechts = true;
      const pause = b(9);
      if (pause && !this.gamepadPausePrev) this.onPause?.();
      this.gamepadPausePrev = pause;
      if (p.buttons.some((x) => x.pressed)) this.firstInteraction();
    }
  }

  clear() {
    this.keys.clear();
  }
}

export const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;

function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);
}
