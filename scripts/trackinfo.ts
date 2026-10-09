/** Hilfsskript: zeigt Krümmung und Höhe entlang einer Strecke (zum Platzieren von Objekten). */
import { Track } from '../src/game/track';
import { TRACKS } from '../src/tracks';

const id = process.argv[2] ?? 'bauernhof';
const t = new Track(TRACKS.find((x) => x.id === id)!);
console.log(`${id}: Länge ${t.length} m`);
for (let s = 0; s < t.length; s += 20) {
  const i = t.indexAt(s);
  const k = t.curvature[i];
  const r = Math.abs(k) > 1e-4 ? (1 / Math.abs(k)).toFixed(0) : '∞';
  console.log(`${(s / t.length).toFixed(3)}  s=${s.toString().padStart(4)}  R=${r.padStart(5)} ${k > 0 ? 'R' : 'L'}  y=${t.py[i].toFixed(1)}  line=${t.racingLine[i].toFixed(1)}`);
}
