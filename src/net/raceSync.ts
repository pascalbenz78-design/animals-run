/**
 * Rennen im Mehrspieler:
 * – Gastgeber: rechnet verbindlich, nimmt Eingaben der Mitspieler entgegen und verschickt
 *   regelmässig den Spielzustand (Schnappschuss) samt Ereignissen.
 * – Mitspieler: rechnet das eigene Tier sofort voraus (keine spürbare Verzögerung), übernimmt
 *   jeden Schnappschuss und rechnet die noch unbestätigten eigenen Eingaben nach.
 *   Kleine Abweichungen werden in der Darstellung sanft ausgeglichen.
 */
import { NET } from '../config/net';
import type { AiDriver } from '../game/ai';
import type { RaceSim } from '../game/simulation';
import type { Input, SimEvent } from '../game/types';
import { encode, packInput, unpackInput, type Msg } from './protocol';
import { applySnapshot, captureSnapshot, type Snapshot } from './sync';

export interface Offset {
  x: number;
  z: number;
}

export class HostRaceSync {
  /** Letzte Eingabe und Sequenznummer je Tier (Index) eines Mitspielers */
  private readonly remote = new Map<number, { playerId: string; seq: number; bits: number; connected: boolean }>();
  private readonly events: SimEvent[] = [];
  private readonly lastBits: number[];

  constructor(
    private readonly sim: RaceSim,
    private readonly me: number,
    humans: { playerId: string; index: number }[],
    private readonly send: (playerId: string, text: string) => void,
  ) {
    this.lastBits = sim.animals.map(() => 0);
    for (const h of humans) if (h.index !== me) this.remote.set(h.index, { playerId: h.playerId, seq: 0, bits: 0, connected: true });
  }

  setInput(playerId: string, seq: number, bits: number) {
    for (const r of this.remote.values()) {
      if (r.playerId !== playerId || seq <= r.seq) continue;
      r.seq = seq;
      r.bits = bits;
    }
  }

  /** Wiedereinstieg: neue Verbindungs-ID für denselben Spieler */
  rebind(oldId: string, newId: string) {
    for (const r of this.remote.values()) if (r.playerId === oldId) r.playerId = newId;
  }

  /** Mitspieler weg: ein Computer übernimmt das Tier. Wieder da: Mensch übernimmt. */
  setConnected(playerId: string, connected: boolean) {
    for (const [idx, r] of this.remote) {
      if (r.playerId !== playerId) continue;
      r.connected = connected;
      this.sim.animals[idx].human = connected;
      if (connected) r.seq = 0;
    }
  }

  /** Eingaben für alle Tiere: eigenes Tier lokal, Mitspieler aus dem Netz, Rest Computer */
  inputs(local: Input, drivers: AiDriver[], autopilot: boolean): Input[] {
    return this.sim.animals.map((a, i) => {
      let inp: Input;
      const r = this.remote.get(i);
      if (i === this.me && !a.finished && !autopilot) inp = local;
      else if (r && r.connected && !a.finished) inp = unpackInput(r.bits);
      else inp = drivers[i].think(this.sim);
      this.lastBits[i] = packInput(inp);
      return inp;
    });
  }

  /** Nach jedem Schritt: Ereignisse sammeln und regelmässig den Zustand verschicken */
  afterStep(events: SimEvent[]) {
    this.events.push(...events);
    if (this.sim.tick % NET.snapshotEvery !== 0 && this.sim.phase !== 'done') return;
    const snap = captureSnapshot(this.sim, [...this.lastBits]);
    // Gemeinsamer Teil nur einmal kodieren; die Bestätigung (ack) ist je Mitspieler verschieden
    const body = encode({ t: 'snap', ack: 0, s: snap, ev: this.events } as Msg);
    this.events.length = 0;
    for (const r of this.remote.values()) {
      if (!r.connected) continue;
      this.send(r.playerId, body.replace('"ack":0', `"ack":${r.seq}`));
    }
  }
}

