import { Rng } from '@cuesports/shared';

/**
 * Canvas art for the rooms: floors, walls, signs, boards and screens. Each function draws a whole
 * canvas. Every name, sponsor and title on them is made up.
 */

type G = CanvasRenderingContext2D;

export const SURNAMES = [
  'Doyle',
  'Shah',
  'Lenz',
  'Marlow',
  'Fenn',
  'Burke',
  'Osei',
  'Okafor',
  'Tanaka',
  'Hale',
  'Cruz',
  'Grant',
  'Petrov',
  'Nilsen',
  'Ashby',
  'Kerr',
  'Moreau',
  'Varga',
  'Quinn',
  'Rourke',
  'Sato',
  'Pryce',
];

export const SPONSORS = [
  'KESTREL',
  'NORTHLIGHT',
  'BAIZE & CO',
  'TIDEWAY',
  'ORBIT CUES',
  'HALCYON',
  'REDSTONE',
  'MERIDIAN',
  'FALCON TAPS',
  'BLUEFIN',
  'GREYHAWK',
  'LANTERN',
];

function noise(g: G, w: number, h: number, n: number, alpha: number, rng: Rng, light = false): void {
  for (let i = 0; i < n; i++) {
    const s = light ? 255 : 0;
    g.fillStyle = `rgba(${s},${s},${s},${alpha * rng.next()})`;
    g.fillRect(rng.next() * w, rng.next() * h, 1 + rng.next() * 2, 1 + rng.next() * 2);
  }
}

/** Wooden planks, running along u. */
export function planks(base: string, rng: Rng, rows = 8, herring = false) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rng.next() * w * 0.5;
      while (x < w) {
        const len = w * (0.25 + rng.next() * 0.35);
        const l = (rng.next() - 0.5) * 0.18;
        g.fillStyle = l > 0 ? `rgba(255,235,200,${l})` : `rgba(0,0,0,${-l})`;
        if (herring) {
          g.save();
          g.translate(x + len / 2, r * rh + rh / 2);
          g.rotate(r % 2 ? 0.6 : -0.6);
          g.fillRect(-len / 2, -rh / 2, len, rh);
          g.restore();
        } else g.fillRect(x, r * rh, len, rh);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x, r * rh, 1.5, rh);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, r * rh, w, 1.5);
      // Grain.
      for (let i = 0; i < 6; i++) {
        g.strokeStyle = `rgba(0,0,0,${0.05 + rng.next() * 0.08})`;
        g.beginPath();
        const y = r * rh + rng.next() * rh;
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + rng.range(-3, 3), w * 0.6, y + rng.range(-3, 3), w, y);
        g.stroke();
      }
    }
  };
}

/** A patterned pub carpet: a lattice of motifs on a deep ground. */
export function carpet(ground: string, line: string, motif: string, rng: Rng, style = 0) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = ground;
    g.fillRect(0, 0, w, h);
    const n = 4;
    const s = w / n;
    g.lineWidth = 3;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const cx = i * s;
        const cy = j * s;
        g.strokeStyle = line;
        if (style === 0) {
          g.beginPath();
          g.moveTo(cx, cy - s / 2);
          g.lineTo(cx + s / 2, cy);
          g.lineTo(cx, cy + s / 2);
          g.lineTo(cx - s / 2, cy);
          g.closePath();
          g.stroke();
        } else {
          g.beginPath();
          g.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = motif;
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2 + Math.PI / 4;
          g.beginPath();
          g.ellipse(
            cx + Math.cos(a) * s * 0.17,
            cy + Math.sin(a) * s * 0.17,
            s * 0.1,
            s * 0.04,
            a,
            0,
            Math.PI * 2,
          );
          g.fill();
        }
        g.beginPath();
        g.arc(cx + s / 2, cy + s / 2, s * 0.06, 0, Math.PI * 2);
        g.fill();
      }
    noise(g, w, h, 3000, 0.25, rng);
  };
}

