/** Diagnose: Details eines Rennens pro Tier (Stolperer, Energie, Superkräfte, Treffer). */
import { AiDriver } from '../src/game/ai';
import { RaceSim } from '../src/game/simulation';
import { Track } from '../src/game/track';
import { ANIMALS } from '../src/animals/animals';
import { TRACKS } from '../src/tracks';

const seed = Number(process.argv[2] ?? 3);
const track = new Track(TRACKS[0]);
const ids = ANIMALS.map((a) => a.id);
const pick = Array.from({ length: 8 }, (_, i) => ids[(i + seed) % ids.length]);
const sim = new RaceSim(track, pick.map((id) => ({ animalId: id, human: false, aiLevel: 'mittel' as const })), undefined, seed);
const drivers = sim.animals.map((_, i) => new AiDriver(i, seed));
const info = sim.animals.map(() => ({ stumble: 0, minE: 100, bolts: 0, icons: 0, powers: 0, stunned: 0, hits: 0, items: [] as number[], stuckMax: 0, stuck: 0 }));
while (sim.phase !== 'done' && sim.time < 400) {
  sim.step(drivers.map((d) => d.think(sim)));
  sim.animals.forEach((a, i) => {
    info[i].minE = Math.min(info[i].minE, a.energy);
    if (sim.phase === 'running' && a.speed < 1 && !a.finished) info[i].stuck += 1 / 60;
    else info[i].stuck = 0;
    if (info[i].stuck > info[i].stuckMax) info[i].stuckMax = info[i].stuck;
    if (info[i].stuck > 5 && Math.abs(info[i].stuck - 5) < 0.01)
      console.log(`  ! ${a.animalId} steckt fest bei s=${a.s.toFixed(0)} d=${a.d.toFixed(1)} stun=${a.stun.toFixed(1)} stumble=${a.stumble.toFixed(1)} active=${a.active}`);
  });
  for (const e of sim.drainEvents()) {
    const r = info[e.animal];
    if (e.type === 'stumble') r.stumble++;
    if (e.type === 'bolt') r.bolts++;
    if (e.type === 'icon') r.icons++;
    if (e.type === 'power') r.powers++;
    if (e.type === 'stunned') {
      r.stunned++;
      if (e.by !== undefined) info[e.by].hits++;
    }
    if (e.type === 'item') r.items.push(e.value!);
  }
}
sim.animals.forEach((a, i) => {
  const r = info[i];
  console.log(
    `${a.animalId.padEnd(7)} Platz ${a.place} Zeit ${a.finished ? a.finishTime.toFixed(1) : '---'} minE ${r.minE.toFixed(0)} Blitze ${r.bolts} Icons ${r.icons} Kräfte ${r.powers} Treffer ${r.hits} Gestoppt ${r.stunned} Stolpern ${r.stumble} Items ${r.items.join('')} Stillstand max ${r.stuckMax.toFixed(1)}s`,
  );
});
