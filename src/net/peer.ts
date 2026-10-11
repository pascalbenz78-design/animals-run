/**
 * Verbindungen über WebRTC (PeerJS): Der Gastgeber erhält eine Peer-ID aus dem Raumcode,
 * Mitspieler verbinden sich mit dieser ID. Alle Nachrichten sind JSON-Text.
 * Übernimmt nach einem Ausfall ein anderes Gerät, erhält es die ID der nächsten «Generation»
 * (Code-1, Code-2 …) – der Raumcode bleibt für alle gleich.
 */
import Peer, { type DataConnection } from 'peerjs';
import { NET } from '../config/net';
import { T } from '../config/texts';
import { decode, encode, type Msg } from './protocol';

export function randomCode(): string {
  let c = '';
  for (let i = 0; i < NET.codeLength; i++) c += NET.codeChars[Math.floor(Math.random() * NET.codeChars.length)];
  return c;
}

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, NET.codeLength);
}

/** Peer-ID des Gastgebers einer Generation (0 = ursprünglicher Gastgeber) */
export function hostPeerId(code: string, gen: number): string {
  return NET.idPrefix + code + (gen > 0 ? '-' + gen : '');
}

/** Fehler «ID schon vergeben» (beim Übernehmen: jemand anderes war schneller) */
export const ID_TAKEN = 'id-taken';

function makePeer(id?: string): Peer {
  const opts = { config: { iceServers: NET.iceServers }, debug: 1 };
  return id ? new Peer(id, opts) : new Peer(opts);
}

/** Verständliche Fehlermeldung (Deutsch) zu einem PeerJS-Fehlertyp */
export function errorText(type: string): string {
  switch (type) {
    case 'peer-unavailable':
      return T.mp.errNotFound;
    case 'browser-incompatible':
      return T.mp.errBrowser;
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return T.mp.errServer;
    default:
      return T.mp.errGeneric;
  }
}

/** Gastgeber: nimmt Verbindungen an */
export class HostLink {
  readonly links = new Map<string, DataConnection>();
  onMessage: (from: string, msg: Msg) => void = () => {};
  onClose: (from: string) => void = () => {};
  onFatal: (text: string) => void = () => {};
  private peer: Peer | null = null;
  code = '';

  /** Raum eröffnen; bei schon vergebenem Code wird ein neuer versucht. */
  open(): Promise<string> {
    return this.listen(() => randomCode(), 0, 5);
  }

  /** Gastgeber übernehmen: feste ID der Generation `gen`. Schon vergeben → Fehler ID_TAKEN. */
  openAt(code: string, gen: number): Promise<string> {
    return this.listen(() => code, gen, 0);
  }