/** Flat colour with a fleck: carpet tiles, painted block, concrete. */
export function fleck(base: string, rng: Rng, amount = 4000, grid = 0) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    noise(g, w, h, amount, 0.18, rng);
    noise(g, w, h, amount / 2, 0.08, rng, true);
    if (grid) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < grid; i++) {
        g.fillRect((i * w) / grid, 0, 2, h);
        g.fillRect(0, (i * h) / grid, w, 2);
      }
    }
  };
}

/** Wallpaper: stripes, or a damask-ish repeat. */
export function wallpaper(base: string, ink: string, damask: boolean) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = ink;
    if (!damask) {
      for (let i = 0; i < 8; i++) g.fillRect((i * w) / 8, 0, w / 24, h);
      return;
    }
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const cx = (i + 0.5 * (j % 2) + 0.25) * (w / 2);
        const cy = (j + 0.5) * (h / 2);
        g.beginPath();
        g.ellipse(cx, cy, w * 0.07, h * 0.16, 0, 0, Math.PI * 2);
        g.fill();
        for (const s of [-1, 1]) {
          g.beginPath();
          g.ellipse(cx + s * w * 0.09, cy + h * 0.05, w * 0.05, h * 0.08, s * 0.6, 0, Math.PI * 2);
          g.fill();
        }
        g.fillRect(cx - 1, cy - h * 0.24, 2, h * 0.48);
      }
  };
}

/** Raised wood panels. */
export function panelling(base: string, cols = 2) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const pw = w / cols;
    for (let i = 0; i < cols; i++) {
      const x = i * pw + pw * 0.12;
      const y = h * 0.12;
      const iw = pw * 0.76;
      const ih = h * 0.76;
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(x, y, iw, ih);
      g.fillStyle = 'rgba(255,230,190,0.08)';
      g.fillRect(x + 4, y + 4, iw - 8, ih - 8);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 3;
      g.strokeRect(x + 8, y + 8, iw - 16, ih - 16);
    }
  };
}

/** Checkerboard tiles. */
export function checker(a: string, b: string) {
  return (g: G, w: number, h: number) => {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? a : b;
        g.fillRect((i * w) / 4, (j * h) / 4, w / 4, h / 4);
      }
    g.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 4; i++) {
      g.fillRect((i * w) / 4, 0, 1, h);
      g.fillRect(0, (i * h) / 4, w, 1);
    }
  };
}

/** Brick, for the palace walls. */
export function brick(base: string, mortar: string, rng: Rng) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = mortar;
    g.fillRect(0, 0, w, h);
    const rows = 8;
    const bh = h / rows;
    const bw = w / 4;
    for (let r = 0; r < rows; r++)
      for (let c = -1; c < 5; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0);
        const l = (rng.next() - 0.5) * 30;
        g.fillStyle = shade(base, l);
        g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
      }
  };
}

/** Vertical folds: stage drapes. */
export function drape(base: string) {
  return (g: G, w: number, h: number) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 8; i++) {
      grad.addColorStop(i / 8, i % 2 ? shade(base, -18) : shade(base, 12));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  };
}

/** A plain sign: text on a ground, with an optional rule round it. */
export function sign(
  text: string,
  fg: string,
  bg: string,
  font = 'bold 72px Georgia, serif',
  border?: string,
) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (border) {
      g.strokeStyle = border;
      g.lineWidth = h * 0.05;
      g.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
    }
    g.fillStyle = fg;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, text, w / 2, h / 2, w * 0.86);
  };
}

/** Neon: glowing script on black (drawn with a glow so it reads from across the room). */
export function neon(text: string, colour: string, font = 'italic bold 90px "Brush Script MT", cursive') {
  return (g: G, w: number, h: number) => {
    g.fillStyle = '#050505';
    g.fillRect(0, 0, w, h);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = colour;
    for (const b of [30, 14, 4]) {
      g.shadowBlur = b;
      g.fillStyle = b === 4 ? '#ffffff' : colour;
      fitText(g, text, w / 2, h / 2, w * 0.9);
    }
  };
}

