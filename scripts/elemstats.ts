// Statistik pro Strecke: Rundenzeit, Stürze, Stolperer, Abkürzungen … (npx tsx scripts/elemstats.ts)
import { AiDriver } from '../src/game/ai';
import { RaceSim } from '../src/game/simulation';
import { Track } from '../src/game/track';
import { ANIMALS } from '../src/animals/animals';
import { TRACKS } from '../src/tracks';
for (const data of TRACKS) {
  const track = new Track(data);
  const c: Record<string, number> = {};
  let laps: number[] = [];
  const sc = new Map<string, number>();
  for (let r = 0; r < 4; r++) {
    const ids = ANIMALS.map((a) => a.id).sort(() => 0.5 - ((r * 7919) % 13) / 13);
    const sim = new RaceSim(track, ids.slice(0, 8).map((id) => ({ animalId: id, human: false, aiLevel: (['leicht', 'mittel', 'schwer'] as const)[r % 3] })), undefined, r + 3);
    const drv = sim.animals.map((_, i) => new AiDriver(i, r + 3));
    const inSc = sim.animals.map(() => false);
    while (sim.phase !== 'done' && sim.time < 400) {
      sim.step(drv.map((d) => d.think(sim)));
      for (const e of sim.drainEvents()) c[e.type] = (c[e.type] ?? 0) + 1;
      sim.animals.forEach((a, i) => {
        if (a.shortcut >= 0 && !inSc[i]) sc.set(a.animalId, (sc.get(a.animalId) ?? 0) + 1);
        inSc[i] = a.shortcut >= 0;
      });
    }
    for (const a of sim.animals) if (a.finished) laps.push(a.finishTime / 3);
  }
  laps.sort((a, b) => a - b);
  console.log(`${data.name.padEnd(12)} Runde Ø ${laps[Math.floor(laps.length / 2)].toFixed(1)} s | Stürze ${c.fall ?? 0} Stolpern ${c.stumble ?? 0} Prallen ${c.bump ?? 0} Platschen ${c.splash ?? 0} Reifen ${c.hoop ?? 0} Schanzen ${c.ramp ?? 0} Gestoppt ${c.stunned ?? 0} | Abkürzungen: ${[...sc].map(([k, v]) => k + ':' + v).join(' ')}`);
}
