/**
 * Kopfloser Renn-Test: Computergegner fahren gegeneinander (ohne Grafik).
 * Prüft Renndauer, Energie-Haushalt und Balance (Durchschnittsplatz pro Tier).
 *
 *   npm run sim                 – 20 Rennen auf allen Strecken, Stufe mittel
 *   npm run sim -- 50 schwer    – 50 Rennen, Stufe schwer
 */
import { AiDriver } from '../src/game/ai';
import { RaceSim } from '../src/game/simulation';
import { Track } from '../src/game/track';
import type { AiLevel, Entrant } from '../src/game/types';
import { ANIMALS } from '../src/animals/animals';
import { TRACKS } from '../src/tracks';

const races = Number(process.argv[2] ?? 20);
const level = (process.argv[3] ?? 'mittel') as AiLevel;

const placeSum = new Map<string, { sum: number; n: number; wins: number }>();
let raceTimes: number[] = [];
let lapTimes: number[] = [];
let minEnergy = 100;
let stumbles = 0;
let bolts = 0;

for (const data of TRACKS) {
  const track = new Track(data);
  raceTimes = [];
  for (let r = 0; r < races; r++) {
    const entrants: Entrant[] = [];
    for (let i = 0; i < 8; i++) entrants.push({ animalId: ANIMALS[(i + r) % ANIMALS.length].id, human: false, aiLevel: level });
    const sim = new RaceSim(track, entrants);
    const drivers = sim.animals.map((_, i) => new AiDriver(i, r + 1));
    let guard = 0;
    while (sim.phase !== 'done' && guard++ < 60 * 600) {
      sim.step(drivers.map((d) => d.think(sim)));
      for (const e of sim.drainEvents()) {
        if (e.type === 'stumble') stumbles++;
        if (e.type === 'bolt') bolts++;
      }
      for (const a of sim.animals) minEnergy = Math.min(minEnergy, a.energy);
    }
    for (const a of sim.animals) {
      const e = placeSum.get(a.animalId) ?? { sum: 0, n: 0, wins: 0 };
      e.sum += a.place;
      e.n++;
      if (a.place === 1) e.wins++;
      placeSum.set(a.animalId, e);
      if (a.finished) {
        raceTimes.push(a.finishTime);
        lapTimes.push(a.bestLap);
      }
    }
    if (guard >= 60 * 600) console.log('WARNUNG: Rennen nicht beendet (Zeitlimit)');
  }
  raceTimes.sort((a, b) => a - b);
  const med = raceTimes[Math.floor(raceTimes.length / 2)];
  console.log(
    `${data.name}: Rennzeit schnellste ${raceTimes[0].toFixed(1)} s, Median ${med.toFixed(1)} s, langsamste ${raceTimes[raceTimes.length - 1].toFixed(1)} s`,
  );
}
lapTimes.sort((a, b) => a - b);
console.log(`Beste Runde: ${lapTimes[0].toFixed(1)} s, Median beste Runde: ${lapTimes[Math.floor(lapTimes.length / 2)].toFixed(1)} s`);
console.log(`Tiefste Energie: ${minEnergy.toFixed(1)}  ·  Stolperer/Rennen: ${(stumbles / races / TRACKS.length).toFixed(1)}  ·  Blitze/Rennen: ${(bolts / races / TRACKS.length).toFixed(1)}`);
console.log('Balance (Durchschnittsplatz, Siege):');
for (const [id, e] of placeSum) console.log(`  ${id.padEnd(8)} Ø Platz ${(e.sum / e.n).toFixed(2)}   Siege ${((e.wins / (races * TRACKS.length)) * 100).toFixed(0)} %`);