function fitText(g: G, text: string, x: number, y: number, max: number): void {
  const m = g.measureText(text).width;
  if (m > max) {
    g.save();
    g.translate(x, y);
    g.scale(max / m, 1);
    g.fillText(text, 0, 0);
    g.restore();
  } else g.fillText(text, x, y);
}

/** Bottles on glass shelves, lit from behind: the back bar. */
export function backBar(rng: Rng) {
  return (g: G, w: number, h: number) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#3a2412');
    grad.addColorStop(1, '#1a0f07');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const shelves = 3;
    for (let s = 0; s < shelves; s++) {
      const base = ((s + 1) * h) / (shelves + 0.3);
      // Light along each shelf.
      const glow = g.createLinearGradient(0, base - h * 0.28, 0, base);
      glow.addColorStop(0, 'rgba(255,190,110,0)');
      glow.addColorStop(1, 'rgba(255,190,110,0.55)');
      g.fillStyle = glow;
      g.fillRect(0, base - h * 0.28, w, h * 0.28);
      let x = 6;
      while (x < w - 10) {
        const bw = 10 + rng.next() * 14;
        const bh = h * (0.14 + rng.next() * 0.1);
        const hue = [30, 45, 100, 15, 200, 0][rng.int(6)]!;
        g.fillStyle = `hsla(${hue},${50 + rng.next() * 40}%,${25 + rng.next() * 35}%,0.95)`;
        g.fillRect(x, base - bh, bw, bh);
        g.fillRect(x + bw * 0.35, base - bh - bh * 0.35, bw * 0.3, bh * 0.35);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(x + 2, base - bh * 0.6, bw - 4, bh * 0.25);
        x += bw + 3 + rng.next() * 6;
      }
      g.fillStyle = 'rgba(220,240,255,0.6)';
      g.fillRect(0, base, w, 3);
    }
  };
}

/** Books on shelves. */
export function books(rng: Rng) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = '#2a1a0e';
    g.fillRect(0, 0, w, h);
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const top = (r * h) / rows + 6;
      const bottom = ((r + 1) * h) / rows - 4;
      let x = 4;
      while (x < w - 4) {
        const bw = 5 + rng.next() * 9;
        const bh = (bottom - top) * (0.7 + rng.next() * 0.3);
        const hue = [0, 20, 35, 120, 210, 260][rng.int(6)]!;
        g.fillStyle = `hsl(${hue},${30 + rng.next() * 30}%,${15 + rng.next() * 22}%)`;
        g.fillRect(x, bottom - bh, bw, bh);
        g.fillStyle = 'rgba(220,180,90,0.6)';
        g.fillRect(x + 1, bottom - bh + 4, bw - 2, 2);
        x += bw + 1;
      }
      g.fillStyle = '#4a2f18';
      g.fillRect(0, bottom, w, 6);
    }
  };
}

