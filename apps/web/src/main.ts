import { layout, sampleAt, simulate, tableGeometry, type ShotResult } from '@cuesports/physics';
import { AMERICAN_POOL_9FT as TABLE, Rng } from '@cuesports/shared';
import { registerSW } from 'virtual:pwa-register';

const COLOURS: Record<string, string> = {
  cue: '#f6f3ea',
  '1': '#f4c430',
  '2': '#2459c9',
  '3': '#d62f2f',
  '4': '#6b3fa0',
  '5': '#f07f1d',
  '6': '#1f8a4c',
  '7': '#7a1f1f',
  '8': '#111111',
  '9': '#f4c430',
};

const canvas = document.getElementById('demo') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const geo = tableGeometry(TABLE);
const hl = TABLE.playfield.length / 2;
const hw = TABLE.playfield.width / 2;
const rng = new Rng(Date.now() & 0xffff);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let t = 0;

function newBreak(): ShotResult {
  const balls = layout(TABLE, 'nine-ball', rng.int(1e6) + 1);
  const cue = balls.find((b) => b.id === 'cue')!;
  cue.pos.y = rng.range(-0.25, 0.25);
  const apex = balls[0]!;
  const aim = Math.atan2(apex.pos.y - cue.pos.y, apex.pos.x - cue.pos.x) + rng.range(-0.004, 0.004);
  t = 0;
  return simulate(TABLE, balls, {
    ball: 'cue',
    aim,
    elevation: 0,
    tip: { a: 0, b: rng.range(-0.2, 0.2) },
    speed: 8,
  });
}

let result = newBreak();

function render(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(rect.width * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const margin = 0.1;
  const s = Math.min(rect.width / (2 * (hl + margin)), rect.height / (2 * (hw + margin)));
  const X = (x: number) => rect.width / 2 + x * s;
  const Y = (y: number) => rect.height / 2 - y * s;

  ctx.fillStyle = '#4a2f1f';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#1f6b45';
  ctx.fillRect(X(-hl), Y(hw), 2 * hl * s, 2 * hw * s);
  ctx.fillStyle = '#050807';
  for (const p of geo.pockets) {
    ctx.beginPath();
    ctx.arc(X(p.position.x), Y(p.position.y), p.fallRadius * s, 0, Math.PI * 2);
    ctx.fill();
  }
  const f = sampleAt(result, t);
  result.ids.forEach((id, i) => {
    if (f.pocketed[i]) return;
    ctx.fillStyle = COLOURS[id] ?? '#999';
    ctx.beginPath();
    ctx.arc(X(f.pos[2 * i]!), Y(f.pos[2 * i + 1]!), TABLE.balls.object.radius * s, 0, Math.PI * 2);
    ctx.fill();
  });
}

let last = performance.now();
function frame(now: number): void {
  t += Math.min(0.1, (now - last) / 1000);
  last = now;
  if (t > result.duration + 1.5) result = newBreak();
  render();
  requestAnimationFrame(frame);
}

if (reducedMotion) {
  t = result.duration;
  render();
} else {
  requestAnimationFrame(frame);
}

const offline = document.getElementById('offline')!;
registerSW({
  immediate: true,
  onOfflineReady() {
    offline.hidden = false;
    offline.textContent = 'Ready to play offline.';
  },
});
