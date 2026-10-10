/**
 * Wie oft wird ein Tier pro Rennen «ausgebremst» (gestoppt) – und durch welche Superkraft?
 *   npx tsx scripts/stuns.ts 8
 */
import { AiDriver } from '../src/game/ai';
import { RaceSim } from '../src/game/simulation';
import { Track } from '../src/game/track';
import { ANIMALS } from '../src/animals/animals';
import { TRACKS } from '../src/tracks';

const races = Number(process.argv[2] ?? 6);
let stuns = 0;
let total = 0;
const bySource = new Map<string, number>();
const perVictim = new Map<string, number>();
for (const data of TRACKS) {
  const track = new Track(data);
  for (let r = 0; r < races; r++) {
    const ids = ANIMALS.map((a) => a.id);
    const pick = ids.slice(r % 3, (r % 3) + 8);
    const sim = new RaceSim(track, pick.map((id) => ({ animalId: id, human: false, aiLevel: 'mittel' as const })), undefined, r + 11);
    const drv = sim.animals.map((_, i) => new AiDriver(i, r + 11));
    while (sim.phase !== 'done' && sim.time < 400) {
      sim.step(drv.map((d) => d.think(sim)));
      for (const e of sim.drainEvents()) {
        if (e.type !== 'stunned') continue;
        stuns++;
        const src = e.by === undefined || e.by < 0 ? 'Lawine' : sim.animals[e.by].power;
        bySource.set(src, (bySource.get(src) ?? 0) + 1);
        const v = sim.animals[e.animal].animalId;
        perVictim.set(v, (perVictim.get(v) ?? 0) + 1);
      }
    }
    total += sim.animals.length;
  }
}
console.log(`Ausgebremst pro Tier und Rennen: ${(stuns / total).toFixed(2)}  (insgesamt ${stuns} in ${total / 8} Rennen)`);
console.log('nach Ursache:', [...bySource].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('je Opfer:', [...perVictim].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