/** A portrait in oils (an imagined sitter). */
export function portrait(rng: Rng) {
  return (g: G, w: number, h: number) => {
    const bg = g.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h / 2, w);
    bg.addColorStop(0, `hsl(${30 + rng.next() * 30},30%,28%)`);
    bg.addColorStop(1, '#120c06');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // Coat.
    g.fillStyle = `hsl(${rng.next() * 360},25%,${10 + rng.next() * 12}%)`;
    g.beginPath();
    g.ellipse(w / 2, h * 0.98, w * 0.42, h * 0.38, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#e8e0d0';
    g.beginPath();
    g.moveTo(w * 0.44, h * 0.62);
    g.lineTo(w * 0.56, h * 0.62);
    g.lineTo(w / 2, h * 0.78);
    g.fill();
    // Face and hair.
    g.fillStyle = `hsl(25,${35 + rng.next() * 20}%,${45 + rng.next() * 25}%)`;
    g.beginPath();
    g.ellipse(w / 2, h * 0.44, w * 0.13, h * 0.13, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = ['#2a1c12', '#6b6159', '#c9c2b8', '#3a2414'][rng.int(4)]!;
    g.beginPath();
    g.ellipse(w / 2, h * 0.37, w * 0.14, h * 0.08, 0, Math.PI, 0);
    g.fill();
  };
}

/** A framed print or poster for a club wall. */
export function poster(title: string, sub: string, hue: number) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = `hsl(${hue},55%,22%)`;
    g.fillRect(0, 0, w, h);
    g.fillStyle = `hsl(${hue},70%,55%)`;
    g.beginPath();
    g.arc(w / 2, h * 0.45, w * 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f3ecd8';
    g.beginPath();
    g.arc(w * 0.42, h * 0.38, w * 0.08, 0, Math.PI * 2);
    g.fill();
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = `bold ${Math.round(w * 0.13)}px Arial, sans-serif`;
    fitText(g, title, w / 2, h * 0.84, w * 0.9);
    g.font = `${Math.round(w * 0.07)}px Arial, sans-serif`;
    fitText(g, sub, w / 2, h * 0.94, w * 0.9);
  };
}

/** A dartboard. */
export function dartboard() {
  return (g: G, w: number) => {
    const c = w / 2;
    g.fillStyle = '#111';
    g.fillRect(0, 0, w, w);
    const rings = [
      [1, '#111', '#111'],
      [0.78, '#c8231d', '#1d7a3a'],
      [0.72, '#111', '#efe2c0'],
      [0.48, '#c8231d', '#1d7a3a'],
      [0.42, '#111', '#efe2c0'],
    ] as const;
    for (const [r, a, b] of rings)
      for (let i = 0; i < 20; i++) {
        g.fillStyle = i % 2 ? a : b;
        g.beginPath();
        g.moveTo(c, c);
        g.arc(c, c, r * c * 0.95, ((i - 0.5) * Math.PI) / 10, ((i + 0.5) * Math.PI) / 10);
        g.fill();
      }
    g.fillStyle = '#1d7a3a';
    g.beginPath();
    g.arc(c, c, c * 0.09, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c8231d';
    g.beginPath();
    g.arc(c, c, c * 0.04, 0, Math.PI * 2);
    g.fill();
  };
}

/** An honours board: gold names and years on dark wood. */
export function honours(title: string, rng: Rng) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = '#2b170b';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b8913e';
    g.lineWidth = 6;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#d8b25a';
    g.textAlign = 'center';
    g.font = `bold ${Math.round(h * 0.07)}px Georgia, serif`;
    fitText(g, title, w / 2, h * 0.12, w * 0.85);
    g.font = `${Math.round(h * 0.045)}px Georgia, serif`;
    const year = 1958 + rng.int(10);
    for (let i = 0; i < 14; i++) {
      const name = `${'ABCDEFGHJKLMNPRSTW'[rng.int(18)]}. ${SURNAMES[rng.int(SURNAMES.length)]}`;
      const col = i < 7 ? 0.27 : 0.73;
      fitText(g, `${year + i * 4}  ${name}`, w * col, h * (0.24 + (i % 7) * 0.105), w * 0.42);
    }
  };
}

/** A score screen: two names, frames, the event. */
export function scoreboard(event: string, rng: Rng, accent = '#3aa0ff') {
  return (g: G, w: number, h: number) => {
    g.fillStyle = '#05070c';
    g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, accent);
    grad.addColorStop(1, '#0b1630');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h * 0.22);
    g.fillStyle = '#ffffff';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = `bold ${Math.round(h * 0.13)}px Arial, sans-serif`;
    fitText(g, event.toUpperCase(), w / 2, h * 0.11, w * 0.9);
    const a = SURNAMES[rng.int(SURNAMES.length)]!.toUpperCase();
    const b = SURNAMES[rng.int(SURNAMES.length)]!.toUpperCase();
    g.font = `bold ${Math.round(h * 0.16)}px Arial, sans-serif`;
    g.textAlign = 'left';
    fitText(g, a, w * 0.06, h * 0.45, w * 0.55);
    fitText(g, b, w * 0.06, h * 0.75, w * 0.55);
    g.textAlign = 'center';
    g.fillStyle = '#ffd34d';
    g.font = `bold ${Math.round(h * 0.22)}px Arial, sans-serif`;
    g.fillText(String(rng.int(6)), w * 0.82, h * 0.45);
    g.fillText(String(rng.int(6)), w * 0.82, h * 0.75);
  };
}

