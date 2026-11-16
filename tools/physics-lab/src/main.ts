import {
  cloneBall,
  layout,
  simulate,
  type BallState,
  type LayoutId,
  type ShotInput,
  type ShotResult,
} from '@cuesports/physics';
import { DEFAULT_CUE, TABLE_PRESETS, type CueSpec, type TableSpec, type Vec2 } from '@cuesports/shared';
import { draw, View } from './view';

// ---------------------------------------------------------------------------------------------
// Tunable coefficients

interface Coef {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get: (t: TableSpec, c: CueSpec) => number;
  set: (t: TableSpec, c: CueSpec, v: number) => void;
  fmt?: (v: number) => string;
}

const COEFS: { group: string; items: Coef[] }[] = [
  {
    group: 'Cloth',
    items: [
      {
        id: 'slide',
        label: 'Slide μs',
        min: 0.05,
        max: 0.4,
        step: 0.005,
        get: (t) => t.cloth.slideFriction,
        set: (t, _c, v) => (t.cloth.slideFriction = v),
      },
      {
        id: 'roll',
        label: 'Roll μr',
        min: 0.002,
        max: 0.03,
        step: 0.0005,
        get: (t) => t.cloth.rollFriction,
        set: (t, _c, v) => (t.cloth.rollFriction = v),
        fmt: (v) => v.toFixed(4),
      },
      {
        id: 'spinf',
        label: 'Spin μsp',
        min: 0.001,
        max: 0.03,
        step: 0.0005,
        get: (t) => t.cloth.spinFriction,
        set: (t, _c, v) => (t.cloth.spinFriction = v),
        fmt: (v) => v.toFixed(4),
      },
    ],
  },
  {
    group: 'Balls',
    items: [
      {
        id: 'bre',
        label: 'Restitution',
        min: 0.8,
        max: 1,
        step: 0.005,
        get: (t) => t.balls.restitution,
        set: (t, _c, v) => (t.balls.restitution = v),
      },
      {
        id: 'bfa',
        label: 'Throw μ a',
        min: 0,
        max: 0.06,
        step: 0.001,
        get: (t) => t.balls.friction.a,
        set: (t, _c, v) => (t.balls.friction.a = v),
        fmt: (v) => v.toFixed(3),
      },
      {
        id: 'bfb',
        label: 'Throw μ b',
        min: 0,
        max: 0.3,
        step: 0.002,
        get: (t) => t.balls.friction.b,
        set: (t, _c, v) => (t.balls.friction.b = v),
      },
      {
        id: 'bfc',
        label: 'Throw μ c',
        min: 0,
        max: 3,
        step: 0.02,
        get: (t) => t.balls.friction.c,
        set: (t, _c, v) => (t.balls.friction.c = v),
      },
    ],
  },
  {
    group: 'Cushions',
    items: [
      {
        id: 'cre',
        label: 'Restitution',
        min: 0.5,
        max: 1,
        step: 0.005,
        get: (t) => t.cushion.restitution,
        set: (t, _c, v) => (t.cushion.restitution = v),
      },
      {
        id: 'crs',
        label: 'Loss per m/s',
        min: 0,
        max: 0.1,
        step: 0.002,
        get: (t) => t.cushion.restitutionSlope,
        set: (t, _c, v) => (t.cushion.restitutionSlope = v),
      },
      {
        id: 'cfr',
        label: 'Friction μw',
        min: 0,
        max: 0.5,
        step: 0.005,
        get: (t) => t.cushion.friction,
        set: (t, _c, v) => (t.cushion.friction = v),
      },
      {
        id: 'cnh',
        label: 'Nose height ×2R',
        min: 0.52,
        max: 0.8,
        step: 0.005,
        get: (t) => t.cushion.noseHeight / (2 * t.balls.object.radius),
        set: (t, _c, v) => (t.cushion.noseHeight = v * 2 * t.balls.object.radius),
      },
    ],
  },
  {
    group: 'Cue',
    items: [
      {
        id: 'cem',
        label: 'End mass (g)',
        min: 2,
        max: 30,
        step: 0.5,
        get: (_t, c) => c.endMass * 1000,
        set: (_t, c, v) => (c.endMass = v / 1000),
        fmt: (v) => v.toFixed(1),
      },
      {
        id: 'ctr',
        label: 'Tip restitution',
        min: 0.5,
        max: 0.95,
        step: 0.01,
        get: (_t, c) => c.tipRestitution,
        set: (_t, c, v) => (c.tipRestitution = v),
      },
      {
        id: 'cml',
        label: 'Miscue limit ×R',
        min: 0.3,
        max: 0.8,
        step: 0.01,
        get: (_t, c) => c.miscueLimit,
        set: (_t, c, v) => (c.miscueLimit = v),
      },
    ],
  },
];

