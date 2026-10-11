/**
 * Mehrspieler-Ablauf: Raum erstellen/beitreten, Lobby (Tierwahl, Bereit, Einstellungen, Ping),
 * Rennstart, Verbindungsabbrüche und Wiedereinstieg. Das Rennen selbst steuert main.ts;
 * dieser Teil meldet sich über die Hooks.
 *
 * Gastgeber-Wechsel: Bricht die Verbindung zum Gastgeber ab oder kommt von ihm zu lange nichts
 * (z. B. Bildschirm gesperrt), übernimmt der erste Mitspieler in der Lobby-Reihenfolge. Die anderen
 * verbinden sich mit ihm (gleicher Raumcode, nächste «Generation»), das Rennen läuft weiter.
 * Kommt der alte Gastgeber zurück, steigt er als Mitspieler wieder ein.
 */
import { NET } from '../config/net';
import { T } from '../config/texts';
import type { AiLevel } from '../game/types';
import { CUPS } from '../tracks';
import { ClientLink, HostLink, ID_TAKEN } from './peer';
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
  /** Gastgeber: ein Mitspieler hat die Strecken-Info bestätigt */
  loaded(): void;
  /** Gastgeber: Mitspieler verbunden/getrennt (während eines Rennens) */
  connection(playerId: string, connected: boolean, oldId?: string): void;
  /** Mitspieler: Rennergebnis (Cup-Wertung) vom Gastgeber */
  results(cup: CupInfo | null): void;
  ceremony(cup: CupInfo): void;
  toLobby(): void;
  notice(text: string): void;
  /** Verbindung beendet (mit Grund) – zurück ins Menü */
  leave(reason: string): void;
  /** Läuft auf diesem Gerät ein Rennen dieses Raums (Ladebildschirm, Rennen, Ergebnis)? */
  hasRace(): boolean;
  /** Erwartet dieses Gerät gerade laufend Spielzustände (Rennen läuft)? */
  expectingSnapshots(): boolean;
  /** Dieses Gerät ist jetzt Gastgeber (Rennen/Cup übernehmen) */
  becameHost(): void;
  /** Dieses Gerät ist nicht mehr Gastgeber (ein anderes hat übernommen) */
  becameClient(): void;
  /** Mitspieler: Verbindung zum neuen Gastgeber steht, das Rennen geht weiter */
  resume(): void;
  /**
   * Läuft das Spiel auf diesem Gerät gerade wirklich (nicht eingefroren/im Hintergrund)?
   * Nur dann darf es einen Gastgeber-Ausfall feststellen und übernehmen.
   */
  alive(): boolean;
}

