/**
 * Mehrspieler-Ablauf: Raum erstellen/beitreten, Lobby (Tierwahl, Bereit, Einstellungen, Ping),
 * Rennstart, Verbindungsabbrüche und Wiedereinstieg. Das Rennen selbst steuert main.ts;
 * dieser Teil meldet sich über die Hooks.
 */
import { NET } from '../config/net';
import { T } from '../config/texts';
import type { AiLevel } from '../game/types';
import { CUPS } from '../tracks';
import { ClientLink, HostLink } from './peer';
import { PROTOCOL_VERSION, type CupInfo, type GameMode, type LobbyState, type Msg, type PlayerInfo, type RaceSetup } from './protocol';

export interface MpHooks {
  /** Lobby neu anzeigen */
  lobby(): void;
  /** Rennen aufbauen (Gastgeber und Mitspieler) */
  startRace(setup: RaceSetup): void;
  /** Mitspieler: Schnappschuss vom Gastgeber */
  snapshot(msg: Extract<Msg, { t: 'snap' }>): void;
  /** Gastgeber: Eingabe eines Mitspielers */
  input(playerId: string, seq: number, bits: number): void;
  /** Gastgeber: Mitspieler verbunden/getrennt (während eines Rennens) */
  connection(playerId: string, connected: boolean, oldId?: string): void;
  /** Mitspieler: Rennergebnis (Cup-Wertung) vom Gastgeber */
  results(cup: CupInfo | null): void;
  ceremony(cup: CupInfo): void;
  toLobby(): void;
  notice(text: string): void;
  /** Verbindung beendet (mit Grund) – zurück ins Menü */
  leave(reason: string): void;
}