const LAYOUTS: Record<string, LayoutId[]> = {
  'snooker-12ft': ['snooker', 'two-balls', 'empty'],
  'english-pool-7ft': ['blackball', 'two-balls', 'empty'],
  'american-pool-9ft': ['nine-ball', 'eight-ball', 'ten-ball', 'two-balls', 'empty'],
};

// ---------------------------------------------------------------------------------------------
// State

interface Saved {
  when: number;
  table: string;
  overrides: Record<string, number>;
  balls: BallState[];
  shot: ShotInput;
}

const HISTORY_KEY = 'physics-lab-history-v1';

const st = {
  presetId: TABLE_PRESETS[2]!.id,
  layout: 'nine-ball' as LayoutId,
  seed: 1,
  overrides: {} as Record<string, number>,
  table: TABLE_PRESETS[2]!,
  cue: { ...DEFAULT_CUE },
  balls: [] as BallState[],
  before: null as BallState[] | null,
  shot: { ball: 'cue', aim: 0, elevation: 0, tip: { a: 0, b: 0 }, speed: 4 } as ShotInput,
  result: null as ShotResult | null,
  lastShot: null as Saved | null,
  simMs: 0,
  playT: 0,
  playing: false,
  speed: 1,
  trails: true,
  segments: true,
  showStates: false,
  moveMode: false,
  history: [] as Saved[],
};

function loadHistory(): void {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) st.history = JSON.parse(raw) as Saved[];
  } catch {
    st.history = [];
  }
}

function saveHistory(): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(st.history.slice(0, 30)));
  } catch {
    // Storage may be unavailable (private mode); history then lasts for the session only.
  }
}

function buildTable(): void {
  const preset = TABLE_PRESETS.find((t) => t.id === st.presetId) ?? TABLE_PRESETS[0]!;
  const t = structuredClone(preset);
  const c = { ...DEFAULT_CUE };
  for (const g of COEFS)
    for (const k of g.items) if (st.overrides[k.id] !== undefined) k.set(t, c, st.overrides[k.id]!);
  st.table = t;
  st.cue = c;
}

function resetLayout(): void {
  st.balls = layout(st.table, st.layout, st.seed);
  st.result = null;
  st.before = null;
  st.playing = false;
  const cue = st.balls.find((b) => b.id === 'cue');
  const target = st.balls.find((b) => b.id !== 'cue');
  if (cue && target) st.shot.aim = Math.atan2(target.pos.y - cue.pos.y, target.pos.x - cue.pos.x);
  else st.shot.aim = 0;
}

// ---------------------------------------------------------------------------------------------
// Shooting

function shoot(): void {
  const cue = st.balls.find((b) => b.id === st.shot.ball);
  if (!cue || cue.state === 'pocketed') return;
  const before = st.balls.map(cloneBall);
  const t0 = performance.now();
  const result = simulate(st.table, before, st.shot, { sampleRate: 120, cue: st.cue });
  st.simMs = performance.now() - t0;
  st.before = before;
  st.result = result;
  st.playT = 0;
  st.playing = true;
  const saved: Saved = {
    when: Date.now(),
    table: st.presetId,
    overrides: { ...st.overrides },
    balls: before,
    shot: structuredClone(st.shot),
  };
  st.lastShot = saved;
  st.history.unshift(saved);
  st.history = st.history.slice(0, 30);
  saveHistory();
  renderEvents();
  renderHistory();
  exportBox.value = JSON.stringify(saved);
}

function finishPlayback(): void {
  if (!st.result) return;
  st.playing = false;
  st.playT = st.result.duration;
}

/** Commits the end state of the last shot so the next shot starts from it. */
function commit(): void {
  if (!st.result) return;
  st.balls = st.result.final.map(cloneBall);
  st.result = null;
}

