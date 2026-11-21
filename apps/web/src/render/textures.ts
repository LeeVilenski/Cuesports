import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { TableSpec } from '@cuesports/shared';

/** Placeholder art, drawn to canvases at runtime. Final art can replace these without touching the scene. */

const POOL: Record<number, string> = {
  1: '#f2b705',
  2: '#1d4fbf',
  3: '#d4232b',
  4: '#5b2d91',
  5: '#f06a12',
  6: '#127a3e',
  7: '#7d1b1f',
  8: '#121212',
};

const SNOOKER: Record<string, string> = {
  yellow: '#f2c419',
  green: '#138046',
  brown: '#6e3d17',
  blue: '#1d4fbf',
  pink: '#f08cb0',
  black: '#121212',
};

export interface BallArt {
  base: string;
  stripe: string | null;
  number: string | null;
  spots: boolean;
}

export function ballArt(id: string): BallArt {
  if (id === 'cue') return { base: '#f7f3e8', stripe: null, number: null, spots: true };
  // Russian Pyramid: ivory balls with numbers, and a coloured cue ball.
  if (id === 'pcue') return { base: '#c9402c', stripe: null, number: null, spots: false };
  if (/^p\d+$/.test(id)) return { base: '#f3ead2', stripe: null, number: id.slice(1), spots: false };
  // English Billiards' second cue ball: yellow (as in the modern game, in place of the spot white).
  if (id === 'spot') return { base: '#f2c419', stripe: null, number: null, spots: false };
  if (id.startsWith('red') || /^r\d+$/.test(id))
    return { base: '#c4161c', stripe: null, number: null, spots: false };
  if (/^y\d+$/.test(id)) return { base: '#f2c419', stripe: null, number: null, spots: false };
  const snooker = SNOOKER[id];
  if (snooker) return { base: snooker, stripe: null, number: null, spots: false };
  const n = Number(id);
  if (Number.isInteger(n) && n >= 1 && n <= 15) {
    const colour = POOL[n > 8 ? n - 8 : n]!;
    return n > 8
      ? { base: '#f7f3e8', stripe: colour, number: id, spots: false }
      : { base: colour, stripe: null, number: id, spots: false };
  }
  return { base: '#999999', stripe: null, number: id, spots: false };
}

const cache = new Map<string, Texture>();

/** Equirectangular ball texture (2:1). Number discs sit on the equator, where there is no distortion. */
export function ballTexture(id: string): Texture {
  const art = ballArt(id);
  const key = JSON.stringify(art);
  const hit = cache.get(key);
  if (hit) return hit;
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = art.base;
  g.fillRect(0, 0, w, h);
  if (art.stripe) {
    g.fillStyle = art.stripe;
    g.fillRect(0, h * 0.29, w, h * 0.42);
  }
  if (art.number) {
    for (const u of [0.25, 0.75]) {
      const x = u * w;
      const y = h / 2;
      g.fillStyle = '#f7f3e8';
      g.beginPath();
      g.arc(x, y, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.font = `bold ${art.number.length > 1 ? 30 : 36}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(art.number, x, y + 2);
    }
  }
  if (art.spots) {
    // Red spots (as on a TV "spot" cue ball) make spin visible.
    g.fillStyle = '#c62026';
    for (const u of [0, 0.25, 0.5, 0.75]) {
      g.beginPath();
      g.arc(u * w, h / 2, 9, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(0, 0, w, 7);
    g.fillRect(0, h - 7, w, 7);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Soft radial blob used as a contact shadow under each ball. */
export function shadowTexture(): Texture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new CanvasTexture(c);
}

export function clothColour(table: TableSpec): string {
  return table.id.startsWith('american') ? '#1b5c8e' : '#1d6b3f';
}

/**
 * Cloth texture covering ±ex × ±ey metres: colour with a little noise, the table markings, and the
 * pocket holes (radial gradients, which read as holes from any camera height).
 */
export function clothTexture(table: TableSpec, ex: number, ey: number, colour = clothColour(table)): Texture {
  const w = 2048;
  const h = Math.round((w * ey) / ex);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const X = (x: number) => ((x + ex) / (2 * ex)) * w;
  const Y = (y: number) => ((ey - y) / (2 * ey)) * h;
  const S = w / (2 * ex);
  g.fillStyle = colour;
  g.fillRect(0, 0, w, h);
  // Fine noise so the cloth doesn't look like plastic.
  const img = g.getImageData(0, 0, w, h);
  let seed = 12345;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const n = ((seed >> 16) & 15) - 7;
    img.data[i] = img.data[i]! + n;
    img.data[i + 1] = img.data[i + 1]! + n;
    img.data[i + 2] = img.data[i + 2]! + n;
  }
  g.putImageData(img, 0, 0);

  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = Math.max(1.5, 0.003 * S);
  for (const m of table.markings) {
    if (m.type === 'line') {
      g.beginPath();
      g.moveTo(X(m.a.x), Y(m.a.y));
      g.lineTo(X(m.b.x), Y(m.b.y));
      g.stroke();
    } else if (m.type === 'arc') {
      g.beginPath();
      // Canvas y points down, so angles are mirrored.
      g.arc(
        X(m.centre.x),
        Y(m.centre.y),
        m.radius * S,
        (-m.endDeg * Math.PI) / 180,
        (-m.startDeg * Math.PI) / 180,
      );
      g.stroke();
    } else {
      g.beginPath();
      g.arc(X(m.position.x), Y(m.position.y), 0.006 * S, 0, Math.PI * 2);
      g.fill();
    }
  }

  for (const p of table.pockets) {
    const r = p.fallRadius * S;
    const grad = g.createRadialGradient(
      X(p.position.x),
      Y(p.position.y),
      0,
      X(p.position.x),
      Y(p.position.y),
      r,
    );
    grad.addColorStop(0, '#000');
    grad.addColorStop(0.8, '#020302');
    grad.addColorStop(1, '#0c120e');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(X(p.position.x), Y(p.position.y), r, 0, Math.PI * 2);
    g.fill();
  }

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Simple wood grain for the rails. */
export function woodTexture(): Texture {
  const w = 1024;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a2a17';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const y = (i * 37) % h;
    g.strokeStyle = `rgba(${i % 2 ? '20,10,4' : '110,70,40'},0.25)`;
    g.lineWidth = 1 + (i % 3);
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 3);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A knotted string net (one diamond per tile) on a transparent background, for snooker pockets. */
export function netTexture(): Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, s, s);
  g.strokeStyle = '#ece8dc';
  g.lineWidth = 3.2;
  g.lineCap = 'round';
  g.beginPath();
  // Diamond mesh: lines corner to corner, so tiles join up.
  g.moveTo(0, s / 2);
  g.lineTo(s / 2, 0);
  g.lineTo(s, s / 2);
  g.lineTo(s / 2, s);
  g.closePath();
  g.stroke();
  // Knots where the strings cross.
  g.fillStyle = '#f4f1e6';
  for (const [x, y] of [
    [s / 2, 0],
    [s, s / 2],
    [s / 2, s],
    [0, s / 2],
  ] as const) {
    g.beginPath();
    g.arc(x, y, 3.8, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Pebbled leather grain, for pocket leathers. */
export function leatherTexture(base: string): Texture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.05 + rnd() * 0.08})` : `rgba(255,235,210,${0.03 + rnd() * 0.05})`;
    g.beginPath();
    g.arc(rnd() * s, rnd() * s, 0.8 + rnd() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
