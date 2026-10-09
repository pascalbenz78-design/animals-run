/**
 * Hilfsskript: prüft Strecken (Länge, engste Kurve, Abstand zwischen Streckenteilen) und zeigt
 * eine kleine Karte sowie das Kurvenprofil (zum Platzieren von Objekten).
 *   npx tsx scripts/trackinfo.ts            – Übersicht aller Strecken
 *   npx tsx scripts/trackinfo.ts alpen      – Details einer Strecke
 */
import { Track } from '../src/game/track';
import { TRACKS } from '../src/tracks';

const id = process.argv[2];

function summary(t: Track) {
  let minR = Infinity;
  for (let i = 0; i < t.count; i++) minR = Math.min(minR, 1 / Math.max(1e-4, Math.abs(t.curvature[i])));
  // Kleinster Abstand zwischen Streckenteilen, die entlang der Strecke weit auseinander liegen
  let minGap = Infinity;
  for (let i = 0; i < t.count; i += 3)
    for (let j = i + 60; j < t.count; j += 3) {
      if (t.count - (j - i) < 60) continue;
      minGap = Math.min(minGap, Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]));
    }
  const ok = minGap > t.data.width + 6 && minR > 10;
  console.log(
    `${t.data.name.padEnd(22)} Länge ${String(t.length).padStart(4)} m · engste Kurve R=${minR.toFixed(0)} m · Abstand Teile ${minGap.toFixed(0)} m ${ok ? '✓' : '⚠'}`,
  );
}

function map(t: Track) {
  const W = 70;
  const H = 30;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < t.count; i++) {
    minX = Math.min(minX, t.px[i]);
    maxX = Math.max(maxX, t.px[i]);
    minZ = Math.min(minZ, t.pz[i]);
    maxZ = Math.max(maxZ, t.pz[i]);
  }
  const grid = Array.from({ length: H }, () => new Array(W).fill(' '));
  for (let i = 0; i < t.count; i++) {
    const x = Math.round(((t.px[i] - minX) / (maxX - minX)) * (W - 1));
    const y = Math.round(((t.pz[i] - minZ) / (maxZ - minZ)) * (H - 1));
    const f = i / t.count;
    grid[y][x] = i < 3 ? 'S' : String(Math.floor(f * 10));
  }
  console.log(grid.map((r) => r.join('')).join('\n'));
}

if (!id) {
  for (const d of TRACKS) summary(new Track(d));
} else {
  const t = new Track(TRACKS.find((x) => x.id === id)!);
  summary(t);
  map(t);
  for (let s = 0; s < t.length; s += 20) {
    const i = t.indexAt(s);
    const k = t.curvature[i];
    const r = Math.abs(k) > 1e-4 ? (1 / Math.abs(k)).toFixed(0) : '∞';
    console.log(`${(s / t.length).toFixed(3)}  s=${s.toString().padStart(4)}  R=${r.padStart(5)} ${k > 0 ? 'R' : 'L'}  y=${t.py[i].toFixed(1)}`);
  }
}
