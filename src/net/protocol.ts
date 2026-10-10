/**
 * Mehrspieler-Protokoll: Nachrichten zwischen Gastgeber und Mitspielern (als JSON-Text).
 */
import type { AiLevel, Entrant, Input, SimEvent } from '../game/types';
import type { Snapshot } from './sync';

export type GameMode = 'einzel' | 'cup';

export interface PlayerInfo {
  /** Verbindungs-ID (beim Gastgeber «host») */
  id: string;
  name: string;
  animal: string | null;
  ready: boolean;
  /** Ping in Millisekunden (−1 = unbekannt) */
  ping: number;
  host: boolean;
  connected: boolean;
}

export interface LobbyState {
  code: string;
  mode: GameMode;
  track: string;
  cup: string;
  level: AiLevel;
  players: PlayerInfo[];
  /** Läuft gerade ein Rennen? */
  racing: boolean;
}

export interface CupInfo {
  id: string;
  name: string;
  tracks: string[];
  index: number;
  points: Record<string, number>;
  gained: Record<string, number>;
}

/** Alles, was ein Gerät braucht, um dasselbe Rennen aufzubauen */
export interface RaceSetup {
  trackId: string;
  laps: number;
  seed: number;
  entrants: Entrant[];
  /** Welcher Mensch welches Tier steuert */
  humans: { playerId: string; animal: string }[];
  cup: CupInfo | null;
}

export type Msg =
  | { t: 'hello'; name: string; token: string; version: number }
  | { t: 'welcome'; playerId: string; lobby: LobbyState }
  | { t: 'reject'; reason: string }
  | { t: 'lobby'; lobby: LobbyState }
  | { t: 'pick'; animal: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'ping'; at: number; rtt: number }
  | { t: 'pong'; at: number }
  | { t: 'start'; setup: RaceSetup }
  | { t: 'input'; seq: number; b: number }
  | { t: 'snap'; ack: number; s: Snapshot; ev: SimEvent[] }
  | { t: 'results'; cup: CupInfo | null }
  | { t: 'ceremony'; cup: CupInfo }
  | { t: 'toLobby' }
  | { t: 'notice'; text: string }
  /** Mitspieler hat die Strecken-Info gelesen und ist bereit */
  | { t: 'loaded' };

export const PROTOCOL_VERSION = 2;

/** Eingabe als Bitfeld (klein für die Übertragung) */
export function packInput(i: Input): number {
  return (i.vorwaerts ? 1 : 0) | (i.links ? 2 : 0) | (i.rechts ? 4 : 0) | (i.springen ? 8 : 0) | (i.superkraft ? 16 : 0);
}

export function unpackInput(b: number): Input {
  return { vorwaerts: !!(b & 1), links: !!(b & 2), rechts: !!(b & 4), springen: !!(b & 8), superkraft: !!(b & 16) };
}

/** Zahlen beim Senden auf 3 Nachkommastellen runden (spart Platz) */
export function encode(msg: Msg): string {
  return JSON.stringify(msg, (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v));
}

export function decode(text: string): Msg | null {
  try {
    return JSON.parse(text) as Msg;
  } catch {
    return null;
  }
}