function token(): string {
  // Pro Browser-Tab eigenes Kennzeichen, damit man nach einem Abbruch wieder einsteigen kann
  try {
    let t = sessionStorage.getItem('animals-run-token');
    if (!t) {
      t = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('animals-run-token', t);
    }
    return t;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export class Multiplayer {
  role: 'host' | 'client' = 'client';
  myId = '';
  lobby: LobbyState = { code: '', mode: 'einzel', track: 'bauernhof', cup: CUPS[0].id, level: 'mittel', players: [], racing: false };
  /** Aktuelles Rennen (beim Gastgeber, für Wiedereinsteiger) */
  setup: RaceSetup | null = null;
  ping = -1;
  private host: HostLink | null = null;
  private client: ClientLink | null = null;
  private pingTimer = 0;
  /** Gastgeber: Kennzeichen je Spieler (für den Wiedereinstieg) */
  private readonly tokens = new Map<string, string>();

  constructor(private readonly hooks: MpHooks) {}

  get isHost() {
    return this.role === 'host';
  }

  get me(): PlayerInfo | undefined {
    return this.lobby.players.find((p) => p.id === this.myId);
  }

  // ---------------------------------------------------------------- Gastgeber

  async create(name: string): Promise<string> {
    this.role = 'host';
    this.myId = 'host';
    const link = new HostLink();
    this.host = link;
    link.onMessage = (from, msg) => this.hostMessage(from, msg);
    link.onClose = (from) => this.hostLost(from);
    link.onFatal = (text) => this.hooks.notice(text);
    const code = await link.open();
    this.lobby = { ...this.lobby, code, players: [{ id: 'host', name, animal: null, ready: true, ping: 0, host: true, connected: true }] };
    return code;
  }

  private hostMessage(from: string, msg: Msg) {
    const p = this.lobby.players.find((x) => x.id === from);
    switch (msg.t) {
      case 'hello': {
        if (msg.version !== PROTOCOL_VERSION) return this.reject(from, T.mp.errVersion);
        // Wiedereinstieg: gleiches Kennzeichen eines getrennten Spielers
        const back = this.lobby.players.find((x) => !x.connected && this.tokens.get(x.id) === msg.token);
        if (back) {
          const oldId = back.id;
          back.id = from;
          back.connected = true;
          this.tokens.delete(oldId);
          this.tokens.set(from, msg.token);
          if (this.setup) for (const h of this.setup.humans) if (h.playerId === oldId) h.playerId = from;
          this.host!.send(from, { t: 'welcome', playerId: from, lobby: this.lobby });
          if (this.lobby.racing && this.setup) {
            this.host!.send(from, { t: 'start', setup: this.setup });
            this.hooks.connection(from, true, oldId);
          }
          this.broadcastNotice(`${back.name} ${T.mp.playerBack}`);
          this.broadcastLobby();
          return;
        }
        if (this.lobby.racing) return this.reject(from, T.mp.errRunning);
        if (this.lobby.players.filter((x) => x.connected).length >= NET.maxPlayers) return this.reject(from, T.mp.errFull);
        const name = (msg.name || 'Spieler').slice(0, 14);
        this.lobby.players.push({ id: from, name, animal: null, ready: false, ping: -1, host: false, connected: true });
        this.tokens.set(from, msg.token);
        this.host!.send(from, { t: 'welcome', playerId: from, lobby: this.lobby });
        this.broadcastNotice(`${name} ${T.mp.playerJoined}`);
        this.broadcastLobby();
        return;
      }
      case 'pick':
        if (!p) return;
        if (this.lobby.players.some((x) => x !== p && x.animal === msg.animal)) {
          this.host!.send(from, { t: 'notice', text: T.mp.taken });
          this.host!.send(from, { t: 'lobby', lobby: this.lobby });
          return;
        }
        p.animal = msg.animal;
        p.ready = false;
        this.broadcastLobby();
        return;
      case 'ready':
        if (!p) return;
        p.ready = msg.ready && !!p.animal;
        this.broadcastLobby();
        return;
      case 'ping':
        if (p) p.ping = msg.rtt;
        this.host!.send(from, { t: 'pong', at: msg.at });
        if (!this.lobby.racing) this.broadcastLobby();
        return;
      case 'input':
        this.hooks.input(from, msg.seq, msg.b);
        return;
    }
  }

  private reject(to: string, reason: string) {
    this.host!.send(to, { t: 'reject', reason });
    setTimeout(() => this.host?.kick(to), 300);
  }

  private hostLost(from: string) {
    const p = this.lobby.players.find((x) => x.id === from);
    if (!p) return;
    if (this.lobby.racing) {
      // Während des Rennens: Platz behalten, Computer übernimmt
      p.connected = false;
      this.hooks.connection(from, false);
      this.broadcastNotice(`${p.name} ${T.mp.playerLost}`);
    } else {
      this.lobby.players = this.lobby.players.filter((x) => x.id !== from);
      this.tokens.delete(from);
      this.broadcastNotice(`${p.name} ${T.mp.playerLeft}`);
    }
    this.broadcastLobby();
  }

  /** Gastgeber: eigene Wahl und Einstellungen */
  hostPick(animal: string) {
    const me = this.me;
    if (!me || this.lobby.players.some((x) => x !== me && x.animal === animal)) return;
    me.animal = animal;
    this.broadcastLobby();
  }

  setSettings(s: Partial<{ mode: GameMode; track: string; cup: string; level: AiLevel }>) {
    Object.assign(this.lobby, s);
    this.broadcastLobby();
  }

  /** Alle (ausser dem Gastgeber) bereit und alle mit Tier? */
  canStart(): boolean {
    const ps = this.lobby.players.filter((p) => p.connected);
    return ps.every((p) => !!p.animal && (p.host || p.ready));
  }

  /** Gastgeber: Rennen starten (Aufbau kommt aus main.ts) */
  sendStart(setup: RaceSetup) {
    this.setup = setup;
    this.lobby.racing = true;
    this.host?.broadcast({ t: 'start', setup });
  }

  sendResults(cup: CupInfo | null) {
    this.host?.broadcast({ t: 'results', cup });
  }

  sendCeremony(cup: CupInfo) {
    this.host?.broadcast({ t: 'ceremony', cup });
  }

  /** Gastgeber: alle zurück in die Lobby */
  backToLobby() {
    this.lobby.racing = false;
    this.setup = null;
    // Getrennte Spieler jetzt entfernen, Bereit-Status zurücksetzen
    this.lobby.players = this.lobby.players.filter((p) => p.connected);
    for (const p of this.lobby.players) p.ready = p.host;
    this.host?.broadcast({ t: 'toLobby' });
    this.broadcastLobby();
  }

  /** Gastgeber: Text an alle Mitspieler und sich selbst */
  broadcastNotice(text: string) {
    this.host?.broadcast({ t: 'notice', text });
    this.hooks.notice(text);
  }

  sendTo(playerId: string, text: string) {
    this.host?.send(playerId, text);
  }

  private broadcastLobby() {
    this.host?.broadcast({ t: 'lobby', lobby: this.lobby });
    this.hooks.lobby();
  }

  // ---------------------------------------------------------------- Mitspieler

  async join(code: string, name: string): Promise<void> {
    this.role = 'client';
    const link = new ClientLink();
    this.client = link;
    link.onClose = () => this.hooks.leave(T.mp.hostLost);
    await new Promise<void>((resolve, reject) => {
      link.onMessage = (msg) => {
        if (msg.t === 'welcome') {
          this.myId = msg.playerId;
          this.lobby = msg.lobby;
          resolve();
          return;
        }
        if (msg.t === 'reject') {
          reject(new Error(msg.reason));
          link.close();
          return;
        }
        this.clientMessage(msg);
      };
      link
        .connect(code)
        .then(() => link.send({ t: 'hello', name: name.slice(0, 14), token: token(), version: PROTOCOL_VERSION }))
        .catch(reject);
    });
    this.pingTimer = window.setInterval(() => link.send({ t: 'ping', at: performance.now(), rtt: this.ping }), NET.pingInterval);
  }

  private clientMessage(msg: Msg) {
    switch (msg.t) {
      case 'lobby':
        this.lobby = msg.lobby;
        this.hooks.lobby();
        return;
      case 'pong':
        this.ping = Math.round(performance.now() - msg.at);
        return;
      case 'start':
        this.setup = msg.setup;
        this.hooks.startRace(msg.setup);
        return;
      case 'snap':
        this.hooks.snapshot(msg);
        return;
      case 'results':
        this.hooks.results(msg.cup);
        return;
      case 'ceremony':
        this.hooks.ceremony(msg.cup);
        return;
      case 'toLobby':
        this.setup = null;
        this.hooks.toLobby();
        return;
      case 'notice':
        this.hooks.notice(msg.text);
        return;
    }
  }

  pick(animal: string) {
    if (this.isHost) this.hostPick(animal);
    else this.client?.send({ t: 'pick', animal });
  }

  setReady(ready: boolean) {
    this.client?.send({ t: 'ready', ready });
  }

  sendInput(seq: number, bits: number) {
    this.client?.send({ t: 'input', seq, b: bits });
  }

  // ---------------------------------------------------------------- beide

  leave() {
    clearInterval(this.pingTimer);
    const c = this.client;
    this.client = null;
    if (c) {
      c.onClose = () => {};
      c.close();
    }
    this.host?.close();
    this.host = null;
    this.setup = null;
  }
}
