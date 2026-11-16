import { sampleAt, tableGeometry, type BallState, type Frame, type ShotResult } from '@cuesports/physics';
import type { TableSpec, Vec2 } from '@cuesports/shared';
import { ballLook } from './balls';

/** World ↔ screen transform. The table is rotated 90° when the canvas is taller than wide. */
export class View {
  scale = 1;
  cx = 0;
  cy = 0;
  portrait = false;
  dpr = 1;

  fit(canvas: HTMLCanvasElement, table: TableSpec): void {
    const rect = canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(rect.width * this.dpr);
    canvas.height = Math.round(rect.height * this.dpr);
    const margin = 0.16;
    const L = table.playfield.length + 2 * margin;
    const W = table.playfield.width + 2 * margin;
    this.portrait = rect.height > rect.width * 1.05;
    const [sw, sh] = this.portrait ? [W, L] : [L, W];
    this.scale = Math.min(rect.width / sw, rect.height / sh);
    this.cx = rect.width / 2;
    this.cy = rect.height / 2;
  }

  toScreen(p: Vec2): Vec2 {
    return this.portrait
      ? { x: this.cx - p.y * this.scale, y: this.cy - p.x * this.scale }
      : { x: this.cx + p.x * this.scale, y: this.cy - p.y * this.scale };
  }

  toWorld(s: Vec2): Vec2 {
    return this.portrait
      ? { x: -(s.y - this.cy) / this.scale, y: -(s.x - this.cx) / this.scale }
      : { x: (s.x - this.cx) / this.scale, y: -(s.y - this.cy) / this.scale };
  }
}

export interface DrawOptions {
  trails: boolean;
  segments: boolean;
  aim: {
    from: Vec2;
    dir: Vec2;
    ghost: Vec2 | null;
    objectDir: { from: Vec2; dir: Vec2 } | null;
    end: Vec2;
  } | null;
  highlight: string | null;
}

