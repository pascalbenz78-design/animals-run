/** Prozedurale Texturen (im Browser per Canvas gezeichnet – keine Bilddateien nötig). */
import * as THREE from 'three';
import { mulberry32 } from '../game/rng';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function hex(n: number) {
  return '#' + n.toString(16).padStart(6, '0');
}

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Erdweg: Grundfarbe mit Körnung, Hufspuren und dunkleren Rändern. u = quer, v = entlang. */
export function dirtTexture(base: number, edge: number, seed = 1): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rnd = mulberry32(seed);
  g.fillStyle = hex(base);
  g.fillRect(0, 0, 256, 256);
  // Körnung
  for (let i = 0; i < 3500; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? 'rgba(80,50,20,0.10)' : 'rgba(255,240,210,0.10)';
    const s = 1 + rnd() * 3;
    g.fillRect(rnd() * 256, rnd() * 256, s, s);
  }
  // Kieselsteine
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(${150 + rnd() * 60},${130 + rnd() * 50},${110 + rnd() * 40},0.8)`;
    g.beginPath();
    g.ellipse(20 + rnd() * 216, rnd() * 256, 1.5 + rnd() * 2.5, 1 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Hufspuren in zwei Fahrspuren
  g.fillStyle = 'rgba(70,40,15,0.18)';
  for (let i = 0; i < 40; i++) {
    const lane = rnd() < 0.5 ? 85 : 170;
    g.beginPath();
    g.ellipse(lane + (rnd() - 0.5) * 50, rnd() * 256, 4, 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Ränder
  const grad = g.createLinearGradient(0, 0, 256, 0);
  const e = hex(edge);
  grad.addColorStop(0, e);
  grad.addColorStop(0.06, e + '00');
  grad.addColorStop(0.94, e + '00');
  grad.addColorStop(1, e);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // Grasbüschel am Rand
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${70 + rnd() * 30},${140 + rnd() * 40},${40 + rnd() * 20},0.9)`;
    const x = rnd() < 0.5 ? rnd() * 10 : 246 + rnd() * 10;
    g.fillRect(x, rnd() * 256, 2, 4 + rnd() * 4);
  }
  return finish(c);
}

export function checkerTexture(cells = 8): THREE.CanvasTexture {
  const [c, g] = canvas(128, 32);
  const w = 128 / cells;
  for (let x = 0; x < cells; x++)
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      g.fillRect(x * w, y * 16, w, 16);
    }
  const t = finish(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function bannerTexture(text: string): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 128);
  g.fillStyle = '#ff7a1a';
  g.fillRect(0, 0, 1024, 128);
  for (let x = 0; x < 1024; x += 32) {
    g.fillStyle = (x / 32) % 2 ? '#111' : '#fff';
    g.fillRect(x, 0, 32, 14);
    g.fillStyle = (x / 32) % 2 ? '#fff' : '#111';
    g.fillRect(x, 114, 32, 14);
  }
  g.font = 'bold 76px "Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#5a2a00';
  g.strokeText(text, 512, 68);
  g.fillStyle = '#fff6d8';
  g.fillText(text, 512, 68);
  return finish(c, false);
}

/** Weicher runder Fleck (für Schatten-Kleckse und Leuchten). */
export function blobTexture(inner = 'rgba(0,0,0,0.55)'): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return finish(c, false);
}