/** An LED board: sponsor names in a row, bright on dark. */
export function ledBoard(rng: Rng, hue: number) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = `hsl(${hue},70%,12%)`;
    g.fillRect(0, 0, w, h);
    const n = 3;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(h * 0.55)}px Arial, sans-serif`;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : `hsl(${hue},90%,65%)`;
      fitText(g, SPONSORS[rng.int(SPONSORS.length)]!, ((i + 0.5) * w) / n, h / 2, (w / n) * 0.85);
    }
  };
}

/** A window at night: panes, a little light from the street. */
export function nightWindow(cols: number, rows: number, sky: string, glow: string, leaded = false) {
  return (g: G, w: number, h: number) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, sky);
    grad.addColorStop(1, glow);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a120a';
    g.lineWidth = Math.max(4, w * 0.03);
    g.strokeRect(0, 0, w, h);
    for (let i = 1; i < cols; i++) {
      g.beginPath();
      g.moveTo((i * w) / cols, 0);
      g.lineTo((i * w) / cols, h);
      g.stroke();
    }
    for (let j = 1; j < rows; j++) {
      g.beginPath();
      g.moveTo(0, (j * h) / rows);
      g.lineTo(w, (j * h) / rows);
      g.stroke();
    }
    if (leaded) {
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(20,14,8,0.8)';
      for (let x = -h; x < w; x += 18) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + h, h);
        g.moveTo(x + h, 0);
        g.lineTo(x, h);
        g.stroke();
      }
    }
  };
}

/** Stained glass: a rose window. */
export function rose(rng: Rng) {
  return (g: G, w: number) => {
    const c = w / 2;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, w);
    const colours = ['#2c4fd6', '#d63a2c', '#e6b422', '#2ca05a', '#8a3cd6', '#1fb4c9'];
    for (let ring = 4; ring >= 1; ring--) {
      const n = ring * 8;
      for (let i = 0; i < n; i++) {
        g.fillStyle = colours[rng.int(colours.length)]!;
        g.beginPath();
        g.moveTo(c, c);
        g.arc(c, c, (ring / 4) * c * 0.96, (i / n) * Math.PI * 2, ((i + 0.85) / n) * Math.PI * 2);
        g.fill();
      }
    }
    g.strokeStyle = '#120c06';
    g.lineWidth = 5;
    for (let ring = 1; ring <= 4; ring++) {
      g.beginPath();
      g.arc(c, c, (ring / 4) * c * 0.96, 0, Math.PI * 2);
      g.stroke();
    }
  };
}

/** The court lines of a sports hall floor, on maple. */
export function court(rng: Rng) {
  return (g: G, w: number, h: number) => {
    planks('#c89a62', rng, 24)(g, w, h);
    g.lineWidth = 5;
    // Basketball (red), badminton (yellow), volleyball (blue).
    g.strokeStyle = 'rgba(190,40,40,0.9)';
    g.strokeRect(w * 0.04, h * 0.06, w * 0.92, h * 0.88);
    g.beginPath();
    g.moveTo(w / 2, h * 0.06);
    g.lineTo(w / 2, h * 0.94);
    g.stroke();
    g.beginPath();
    g.arc(w / 2, h / 2, h * 0.12, 0, Math.PI * 2);
    g.stroke();
    for (const s of [0, 1]) {
      const x = s ? w * 0.96 : w * 0.04;
      g.beginPath();
      g.arc(x, h / 2, h * 0.36, s ? Math.PI / 2 : -Math.PI / 2, s ? (3 * Math.PI) / 2 : Math.PI / 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(230,190,40,0.85)';
    g.lineWidth = 3;
    for (const x of [0.12, 0.62]) g.strokeRect(w * x, h * 0.2, w * 0.26, h * 0.6);
    g.strokeStyle = 'rgba(40,90,200,0.85)';
    g.strokeRect(w * 0.2, h * 0.14, w * 0.6, h * 0.72);
  };
}

/** A big screen: the tour's name on a gradient. */
export function screen(title: string, sub: string, hue: number) {
  return (g: G, w: number, h: number) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, `hsl(${hue},80%,30%)`);
    grad.addColorStop(1, `hsl(${hue + 40},70%,8%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = `hsla(${hue},90%,70%,0.5)`;
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.arc(w * 0.85, h * 1.2, h * (0.3 + i * 0.12), Math.PI, Math.PI * 1.6);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(h * 0.26)}px Arial, sans-serif`;
    fitText(g, title.toUpperCase(), w / 2, h * 0.42, w * 0.86);
    g.font = `${Math.round(h * 0.12)}px Arial, sans-serif`;
    g.fillStyle = `hsl(${hue},90%,80%)`;
    fitText(g, sub.toUpperCase(), w / 2, h * 0.7, w * 0.86);
  };
}

/** A billiards marker board / snooker scoreboard: wood, two rows of pegs. */
export function markerBoard() {
  return (g: G, w: number, h: number) => {
    g.fillStyle = '#5a3418';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e9dfc4';
    for (let r = 0; r < 2; r++) {
      g.fillRect(w * 0.06, h * (0.22 + r * 0.42), w * 0.88, h * 0.2);
      g.fillStyle = '#2b1a0c';
      for (let i = 0; i <= 30; i++)
        g.fillRect(w * (0.07 + (i / 30) * 0.86), h * (0.24 + r * 0.42), 1.5, h * 0.06);
      g.fillStyle = '#c42a1c';
      g.beginPath();
      g.arc(w * (0.15 + r * 0.3), h * (0.32 + r * 0.42), h * 0.05, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e9dfc4';
    }
  };
}

/** A coal fire: embers and a few flames in the dark of the grate. */
export function fire(rng: Rng) {
  return (g: G, w: number, h: number) => {
    g.fillStyle = '#0a0503';
    g.fillRect(0, 0, w, h);
    const embers = g.createLinearGradient(0, h, 0, h * 0.55);
    embers.addColorStop(0, '#ff5a10');
    embers.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = embers;
    g.fillRect(0, h * 0.55, w, h * 0.45);
    for (let i = 0; i < 14; i++) {
      const x = w * (0.1 + rng.next() * 0.8);
      const fh = h * (0.35 + rng.next() * 0.5);
      const fw = w * (0.05 + rng.next() * 0.07);
      const grad = g.createLinearGradient(0, h, 0, h - fh);
      grad.addColorStop(0, 'rgba(255,230,140,0.95)');
      grad.addColorStop(0.4, 'rgba(255,140,30,0.8)');
      grad.addColorStop(1, 'rgba(200,40,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - fw, h);
      g.quadraticCurveTo(x - fw * 0.6, h - fh * 0.6, x + rng.range(-fw, fw) * 0.5, h - fh);
      g.quadraticCurveTo(x + fw * 0.6, h - fh * 0.6, x + fw, h);
      g.fill();
    }
    for (let i = 0; i < 8; i++) {
      g.fillStyle = '#1a0c06';
      g.beginPath();
      g.ellipse(w * (0.1 + i * 0.11), h * 0.92, w * 0.07, h * 0.08, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
}

/** Lightens (+) or darkens (−) a hex colour by `d` (0–255 scale). */
export function shade(hex: string, d: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, ((n >> s) & 255) + d));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