const css = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function draw(
  ctx: CanvasRenderingContext2D,
  view: View,
  table: TableSpec,
  balls: BallState[],
  result: ShotResult | null,
  playT: number,
  opts: DrawOptions,
): void {
  const { dpr } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const S = view.scale;
  const geo = tableGeometry(table);
  const hl = table.playfield.length / 2;
  const hw = table.playfield.width / 2;

  const poly = (pts: Vec2[], close = false): void => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = view.toScreen(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    if (close) ctx.closePath();
  };

  // Rails and cloth.
  const rail = 0.12;
  ctx.fillStyle = css('--rail');
  poly(
    [
      { x: -hl - rail, y: -hw - rail },
      { x: hl + rail, y: -hw - rail },
      { x: hl + rail, y: hw + rail },
      { x: -hl - rail, y: hw + rail },
    ],
    true,
  );
  ctx.fill();
  ctx.fillStyle = css('--cloth');
  poly(
    [
      { x: -hl, y: -hw },
      { x: hl, y: -hw },
      { x: hl, y: hw },
      { x: -hl, y: hw },
    ],
    true,
  );
  ctx.fill();

  // Pocket mouths (cloth running into the jaws), then the holes.
  for (const p of geo.pockets) {
    const a = geo.segments.filter((x) => x.pocket === p.id && x.id.startsWith(`jaw:${p.id}:0:`));
    const b = geo.segments.filter((x) => x.pocket === p.id && x.id.startsWith(`jaw:${p.id}:1:`));
    if (a.length && b.length) {
      ctx.fillStyle = css('--cloth-edge');
      poly(
        [...a.map((x) => x.a), a[a.length - 1]!.b, b[b.length - 1]!.b, ...[...b].reverse().map((x) => x.a)],
        true,
      );
      ctx.fill();
    }
  }
  for (const p of geo.pockets) {
    const s = view.toScreen(p.position);
    ctx.fillStyle = '#050807';
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.fallRadius * S, 0, Math.PI * 2);
    ctx.fill();
  }

  // Markings.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (const m of table.markings) {
    if (m.type === 'line') {
      poly([m.a, m.b]);
      ctx.stroke();
    } else if (m.type === 'arc') {
      const pts: Vec2[] = [];
      for (let k = 0; k <= 40; k++) {
        const a = ((m.startDeg + ((m.endDeg - m.startDeg) * k) / 40) * Math.PI) / 180;
        pts.push({ x: m.centre.x + m.radius * Math.cos(a), y: m.centre.y + m.radius * Math.sin(a) });
      }
      poly(pts);
      ctx.stroke();
    } else {
      const s = view.toScreen(m.position);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cushion nose segments (the physics geometry).
  if (opts.segments) {
    ctx.lineWidth = 1.5;
    for (const s of geo.segments) {
      ctx.strokeStyle = s.kind === 'rail' ? '#d9efe3' : s.kind === 'jaw' ? '#f2c14e' : '#6c7a73';
      poly([s.a, s.b]);
      ctx.stroke();
    }
  }

  // Trails.
  if (result && opts.trails) {
    ctx.lineWidth = 1.2;
    result.ids.forEach((id, i) => {
      const look = ballLook(id);
      ctx.strokeStyle = id === 'cue' ? 'rgba(255,255,255,0.8)' : look.fill;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      let started = false;
      for (const f of result.frames) {
        if (f.t > playT) break;
        if (f.pocketed[i]) break;
        const s = view.toScreen({ x: f.pos[2 * i]!, y: f.pos[2 * i + 1]! });
        if (!started) {
          ctx.moveTo(s.x, s.y);
          started = true;
        } else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  // Aim guide.
  if (opts.aim) {
    const { from, end, ghost, objectDir } = opts.aim;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    poly([from, end]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (ghost) {
      const s = view.toScreen(ghost);
      const cue = balls.find((b) => b.id === 'cue');
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, (cue?.radius ?? 0.028) * S, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (objectDir) {
      ctx.strokeStyle = 'rgba(242,193,78,0.85)';
      ctx.lineWidth = 1.5;
      poly([
        objectDir.from,
        { x: objectDir.from.x + objectDir.dir.x * 0.3, y: objectDir.from.y + objectDir.dir.y * 0.3 },
      ]);
      ctx.stroke();
    }
  }

  // Balls.
  const frame: Frame | null = result ? sampleAt(result, playT) : null;
  const list = result ? result.ids : balls.map((b) => b.id);
  list.forEach((id, i) => {
    const b = balls.find((x) => x.id === id) ?? result?.final.find((x) => x.id === id);
    if (!b) return;
    let pos: Vec2 = b.pos;
    let q = b.orient;
    let pocketed = b.state === 'pocketed';
    if (frame) {
      pos = { x: frame.pos[2 * i]!, y: frame.pos[2 * i + 1]! };
      q = {
        x: frame.orient[4 * i]!,
        y: frame.orient[4 * i + 1]!,
        z: frame.orient[4 * i + 2]!,
        w: frame.orient[4 * i + 3]!,
      };
      pocketed = frame.pocketed[i] === 1;
    }
    if (pocketed) return;
    drawBall(ctx, view, id, pos, b.radius, q, id === opts.highlight);
  });
}

function rotate(
  q: { x: number; y: number; z: number; w: number },
  v: [number, number, number],
): [number, number, number] {
  const [vx, vy, vz] = v;
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [
    vx + q.w * tx + (q.y * tz - q.z * ty),
    vy + q.w * ty + (q.z * tx - q.x * tz),
    vz + q.w * tz + (q.x * ty - q.y * tx),
  ];
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  view: View,
  id: string,
  pos: Vec2,
  R: number,
  q: { x: number; y: number; z: number; w: number },
  highlight: boolean,
): void {
  const s = view.toScreen(pos);
  const r = R * view.scale;
  const look = ballLook(id);
  ctx.save();
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fillStyle = look.stripe ? '#f6f3ea' : look.fill;
  ctx.fill();
  ctx.clip();
  if (look.stripe) {
    ctx.fillStyle = look.fill;
    ctx.fillRect(s.x - r, s.y - r * 0.55, 2 * r, r * 1.1);
  }
  // Two opposite body-fixed markers show the ball's rotation; draw whichever faces up.
  for (const sign of [1, -1]) {
    const [mx, my, mz] = rotate(q, [0, 0, sign]);
    if (mz <= 0) continue;
    const m = view.toScreen({ x: pos.x + mx * R, y: pos.y + my * R });
    ctx.fillStyle = id === 'cue' ? '#d6362f' : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(m.x, m.y, Math.max(1.2, r * 0.22 * mz), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = highlight ? '#f2c14e' : 'rgba(0,0,0,0.45)';
  ctx.lineWidth = highlight ? 2 : 1;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (look.label && r > 6) {
    ctx.font = `600 ${Math.max(7, r * 0.85)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = id === '8' ? '#fff' : '#111';
    ctx.fillText(look.label, s.x, s.y + 0.5);
  }
}
