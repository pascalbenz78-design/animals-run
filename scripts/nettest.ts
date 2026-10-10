/**
 * Test des Mehrspieler-Abgleichs ohne Netzwerk: Gastgeber und Mitspieler im selben Prozess,
 * Nachrichten mit künstlicher Verzögerung. Prüft, dass die Vorhersage nur kleine Korrekturen braucht
 * und beide am Ende dasselbe Ergebnis sehen.
 *   npx tsx scripts/nettest.ts            – 60 ms Verzögerung je Richtung
 *   npx tsx scripts/nettest.ts 150        – 150 ms
 */
import { SIM_DT } from '../src/config/balance';
import { AiDriver } from '../src/game/ai';
import { RaceSim } from '../src/game/simulation';
import { Track } from '../src/game/track';
import type { Entrant } from '../src/game/types';
import { decode, type Msg } from '../src/net/protocol';
import { ClientRaceSync, HostRaceSync } from '../src/net/raceSync';
import { getTrack } from '../src/tracks';

const latencyMs = Number(process.argv[2] ?? 60);
const trackId = process.argv[3] ?? 'vulkan';
const delayTicks = Math.round(latencyMs / 1000 / SIM_DT);

const track = new Track(getTrack(trackId));
const entrants: Entrant[] = [
  { animalId: 'lenni', human: true, aiLevel: 'mittel' }, // Gastgeber
  { animalId: 'aramis', human: true, aiLevel: 'mittel' }, // Mitspieler
  ...['simba', 'tira', 'gonzi', 'helja', 'shadow', 'ray'].map((id) => ({ animalId: id, human: false, aiLevel: 'mittel' as const })),
];
const seed = 42;
const host = new RaceSim(track, entrants, 3, seed);
const client = new RaceSim(track, entrants, 3, seed);
const hostMe = host.animals.findIndex((a) => a.animalId === 'lenni');
const clientMe = client.animals.findIndex((a) => a.animalId === 'aramis');

// Netz mit Verzögerung
let tick = 0;
const toHost: { at: number; text: string }[] = [];
const toClient: { at: number; text: string }[] = [];

const hostSync = new HostRaceSync(host, hostMe, [{ playerId: 'c1', index: clientMe }], (_id, text) => toClient.push({ at: tick + delayTicks, text }));
const clientSync = new ClientRaceSync(client, clientMe, (seq, b) => toHost.push({ at: tick + delayTicks, text: JSON.stringify({ t: 'input', seq, b }) }));

const hostDrivers = host.animals.map((_, i) => new AiDriver(i, 7));
const clientDrivers = client.animals.map((_, i) => new AiDriver(i, 7));
// «Menschen» werden hier von Computergegnern gespielt, die auf ihrem eigenen Gerät entscheiden
const hostPlayer = new AiDriver(hostMe, 99);
const clientPlayer = new AiDriver(clientMe, 123);

let corrections = 0;
let corrSum = 0;
let corrMax = 0;
let hostEvents = 0;
let clientEvents = 0;

while (host.phase !== 'done' && tick < 60 * 400) {
  tick++;
  // Nachrichten zustellen
  while (toHost.length && toHost[0].at <= tick) {
    const m = decode(toHost.shift()!.text) as Extract<Msg, { t: 'input' }>;
    hostSync.setInput('c1', m.seq, m.b);
  }
  while (toClient.length && toClient[0].at <= tick) {
    const m = decode(toClient.shift()!.text) as Extract<Msg, { t: 'snap' }>;
    clientSync.onSnapshot(m.s, m.ack, m.ev);
  }
  // Gastgeber rechnet verbindlich
  const hostInputs = hostSync.inputs(hostPlayer.think(host), hostDrivers, false);
  host.step(hostInputs);
  const ev = host.drainEvents();
  hostEvents += ev.length;
  hostSync.afterStep(ev);
  // Mitspieler rechnet vor
  const before = { x: client.animals[clientMe].x, z: client.animals[clientMe].z };
  const evs = clientSync.step(clientPlayer.think(client), clientDrivers);
  clientEvents += evs.length;
  const o = clientSync.offsets[clientMe];
  const c = Math.hypot(o.x, o.z);
  if (evs.length || c > 0) {
    if (c > 0) {
      corrections++;
      corrSum += c;
      corrMax = Math.max(corrMax, c);
    }
  }
  void before;
  // Versatz wie in der Darstellung abbauen
  for (const off of clientSync.offsets) {
    off.x *= Math.exp(-10 * SIM_DT);
    off.z *= Math.exp(-10 * SIM_DT);
  }
}
// Letzte Nachrichten zustellen
for (let k = 0; k < delayTicks + 2; k++) {
  tick++;
  while (toClient.length && toClient[0].at <= tick) {
    const m = decode(toClient.shift()!.text) as Extract<Msg, { t: 'snap' }>;
    clientSync.onSnapshot(m.s, m.ack, m.ev);
  }
  clientEvents += clientSync.step(clientPlayer.think(client), clientDrivers).length;
}

const order = (s: RaceSim) => [...s.animals].sort((a, b) => a.place - b.place).map((a) => a.animalId).join(' ');
console.log(`Verzögerung ${latencyMs} ms je Richtung, Strecke ${trackId}`);
console.log(`Rennzeit Gastgeber ${host.time.toFixed(1)} s · Phase Mitspieler: ${client.phase}`);
console.log(`Reihenfolge Gastgeber: ${order(host)}`);
console.log(`Reihenfolge Mitspieler: ${order(client)}`);
console.log(`Ereignisse: Gastgeber ${hostEvents}, beim Mitspieler angekommen ${clientEvents}`);
console.log(`Korrekturen am eigenen Tier: Ø ${(corrSum / Math.max(1, corrections)).toFixed(3)} m, max ${corrMax.toFixed(2)} m`);
const same = order(host) === order(client) && client.phase === 'done' && hostEvents === clientEvents;
console.log(same ? 'OK: gleiches Ergebnis auf beiden Geräten' : 'FEHLER: Ergebnisse unterscheiden sich');
process.exit(same ? 0 : 1);