/** Warum ein Gastgeber-Wechsel startet */
type MigrateReason = 'closed' | 'silent' | 'frozen';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Multiplayer {
  role: 'host' | 'client' = 'client';
  myId = '';
  lobby: LobbyState = { code: '', mode: 'einzel', track: 'bauernhof', cup: CUPS[0].id, level: 'mittel', players: [], racing: false, gen: 0 };
  /** Aktuelles Rennen (für Wiedereinsteiger und für einen Gastgeber-Wechsel) */
  setup: RaceSetup | null = null;
  ping = -1;
  /** Läuft gerade ein Gastgeber-Wechsel? */
  migrating = false;
  private host: HostLink | null = null;
  private client: ClientLink | null = null;
  private pingTimer = 0;
  private watchTimer = 0;
  private probeTimer = 0;
  private lastHostMsg = 0;
  /** Letzter Spielzustand vom Gastgeber (Antworten auf Pings zählen im Rennen nicht als Lebenszeichen) */
  private lastSnap = 0;
  private myName = '';
  private closed = false;
  /** Gastgeber: Mitspieler, die die Strecken-Info bestätigt haben */
  private readonly loadedSet = new Set<string>();

  constructor(private readonly hooks: MpHooks) {}

  get isHost() {
    return this.role === 'host';
  }

  get me(): PlayerInfo | undefined {
    return this.lobby.players.find((p) => p.id === this.myId);
  }

  // ---------------------------------------------------------------- Gastgeber

  async create(name: string): Promise<string> {
    this.myName = name;
    this.role = 'host';
    this.myId = 'host';
    const link = new HostLink();
    this.attachHost(link);
    const code = await link.open();
    this.lobby = { ...this.lobby, code, gen: 0, players: [{ id: 'host', name, animal: null, ready: true, ping: 0, host: true, connected: true, tk: token() }] };
    return code;
  }

  private attachHost(link: HostLink) {
    this.host = link;
    link.onMessage = (from, msg) => this.hostMessage(from, msg);
    link.onClose = (from) => this.hostLost(from);
    link.onFatal = (text) => this.hooks.notice(text);
  }

  private hostMessage(from: string, msg: Msg) {
    const p = this.lobby.players.find((x) => x.id === from);
    switch (msg.t) {
      case 'hello': {
        if (msg.version !== PROTOCOL_VERSION) return this.reject(from, T.mp.errVersion);
        // Wiedereinstieg: bisherige ID (nach Gastgeber-Wechsel) oder gleiches Kennzeichen
        // (auch wenn wir den Abbruch der alten Verbindung noch gar nicht bemerkt haben)
        const back = this.lobby.players.find((x) => !x.host && x.id !== from && ((msg.prevId && x.id === msg.prevId) || x.tk === msg.token));
        if (back) {
          const oldId = back.id;
          if (back.connected) this.host!.kick(oldId);
          back.id = from;
          back.connected = true;
          back.tk = msg.token;
          if (this.setup) for (const h of this.setup.humans) if (h.playerId === oldId) h.playerId = from;
          this.host!.send(from, { t: 'welcome', playerId: from, lobby: this.lobby });
          if (this.lobby.racing && this.setup) {
            if (msg.resume) {
              // Rennen läuft auf dem Gerät schon: nur weiterrechnen
              this.loadedSet.add(from);
              this.host!.send(from, { t: 'resume' });
            } else this.host!.send(from, { t: 'start', setup: this.setup });
            this.hooks.connection(from, true, oldId);
          }
          if (!msg.prevId) this.broadcastNotice(`${back.name} ${T.mp.playerBack}`);
          this.broadcastLobby();
          return;
        }
        if (this.lobby.racing) return this.reject(from, T.mp.errRunning);
        if (this.lobby.players.filter((x) => x.connected).length >= NET.maxPlayers) return this.reject(from, T.mp.errFull);
        const name = (msg.name || 'Spieler').slice(0, 14);
        this.lobby.players.push({ id: from, name, animal: null, ready: false, ping: -1, host: false, connected: true, tk: msg.token });
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
      case 'loaded':
        this.loadedSet.add(from);
        this.hooks.loaded();
        return;
      case 'superseded':
        // Ein Mitspieler hat übernommen, weil wir zu lange weg waren
        if (msg.gen > this.lobby.gen) void this.stepDown(msg.gen);
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
      this.broadcastNotice(`${p.name} ${T.mp.playerLeft}`);
    }
    this.broadcastLobby();
    // Sind plötzlich alle weg, hat vielleicht ein anderes Gerät übernommen (wir waren zu lange weg)
    if (!this.lobby.players.some((x) => !x.host && x.connected)) {
      clearTimeout(this.probeTimer);
      this.probeTimer = window.setTimeout(() => void this.probeSuccessor(), 1500);
    }
  }

  /** Gibt es schon einen Gastgeber der nächsten Generation? Dann dort als Mitspieler einsteigen. */
  private async probeSuccessor() {
    if (!this.isHost || this.closed || this.lobby.players.some((x) => !x.host && x.connected)) return;
    const gens = [this.lobby.gen + 1, this.lobby.gen + 2];
    const link = new ClientLink();
    try {
      await link.connect(this.lobby.code, gens, 7000);
      link.close();
      await this.stepDown(this.lobby.gen + 1);
    } catch {
      link.close();
    }
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
    this.loadedSet.clear();
    this.host?.broadcast({ t: 'start', setup });
  }

  /** Haben alle verbundenen Mitspieler die Strecken-Info bestätigt? */
  allLoaded(): boolean {
    return this.lobby.players.filter((p) => !p.host && p.connected).every((p) => this.loadedSet.has(p.id));
  }

  /** Mitspieler: Strecken-Info gelesen */
  sendLoaded() {
    this.client?.send({ t: 'loaded' });
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
    this.myName = name;
    this.role = 'client';
    await this.connectClient(code, [0, 1, 2, 3, 4, 5, 6, 7], {}, 15000);
    this.startClientTimers();
  }

  /**
   * Verbindung zu einem Gastgeber aufbauen und «hallo» sagen. Erst wenn «welcome» kommt, gilt
   * man als verbunden; danach führt ein Abbruch zum Gastgeber-Wechsel.
   */
  private async connectClient(code: string, gens: number[], extra: { prevId?: string; resume?: boolean }, timeout: number) {
    const link = new ClientLink();
    this.client = link;
    let welcomed = false;
    await new Promise<void>((resolve, reject) => {
      link.onMessage = (msg) => {
        this.lastHostMsg = performance.now();
        if (msg.t === 'snap') this.lastSnap = this.lastHostMsg;
        if (msg.t === 'welcome') {
          welcomed = true;
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
      link.onClose = () => {
        if (!welcomed) reject(new Error(T.mp.errTimeout));
        else void this.migrate('closed');
      };
      link
        .connect(code, gens, timeout)
        .then(() => link.send({ t: 'hello', name: this.myName.slice(0, 14), token: token(), version: PROTOCOL_VERSION, ...extra }))
        .catch(reject);
    }).catch((e) => {
      if (this.client === link) this.client = null;
      link.onClose = () => {};
      link.close();
      throw e;
    });
    this.lastHostMsg = performance.now();
    this.lastSnap = this.lastHostMsg;
  }

  private startClientTimers() {
    clearInterval(this.pingTimer);
    clearInterval(this.watchTimer);
    this.pingTimer = window.setInterval(() => this.client?.send({ t: 'ping', at: performance.now(), rtt: this.ping }), NET.pingInterval);
    // Wächter: kommt vom Gastgeber zu lange nichts, übernimmt ein anderes Gerät
    this.watchTimer = window.setInterval(() => {
      if (this.role !== 'client' || this.migrating || !this.client || this.closed) return;
      const now = performance.now();
      if (this.hooks.expectingSnapshots()) {
        // Rechnet dieses Gerät selbst nicht (z. B. im Hintergrund), kann es nichts beurteilen
        if (!this.hooks.alive() || now - this.lastSnap <= NET.hostSilentRace) return;
        // Antwortet der Gastgeber noch auf Pings, rechnet aber nicht mehr: er ist «eingefroren»
        void this.migrate(now - this.lastHostMsg < NET.pingInterval + 1500 ? 'frozen' : 'silent');
      } else if (now - this.lastHostMsg > NET.hostSilentIdle) void this.migrate('silent');
    }, 500);
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
        // Die Lobby wird im Rennen nicht verschickt – den Status selbst nachführen (wichtig für einen Gastgeber-Wechsel)
        this.lobby.racing = true;
        this.hooks.startRace(msg.setup);
        return;
      case 'resume':
        this.hooks.resume();
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
        this.lobby.racing = false;
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

  // ---------------------------------------------------------------- Gastgeber-Wechsel

  /**
   * Mitspieler: Der Gastgeber ist weg – übernehmen oder mit dem neuen Gastgeber verbinden.
   * - frozen: Gastgeber lebt, rechnet aber nicht (Bildschirm gesperrt) → ablösen
   * - closed/silent: Verbindung weg – vielleicht liegt es an uns. Darum zuerst versuchen, wieder
   *   mit dem bisherigen Gastgeber zu verbinden; erst wenn das nicht klappt, übernehmen.
   */
  private async migrate(reason: MigrateReason) {
    if (this.migrating || this.closed || this.role !== 'client') return;
    this.migrating = true;
    const old = this.client;
    this.client = null;
    clearInterval(this.pingTimer);
    const cur = this.lobby.gen;
    const gen = cur + 1;
    if (old) {
      old.onClose = () => {};
      // Eingefrorener Gastgeber: er soll später als Mitspieler zurückkommen
      if (reason === 'frozen') old.send({ t: 'superseded', gen });
      setTimeout(() => old.close(), 300);
    }
    console.info('[mp] Gastgeber-Problem:', reason, '→ Generation', gen);
    const prevId = this.myId;
    const hello = () => ({ prevId, resume: this.hooks.hasRace() });
    // Zuerst: bisheriger Gastgeber noch erreichbar? (nur wenn er nicht eingefroren ist)
    if (reason !== 'frozen') {
      try {
        // Bisheriger Gastgeber – oder schon ein neuer, falls ein anderes Gerät schneller war
        await this.connectClient(this.lobby.code, [cur, gen], hello(), 6000);
        this.startClientTimers();
        this.migrating = false;
        console.info('[mp] Verbunden (Generation', this.lobby.gen + ')');
        return;
      } catch {
        // Gastgeber wirklich weg
      }
    }
    if (this.closed) return;
    this.hooks.notice(T.mp.hostGone);
    const oldHost = this.lobby.players.find((p) => p.host);
    // Reihenfolge der Übernahme: wie in der Lobby (ohne den alten Gastgeber und Getrennte)
    const rank = this.lobby.players.filter((p) => !p.host && p.connected).findIndex((p) => p.id === this.myId);
    const t0 = performance.now();
    let triedHost = false;
    while (!this.closed && performance.now() - t0 < NET.migrateTimeout) {
      // Nur ein Gerät, auf dem das Spiel gerade läuft, übernimmt
      if (!triedHost && rank >= 0 && this.hooks.alive() && performance.now() - t0 >= rank * NET.takeoverStagger) {
        triedHost = true;
        try {
          await this.takeOver(gen, oldHost?.id);
          this.migrating = false;
          return;
        } catch (e) {
          // ID schon vergeben: ein anderes Gerät war schneller – dann dort verbinden
          if ((e as Error).message !== ID_TAKEN) console.warn('[mp] Übernahme fehlgeschlagen', e);
        }
      }
      try {
        await this.connectClient(this.lobby.code, [gen, gen + 1], hello(), 6000);
        this.startClientTimers();
        this.migrating = false;
        console.info('[mp] Mit neuem Gastgeber verbunden, Generation', this.lobby.gen);
        return;
      } catch {
        await sleep(800);
      }
    }
    this.migrating = false;
    if (!this.closed) this.hooks.leave(T.mp.hostLost);
  }

  /** Dieses Gerät wird Gastgeber der Generation `gen`. */
  private async takeOver(gen: number, oldHostId: string | undefined) {
    const link = new HostLink();
    await link.openAt(this.lobby.code, gen);
    if (this.closed) {
      link.close();
      return;
    }
    this.role = 'host';
    this.attachHost(link);
    clearInterval(this.watchTimer);
    console.info('[mp] Übernommen: Gastgeber Generation', gen);
    this.lobby.gen = gen;
    this.lobby.racing = !!this.setup && this.hooks.hasRace();
    for (const p of this.lobby.players) {
      if (p.id === this.myId) {
        p.host = true;
        p.ready = true;
        p.connected = true;
        p.ping = 0;
      } else {
        // Alle anderen verbinden sich gleich neu; bis dahin fährt der Computer
        if (p.id === oldHostId) p.host = false;
        p.connected = false;
        p.ping = -1;
      }
    }
    this.loadedSet.clear();
    this.hooks.becameHost();
    if (this.setup) for (const h of this.setup.humans) if (h.playerId !== this.myId) this.hooks.connection(h.playerId, false);
    this.hooks.notice(T.mp.youAreHost);
    // Wer nach einer halben Minute nicht zurück ist, verschwindet aus der Lobby (nicht im Rennen)
    setTimeout(() => {
      if (!this.isHost || this.lobby.racing) return;
      this.lobby.players = this.lobby.players.filter((p) => p.connected);
      this.broadcastLobby();
    }, 30000);
    this.broadcastLobby();
    // Den anderen sagen, wer übernommen hat (sobald sie verbunden sind)
    setTimeout(() => {
      if (this.isHost) this.host?.broadcast({ t: 'notice', text: `${this.myName} ${T.mp.isNowHost}` });
    }, 4000);
  }

  /** Alter Gastgeber: ein anderes Gerät hat übernommen – als Mitspieler weiterspielen. */
  private async stepDown(gen: number) {
    if (!this.isHost || this.closed) return;
    clearTimeout(this.probeTimer);
    this.host?.close();
    this.host = null;
    this.role = 'client';
    this.hooks.becameClient();
    this.hooks.notice(T.mp.superseded);
    console.info('[mp] Abgelöst durch Generation', gen);
    const prevId = this.myId;
    const t0 = performance.now();
    while (!this.closed && performance.now() - t0 < 25000) {
      try {
        await this.connectClient(this.lobby.code, [gen, gen + 1, gen + 2], { prevId, resume: this.hooks.hasRace() }, 6000);
        this.startClientTimers();
        return;
      } catch {
        await sleep(1000);
      }
    }
    if (!this.closed) this.hooks.leave(T.mp.hostLost);
  }

  // ---------------------------------------------------------------- beide

  leave() {
    this.closed = true;
    clearInterval(this.pingTimer);
    clearInterval(this.watchTimer);
    clearTimeout(this.probeTimer);
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
