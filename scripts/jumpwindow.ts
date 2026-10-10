/** Zeitfenster (in Sekunden) für einen fehlerfreien Sprung über jede Hürdenart, je Tierart bei Höchsttempo. */
import { ELEMENTS, OBSTACLES, PHYSICS, STAT_SCALE } from '../src/config/balance';
import { SPECIES_STATS } from '../src/animals/animals';
for (const [sp, st] of Object.entries(SPECIES_STATS)) {
  const v0 = STAT_SCALE.jumpVelocity[st.sprung];
  const g = PHYSICS.gravity;
  const row = Object.entries(ELEMENTS.hurdleHeight).map(([k, h]) => {
    const need = h - OBSTACLES.hurdleTolerance;
    const disc = v0 * v0 - 2 * g * need;
    const win = disc > 0 ? (2 * Math.sqrt(disc)) / g : 0;
    return `${k} ${win.toFixed(2)} s`;
  });
  console.log(`${sp.padEnd(8)} Sprunghöhe ${(v0 * v0 / (2 * PHYSICS.gravity)).toFixed(2)} m · ${row.join(' · ')}`);
}
