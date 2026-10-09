/** Diagnose: Details eines Rennens pro Tier (Stolperer, Energie, Wandkontakt). */
import { AiDriver } from '../src/game/ai';
import { RaceSim } from '../src/game/simulation';
import { Track } from '../src/game/track';
import { ANIMALS } from '../src/animals/animals';
import { TRACKS } from '../src/tracks';

const track = new Track(TRACKS[0]);
const sim = new RaceSim(track, Array.from({ length: 8 }, (_, i) => ({ animalId: ANIMALS[i % 2].id, human: false, aiLevel: 'mittel' as const })));
const drivers = sim.animals.map((_, i) => new AiDriver(i, 3));
const info = sim.animals.map(() => ({ stumble: [] as number[], minE: 100, bolts: 0, wall: 0, coast: 0 }));
while (sim.phase !== 'done') {
  const inputs = drivers.map((d) => d.think(sim));
  sim.step(inputs);
  sim.animals.forEach((a, i) => {
    info[i].minE = Math.min(info[i].minE, a.energy);
    if (Math.abs(a.d) > track.halfWidth - sim.stats[i].radius - 0.3) info[i].wall++;
    if (!inputs[i].vorwaerts && sim.phase === 'running') info[i].coast++;
  });
  for (const e of sim.drainEvents()) {
    if (e.type === 'stumble') info[e.animal].stumble.push(Math.round(sim.animals[e.animal].s));
    if (e.type === 'bolt') info[e.animal].bolts++;
  }
}
sim.animals.forEach((a, i) =>
  console.log(`${a.animalId.padEnd(7)} Platz ${a.place} Zeit ${a.finishTime.toFixed(1)} minE ${info[i].minE.toFixed(0)} Blitze ${info[i].bolts} Wand ${(info[i].wall / 60).toFixed(1)}s Auslaufen ${(info[i].coast / 60).toFixed(1)}s Stolpern bei s=${info[i].stumble.join(',')}`),
);