function undo(): void {
  if (!st.before) return;
  st.balls = st.before.map(cloneBall);
  st.result = null;
  st.playing = false;
}

function replay(): void {
  if (!st.result) return;
  st.playT = 0;
  st.playing = true;
}

function load(saved: Saved): void {
  st.presetId = saved.table;
  st.overrides = { ...saved.overrides };
  buildTable();
  st.balls = saved.balls.map(cloneBall);
  st.shot = structuredClone(saved.shot);
  st.result = null;
  syncControls();
  shoot();
}

// ---------------------------------------------------------------------------------------------
// Aim guide (straight-line, ignores throw, squirt and swerve)

function aimGuide() {
  if (st.result) return null;
  const cue = st.balls.find((b) => b.id === st.shot.ball);
  if (!cue || cue.state === 'pocketed') return null;
  const dir = { x: Math.cos(st.shot.aim), y: Math.sin(st.shot.aim) };
  let best = Infinity;
  let hit: BallState | null = null;
  for (const b of st.balls) {
    if (b === cue || b.state === 'pocketed') continue;
    const D = b.radius + cue.radius;
    const px = b.pos.x - cue.pos.x;
    const py = b.pos.y - cue.pos.y;
    const along = px * dir.x + py * dir.y;
    if (along <= 0) continue;
    const perp2 = px * px + py * py - along * along;
    if (perp2 > D * D) continue;
    const t = along - Math.sqrt(D * D - perp2);
    if (t < best) {
      best = t;
      hit = b;
    }
  }
  const hl = st.table.playfield.length / 2 - cue.radius;
  const hw = st.table.playfield.width / 2 - cue.radius;
  const tx = dir.x > 0 ? (hl - cue.pos.x) / dir.x : dir.x < 0 ? (-hl - cue.pos.x) / dir.x : Infinity;
  const ty = dir.y > 0 ? (hw - cue.pos.y) / dir.y : dir.y < 0 ? (-hw - cue.pos.y) / dir.y : Infinity;
  const wall = Math.max(0, Math.min(tx, ty));
  if (hit && best < wall) {
    const ghost = { x: cue.pos.x + dir.x * best, y: cue.pos.y + dir.y * best };
    const ox = hit.pos.x - ghost.x;
    const oy = hit.pos.y - ghost.y;
    const ol = Math.hypot(ox, oy);
    return {
      from: cue.pos,
      dir,
      end: ghost,
      ghost,
      objectDir: { from: hit.pos, dir: { x: ox / ol, y: oy / ol } },
    };
  }
  return {
    from: cue.pos,
    dir,
    end: { x: cue.pos.x + dir.x * wall, y: cue.pos.y + dir.y * wall },
    ghost: null,
    objectDir: null,
  };
}

// ---------------------------------------------------------------------------------------------
// UI

const canvas = document.getElementById('table') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;
const panel = document.getElementById('panel')!;
const view = new View();

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
};

function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onInput: (v: number) => void,
  fmt: (v: number) => string = (v) => v.toFixed(3),
) {
  const input = el('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
  });
  const out = el('output', {}, fmt(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    onInput(v);
  });
  const row = el('div', { className: 'row' }, el('label', {}, label), input, out);
  return {
    row,
    set(v: number) {
      input.value = String(v);
      out.textContent = fmt(v);
    },
  };
}

const tableSelect = el('select', { ariaLabel: 'Table' });
for (const t of TABLE_PRESETS) tableSelect.append(el('option', { value: t.id }, t.name));
const layoutSelect = el('select', { ariaLabel: 'Layout' });
const seedInput = el('input', { type: 'number', value: '1', min: '1', ariaLabel: 'Rack seed' });
seedInput.style.width = '64px';

function fillLayouts(): void {
  layoutSelect.replaceChildren(
    ...(LAYOUTS[st.presetId] ?? ['empty']).map((l) => el('option', { value: l }, l)),
  );
  layoutSelect.value = st.layout;
}

tableSelect.addEventListener('change', () => {
  st.presetId = tableSelect.value;
  st.layout = LAYOUTS[st.presetId]![0]!;
  buildTable();
  fillLayouts();
  resetLayout();
  syncControls();
  resize();
});
layoutSelect.addEventListener('change', () => {
  st.layout = layoutSelect.value as LayoutId;
  resetLayout();
});
seedInput.addEventListener('change', () => {
  st.seed = Math.max(1, Number(seedInput.value) || 1);
  resetLayout();
});