  private listen(makeCode: () => string, gen: number, retries: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const code = makeCode();
        const peer = makePeer(hostPeerId(code, gen));
        peer.on('open', () => {
          this.peer = peer;
          this.code = code;
          resolve(code);
        });
        peer.on('connection', (conn) => this.accept(conn));
        peer.on('error', (err: { type: string }) => {
          if (err.type === 'unavailable-id' && tries++ < retries) {
            peer.destroy();
            attempt();
            return;
          }
          if (!this.peer) {
            peer.destroy();
            reject(new Error(err.type === 'unavailable-id' ? ID_TAKEN : errorText(err.type)));
          }
          else if (err.type !== 'peer-unavailable') this.onFatal(errorText(err.type));
        });
        peer.on('disconnected', () => {
          // Verbindung zum Vermittlungsserver weg: bestehende Spielverbindungen laufen weiter
          if (this.peer === peer && !peer.destroyed) peer.reconnect();
        });
      };
      attempt();
    });
  }

  private accept(conn: DataConnection) {
    conn.on('open', () => this.links.set(conn.peer, conn));
    conn.on('data', (data) => {
      const msg = typeof data === 'string' ? decode(data) : null;
      if (msg) this.onMessage(conn.peer, msg);
    });
    const closed = () => {
      if (!this.links.has(conn.peer)) return;
      this.links.delete(conn.peer);
      this.onClose(conn.peer);
    };
    conn.on('close', closed);
    conn.on('error', closed);
    conn.peerConnection?.addEventListener?.('connectionstatechange', () => {
      const st = conn.peerConnection.connectionState;
      if (st === 'failed' || st === 'disconnected' || st === 'closed') closed();
    });
  }

  send(to: string, msg: Msg | string) {
    const c = this.links.get(to);
    if (c?.open) c.send(typeof msg === 'string' ? msg : encode(msg));
  }

  broadcast(msg: Msg | string) {
    const text = typeof msg === 'string' ? msg : encode(msg);
    for (const c of this.links.values()) if (c.open) c.send(text);
  }

  kick(to: string) {
    this.links.get(to)?.close();
    this.links.delete(to);
  }

  close() {
    for (const c of this.links.values()) c.close();
    this.links.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

/** Mitspieler: verbindet sich mit dem Gastgeber */
export class ClientLink {
  onMessage: (msg: Msg) => void = () => {};
  onClose: () => void = () => {};
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private closed = false;

  /**
   * Mit dem Gastgeber verbinden. Probiert die Generationen `gens` der Reihe nach (nach einem
   * Gastgeber-Wechsel hat der Raum eine neue ID). Gibt die Generation zurück, die geantwortet hat.
   */
  connect(code: string, gens: number[] = [0, 1, 2, 3, 4, 5, 6, 7], totalTimeout = 15000): Promise<number> {
    return new Promise((resolve, reject) => {
      const peer = makePeer();
      this.peer = peer;
      let opened = false;
      let attempt = -1;
      let attemptTimer = 0;
      const fail = (text: string) => {
        if (opened) return;
        opened = true; // keine weiteren Versuche
        clearTimeout(timer);
        clearTimeout(attemptTimer);
        this.close();
        reject(new Error(text));
      };
      const timer = setTimeout(() => fail(T.mp.errTimeout), totalTimeout);
      const tryNext = () => {
        clearTimeout(attemptTimer);
        if (opened) return;
        this.conn?.close();
        attempt++;
        if (attempt >= gens.length) return fail(T.mp.errNotFound);
        const mine = attempt;
        const conn = peer.connect(hostPeerId(code, gens[mine]), { reliable: true, serialization: 'raw' });
        this.conn = conn;
        // Antwortet ein (abgestürzter) Gastgeber gar nicht, nach kurzer Zeit die nächste Generation probieren
        attemptTimer = window.setTimeout(() => {
          if (!opened && attempt === mine) tryNext();
        }, 4000);
        conn.on('open', () => {
          if (opened || attempt !== mine) return;
          opened = true;
          clearTimeout(timer);
          clearTimeout(attemptTimer);
          resolve(gens[mine]);
        });
        conn.on('data', (data) => {
          if (this.conn !== conn) return;
          const msg = typeof data === 'string' ? decode(data) : null;
          if (msg) this.onMessage(msg);
        });
        const lost = () => {
          if (this.conn !== conn || !opened || this.closed) return;
          this.closed = true;
          this.onClose();
        };
        conn.on('close', lost);
        conn.on('error', lost);
        conn.peerConnection?.addEventListener?.('connectionstatechange', () => {
          const st = conn.peerConnection.connectionState;
          if (st === 'failed' || st === 'closed') lost();
        });
      };
      peer.on('open', () => tryNext());
      peer.on('error', (err: { type: string }) => {
        if (opened) return;
        if (err.type === 'peer-unavailable') tryNext();
        else fail(errorText(err.type));
      });
      peer.on('disconnected', () => {
        if (opened && !this.closed && !peer.destroyed) peer.reconnect();
      });
    });
  }

  send(msg: Msg) {
    if (this.conn?.open) this.conn.send(encode(msg));
  }

  close() {
    this.closed = true;
    this.conn?.close();
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
  }
}