export class ClientRaceSync {
  private seq = 0;
  private readonly history: { seq: number; bits: number }[] = [];
  private pending: { s: Snapshot; ack: number; ev: SimEvent[] }[] = [];
  /** Zuletzt bekannte Eingaben aller Tiere (vom Gastgeber) */
  private remoteBits: number[];
  /** Darstellungs-Versatz je Tier, wird sanft auf 0 zurückgeführt */
  readonly offsets: Offset[];
  /** Wurde schon mindestens ein Schnappschuss übernommen? */
  synced = false;

  constructor(
    private readonly sim: RaceSim,
    private readonly me: number,
    private readonly sendInput: (seq: number, bits: number) => void,
  ) {
    this.remoteBits = sim.animals.map(() => 0);
    this.offsets = sim.animals.map(() => ({ x: 0, z: 0 }));
  }

  /**
   * Neuer Gastgeber (Gastgeber-Wechsel): Er kennt unsere bisherigen Eingaben nicht. Darum alles
   * Unbestätigte verwerfen und auf seinen ersten Spielzustand warten.
   */
  resetForNewHost() {
    this.history.length = 0;
    this.pending = [];
    this.synced = false;
  }

  onSnapshot(s: Snapshot, ack: number, ev: SimEvent[]) {
    this.pending.push({ s, ack, ev });
  }

  private inputsFor(myBits: number, drivers: AiDriver[]): Input[] {
    return this.sim.animals.map((a, i) => {
      if (i === this.me) return unpackInput(myBits);
      if (a.human && !a.finished) return unpackInput(this.remoteBits[i]);
      return drivers[i].think(this.sim);
    });
  }

  /**
   * Ein Simulationsschritt beim Mitspieler. Gibt die Ereignisse vom Gastgeber zurück
   * (nur diese zählen für Anzeigen und Effekte – lokale Vorhersage-Ereignisse werden verworfen).
   */
  step(local: Input, drivers: AiDriver[]): SimEvent[] {
    const out: SimEvent[] = [];
    if (this.pending.length) {
      // Nur der neueste Schnappschuss zählt; Ereignisse aller Schnappschüsse weitergeben
      for (const p of this.pending) out.push(...p.ev);
      const last = this.pending[this.pending.length - 1];
      this.pending = [];
      this.reconcile(last.s, last.ack, drivers);
    }
    if (this.sim.phase === 'done') return out;
    // Noch nichts vom Gastgeber gehört (er wartet z. B. auf andere Mitspieler): nicht losrechnen
    if (!this.synced) return out;
    // Gastgeber hängt (z. B. Fenster im Hintergrund): nicht endlos vorausrechnen
    if (this.synced && this.history.length >= NET.maxAhead) return out;
    this.seq++;
    const bits = packInput(local);
    this.history.push({ seq: this.seq, bits });
    if (this.history.length > 240) this.history.shift();
    this.sendInput(this.seq, bits);
    this.sim.step(this.inputsFor(bits, drivers));
    this.sim.drainEvents();
    return out;
  }

  private reconcile(s: Snapshot, ack: number, drivers: AiDriver[]) {
    const before = this.sim.animals.map((a) => ({ x: a.x, z: a.z }));
    applySnapshot(this.sim, s);
    this.remoteBits = s.inputs;
    // Noch nicht bestätigte eigene Eingaben nachrechnen
    while (this.history.length && this.history[0].seq <= ack) this.history.shift();
    if (s.phase !== 'done') {
      for (const h of this.history) {
        this.sim.step(this.inputsFor(h.bits, drivers));
        this.sim.drainEvents();
      }
    }
    // Sprung in der Darstellung vermeiden: Unterschied als Versatz merken
    this.sim.animals.forEach((a, i) => {
      const o = this.offsets[i];
      const dx = before[i].x - a.x + o.x;
      const dz = before[i].z - a.z + o.z;
      if (!this.synced || Math.hypot(dx, dz) > NET.snapDistance || a.respawn > 0) {
        o.x = 0;
        o.z = 0;
      } else {
        o.x = dx;
        o.z = dz;
      }
      a.prevX = a.x;
      a.prevZ = a.z;
    });
    this.synced = true;
  }
}