const powerS = slider(
  'Cue speed (m/s)',
  0.1,
  10,
  0.05,
  st.shot.speed,
  (v) => (st.shot.speed = v),
  (v) => v.toFixed(2),
);
const elevS = slider(
  'Elevation (°)',
  0,
  85,
  0.5,
  0,
  (v) => (st.shot.elevation = (v * Math.PI) / 180),
  (v) => v.toFixed(1),
);
const aimOut = el('output', {}, '');
const aimRow = el(
  'div',
  { className: 'row' },
  el('label', {}, 'Aim (°)'),
  el('button', { onclick: () => nudge(-1), title: 'Nudge left 0.05°' }, '◀'),
  el('button', { onclick: () => nudge(1), title: 'Nudge right 0.05°' }, '▶'),
  aimOut,
);

// Spin widget.
const spin = el('canvas', {
  className: 'spin',
  width: 192,
  height: 192,
  ariaLabel: 'Tip position on the cue ball',
});
const spinOut = el('div', { className: 'small' });
function drawSpin(): void {
  const c = spin.getContext('2d')!;
  const s = 192;
  c.clearRect(0, 0, s, s);
  c.fillStyle = '#f6f3ea';
  c.beginPath();
  c.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(214,54,47,0.35)';
  c.setLineDash([6, 6]);
  c.beginPath();
  c.arc(s / 2, s / 2, (s / 2 - 4) * st.cue.miscueLimit, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  c.strokeStyle = 'rgba(0,0,0,0.2)';
  c.beginPath();
  c.moveTo(s / 2, 8);
  c.lineTo(s / 2, s - 8);
  c.moveTo(8, s / 2);
  c.lineTo(s - 8, s / 2);
  c.stroke();
  const x = s / 2 + st.shot.tip.a * (s / 2 - 4);
  const y = s / 2 - st.shot.tip.b * (s / 2 - 4);
  c.fillStyle = '#2459c9';
  c.beginPath();
  c.arc(x, y, 12, 0, Math.PI * 2);
  c.fill();
  spinOut.textContent = `side ${st.shot.tip.a.toFixed(2)}R, height ${st.shot.tip.b.toFixed(2)}R`;
}
const setSpin = (e: PointerEvent): void => {
  const r = spin.getBoundingClientRect();
  let a = ((e.clientX - r.left) / r.width) * 2 - 1;
  let b = -(((e.clientY - r.top) / r.height) * 2 - 1);
  const l = Math.hypot(a, b);
  if (l > 0.95) {
    a = (a / l) * 0.95;
    b = (b / l) * 0.95;
  }
  st.shot.tip = { a: Math.round(a * 100) / 100, b: Math.round(b * 100) / 100 };
  drawSpin();
};
spin.addEventListener('pointerdown', (e) => {
  spin.setPointerCapture(e.pointerId);
  setSpin(e);
});
spin.addEventListener('pointermove', (e) => {
  if (e.buttons) setSpin(e);
});
spin.addEventListener('dblclick', () => {
  st.shot.tip = { a: 0, b: 0 };
  drawSpin();
});

const coefSliders: { coef: Coef; s: ReturnType<typeof slider> }[] = [];
const coefSection = el('div');
function buildCoefSliders(): void {
  coefSection.replaceChildren();
  coefSliders.length = 0;
  for (const g of COEFS) {
    coefSection.append(el('h2', {}, g.group));
    for (const k of g.items) {
      const s = slider(
        k.label,
        k.min,
        k.max,
        k.step,
        k.get(st.table, st.cue),
        (v) => {
          st.overrides[k.id] = v;
          buildTable();
          drawSpin();
        },
        k.fmt,
      );
      coefSliders.push({ coef: k, s });
      coefSection.append(s.row);
    }
  }
}

const eventsBox = el('div', { className: 'events' });
const historyBox = el('div', { className: 'history' });
const exportBox = el('textarea', {
  placeholder: 'Shot JSON appears here after a shot. Paste one and press Load to replay it.',
});
const statesToggle = el('input', { type: 'checkbox' });
statesToggle.addEventListener('change', () => {
  st.showStates = statesToggle.checked;
  renderEvents();
});

function renderEvents(): void {
  const r = st.result;
  if (!r) {
    eventsBox.textContent = 'No shot yet.';
    return;
  }
  const lines = r.events
    .filter((e) => st.showStates || e.type !== 'state')
    .map((e) => {
      const t = e.t.toFixed(3).padStart(7);
      switch (e.type) {
        case 'strike':
          return `${t}  strike ${e.ball} ${e.speed.toFixed(2)} m/s${e.miscue ? ' MISCUE' : ''}`;
        case 'ball':
          return `${t}  ${e.a} × ${e.b}  ${e.speed.toFixed(2)} m/s`;
        case 'cushion':
          return `${t}  ${e.ball} → ${e.kind} ${e.segment.replace(/^(jaw|rail):/, '')} ${e.speed.toFixed(2)}`;
        case 'pocket':
          return `${t}  ${e.ball} POTTED ${e.pocket}`;
        case 'off-table':
          return `${t}  ${e.ball} OFF TABLE`;
        case 'state':
          return `${t}  ${e.ball} ${e.from} → ${e.to}`;
      }
    });
  eventsBox.textContent = lines.join('\n');
}

function renderHistory(): void {
  historyBox.replaceChildren(
    ...st.history
      .slice(0, 12)
      .map((h) =>
        el(
          'button',
          { onclick: () => load(h) },
          `${new Date(h.when).toLocaleTimeString()} · ${h.table} · ${h.shot.speed.toFixed(1)} m/s · tip ${h.shot.tip.a.toFixed(2)},${h.shot.tip.b.toFixed(2)}`,
        ),
      ),
  );
  if (st.history.length === 0)
    historyBox.append(el('div', { className: 'small' }, 'Shots you take are listed here.'));
}

const speedS = slider(
  'Playback ×',
  0.05,
  2,
  0.05,
  1,
  (v) => (st.speed = v),
  (v) => v.toFixed(2),
);
const trailsToggle = el('input', { type: 'checkbox', checked: true });
trailsToggle.addEventListener('change', () => (st.trails = trailsToggle.checked));
const segToggle = el('input', { type: 'checkbox', checked: true });
segToggle.addEventListener('change', () => (st.segments = segToggle.checked));
const moveToggle = el('input', { type: 'checkbox' });
moveToggle.addEventListener('change', () => (st.moveMode = moveToggle.checked));

function syncControls(): void {
  tableSelect.value = st.presetId;
  fillLayouts();
  powerS.set(st.shot.speed);
  elevS.set((st.shot.elevation * 180) / Math.PI);
  for (const { coef, s } of coefSliders) s.set(coef.get(st.table, st.cue));
  drawSpin();
}

panel.append(
  el('h1', {}, 'Physics lab'),
  el('div', { className: 'row' }, el('label', {}, 'Table'), tableSelect),
  el('div', { className: 'row' }, el('label', {}, 'Layout / seed'), layoutSelect, seedInput),
  el('h2', {}, 'Shot'),
  powerS.row,
  elevS.row,
  aimRow,
  el(
    'div',
    { className: 'spin-wrap' },
    spin,
    el(
      'div',
      {},
      spinOut,
      el(
        'div',
        { className: 'small' },
        'Tap to set the tip. Double-tap to centre. Dashed ring = miscue limit.',
      ),
    ),
  ),
  el(
    'div',
    { className: 'buttons' },
    el(
      'button',
      { className: 'primary', onclick: () => (st.result ? (commit(), shoot()) : shoot()) },
      'Shoot (Space)',
    ),
    el('button', { onclick: replay }, 'Replay (P)'),
    el('button', { onclick: undo }, 'Undo (U)'),
    el('button', { onclick: commit }, 'Keep result'),
    el('button', { onclick: resetLayout }, 'Re-rack'),
  ),
  speedS.row,
  el(
    'div',
    { className: 'row' },
    el('label', {}, 'Show'),
    el('span', { className: 'small' }, trailsToggle, ' trails  ', segToggle, ' physics edges'),
  ),
  el(
    'div',
    { className: 'row' },
    el('label', {}, 'Move balls'),
    el('span', { className: 'small' }, moveToggle, ' drag balls to place them'),
  ),
  el('h2', {}, 'Events'),
  el('div', { className: 'small' }, statesToggle, ' include motion-state changes'),
  eventsBox,
  coefSection,
  el(
    'div',
    { className: 'buttons' },
    el(
      'button',
      {
        onclick: () => {
          st.overrides = {};
          buildTable();
          syncControls();
        },
      },
      'Reset coefficients',
    ),
  ),
  el('h2', {}, 'Recorded shots'),
  historyBox,
  el('h2', {}, 'Share a shot'),
  exportBox,
  el(
    'div',
    { className: 'buttons' },
    el(
      'button',
      {
        onclick: () => {
          exportBox.select();
          void navigator.clipboard?.writeText(exportBox.value).catch(() => undefined);
        },
      },
      'Copy',
    ),
    el(
      'button',
      {
        onclick: () => {
          try {
            load(JSON.parse(exportBox.value) as Saved);
          } catch {
            exportBox.value = 'Could not read that JSON.';
          }
        },
      },
      'Load',
    ),
  ),
);

function nudge(dir: number, big = false): void {
  st.shot.aim += (dir * (big ? 1 : 0.05) * Math.PI) / 180;
}

// Pointer: aim (or drag balls in move mode).
let dragging: BallState | null = null;
let aiming = false;
const pointerWorld = (e: PointerEvent): Vec2 => {
  const r = canvas.getBoundingClientRect();
  return view.toWorld({ x: e.clientX - r.left, y: e.clientY - r.top });
};
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = pointerWorld(e);
  if (st.moveMode) {
    if (st.result) commit();
    dragging =
      st.balls.find(
        (b) => b.state !== 'pocketed' && Math.hypot(b.pos.x - p.x, b.pos.y - p.y) < b.radius * 1.5,
      ) ?? null;
    return;
  }
  if (st.result && !st.playing) commit();
  if (st.result) return;
  aiming = true;
  aimAt(p);
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointerWorld(e);
  if (dragging) {
    const hl = st.table.playfield.length / 2 - dragging.radius;
    const hw = st.table.playfield.width / 2 - dragging.radius;
    dragging.pos = { x: Math.max(-hl, Math.min(hl, p.x)), y: Math.max(-hw, Math.min(hw, p.y)) };
  } else if (aiming) aimAt(p);
});
const endPointer = (): void => {
  dragging = null;
  aiming = false;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

function aimAt(p: Vec2): void {
  const cue = st.balls.find((b) => b.id === st.shot.ball);
  if (!cue) return;
  if (Math.hypot(p.x - cue.pos.x, p.y - cue.pos.y) < cue.radius) return;
  st.shot.aim = Math.atan2(p.y - cue.pos.y, p.x - cue.pos.x);
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === ' ') {
    e.preventDefault();
    if (st.result) commit();
    shoot();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    nudge(1, e.shiftKey);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    nudge(-1, e.shiftKey);
  } else if (e.key === 'p') replay();
  else if (e.key === 'u') undo();
});

function resize(): void {
  view.fit(canvas, st.table);
}
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (st.playing && st.result) {
    st.playT += dt * st.speed;
    if (st.playT >= st.result.duration) finishPlayback();
  }
  aimOut.textContent = ((st.shot.aim * 180) / Math.PI).toFixed(2);
  draw(ctx, view, st.table, st.balls, st.result, st.playT, {
    trails: st.trails,
    segments: st.segments,
    aim: aimGuide(),
    highlight: st.shot.ball,
  });
  const r = st.result;
  const pots = r ? r.events.filter((e) => e.type === 'pocket').length : 0;
  hud.textContent = [
    `${st.table.name}`,
    r
      ? `t ${st.playT.toFixed(2)} / ${r.duration.toFixed(2)} s   sim ${st.simMs.toFixed(1)} ms   pots ${pots}${r.truncated ? '   TRUNCATED' : ''}`
      : 'Drag on the table to aim · Space to shoot',
  ].join('\n');
  requestAnimationFrame(frame);
}

// Boot.
loadHistory();
buildTable();
fillLayouts();
buildCoefSliders();
resetLayout();
syncControls();
renderEvents();
renderHistory();
resize();
requestAnimationFrame(frame);
