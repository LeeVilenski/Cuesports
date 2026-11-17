import { cloneBall, layout, type BallState, type ShotInput, type ShotResult } from '@cuesports/physics';
import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  HemisphereLight,
  PMREMGenerator,
  Plane,
  Raycaster,
  Scene,
  SpotLight,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DEFAULT_CUE } from '@cuesports/shared';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { registerSW } from 'virtual:pwa-register';
import {
  CLOTH_SPEEDS,
  GAMES,
  powerToSpeed,
  strokeSpeed,
  withClothSpeed,
  type ClothSpeed,
  type GameDef,
} from './game/games';
import { computeGuide, launchDirection } from './game/guide';
import { SimClient } from './game/sim-client';
import { BallsView } from './render/balls-view';
import { CameraRig, type CameraMode } from './render/cameras';
import { physicsGroup, toPhysics } from './render/coords';
import { CueView } from './render/cue-view';
import { GuideView } from './render/guide-view';
import { buildTableView, WELL_DEPTH, type TableView } from './render/table-view';
import { Hud } from './ui/hud';
import { MatchHud } from './ui/match-hud';
import { DEFAULT_MATCH, Match, type MatchConfig } from './game/match';
import { canPlaceCueBall, type ShotDeclaration } from '@cuesports/rules';

// ---------------------------------------------------------------------------------------------
// Renderer and scene

const app = document.getElementById('app')!;
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.append(renderer.domElement);
const canvas = renderer.domElement;
canvas.setAttribute('aria-label', 'Table');

const scene = new Scene();
scene.background = new Color('#0b0e0c');
scene.fog = new Fog('#0b0e0c', 6, 16);
const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;
scene.add(new HemisphereLight('#fff6e8', '#20160e', 0.18));

const world = physicsGroup();
scene.add(world);

const canopy: SpotLight[] = [];
function placeCanopy(length: number): void {
  for (const l of canopy) world.remove(l, l.target);
  canopy.length = 0;
  const n = length > 3 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const x = -length / 3 + ((2 * length) / 3) * (i / (n - 1));
    const l = new SpotLight('#fff3e0', 2.6, 4, 1.05, 0.9, 1.6);
    l.position.set(x, 0, 1.0);
    l.target.position.set(x, 0, 0);
    world.add(l, l.target);
    canopy.push(l);
  }
}

// ---------------------------------------------------------------------------------------------
// Game state

type Phase = 'aim' | 'striking' | 'playing';

const sim = new SimClient();
const ballsView = new BallsView();
const cueView = new CueView();
const guideView = new GuideView();
world.add(ballsView.group, cueView.group, guideView.group);

let game: GameDef = GAMES[0]!;
let tableView: TableView | null = null;
let clothSpeed: ClothSpeed = loadClothSpeed();
/** The table the physics runs on: the game's table with the chosen cloth speed. */
let simTable = withClothSpeed(game.table, clothSpeed);

function loadClothSpeed(): ClothSpeed {
  try {
    const v = localStorage.getItem('cuesports.clothSpeed');
    if (v === 'fast' || v === 'medium' || v === 'slow') return v;
  } catch {
    // Storage unavailable: use the default.
  }
  return 'medium';
}
let balls: BallState[] = [];
let cueStart = { x: 0, y: 0 };
let phase: Phase = 'aim';
let shot: ShotInput = { ball: 'cue', aim: 0, elevation: 0, tip: { a: 0, b: 0 }, speed: 3 };
let pull = 0;
let strikeT = 0;
let pending: { result: ShotResult; ms: number } | null = null;
let playing: ShotResult | null = null;
let playT = 0;
let last: { before: BallState[]; shot: ShotInput; result: ShotResult } | null = null;
let showGuide = true;
/** The guide follows the cue ball's real launch direction, including squirt from side. */
let guideSquirt = true;
let useOverview = true;
let placing = false;
let dirty = true;
/** The 9-ball match being played, or null in practice. */
let match: Match | null = null;
let decl: ShotDeclaration = {};
let replaying = false;
/** Playback frozen at a fixed time (test hook). */
let frozen = false;

const rig = new CameraRig(canvas, game.table);

const cueBall = (): BallState | undefined => balls.find((b) => b.id === 'cue');

function setGame(def: GameDef): void {
  match = null;
  matchHud.showBoard(null);
  matchHud.setPushAvailable(false);
  matchHud.showDecision(null);
  matchHud.showResult(null);
  setTable(def);
  rerack();
  hud.setGame(def.id);
}

function setTable(def: GameDef): void {
  game = def;
  simTable = withClothSpeed(def.table, clothSpeed);
  if (tableView) {
    world.remove(tableView.group);
    tableView.dispose();
  }
  tableView = buildTableView(def.table);
  world.add(tableView.group);
  ballsView.setPockets(tableView.pocketRest, WELL_DEPTH);
  placeCanopy(def.table.playfield.length);
  rig.setTable(def.table);
}

// ---------------------------------------------------------------------------------------------
// Match play

function startMatch(config: MatchConfig): void {
  setTable(GAMES.find((g) => g.id === 'nine-ball')!);
  match = new Match(config, (Math.random() * 1e9) | 0);
  matchHud.showResult(null);
  loadRack();
}

function loadRack(): void {
  if (!match) return;
  balls = match.balls.map(cloneBall);
  ballsView.setBalls(balls);
  last = null;
  phase = 'aim';
  playing = null;
  rig.snap();
  syncTurn();
}

/** Updates the HUD and controls for whoever is at the table now. */
function syncTurn(): void {
  if (!match) return;
  const t = match.turn;
  matchHud.showBoard({
    players: match.config.players,
    score: match.score,
    raceTo: match.config.raceTo,
    turn: t,
  });
  matchHud.setPushAvailable(t.canPushOut && !match.rackResult);
  matchHud.showDecision(t.decision ? match.names(t.decision.prompt) : null, t.decision?.choices ?? []);
  placing = t.ballInHand !== 'none' && !match.rackResult;
  hud.setPlacing(placing);
  hud.setPlacingAllowed(placing);
  if (placing && rig.mode === 'aim') {
    rig.setMode('top');
    hud.setCamera('top');
  }
  const target = balls.find((b) => b.id === t.targets[0]);
  const cue = cueBall();
  if (target && cue) shot.aim = Math.atan2(target.pos.y - cue.pos.y, target.pos.x - cue.pos.x);
  const hand =
    t.ballInHand === 'behind-head-string'
      ? ' Ball in hand behind the head string: drag the cue ball.'
      : t.ballInHand === 'anywhere'
        ? ' Ball in hand: drag the cue ball anywhere.'
        : '';
  matchHud.say(match.message + hand, hand ? 7000 : 4500);
  status(`${match.config.players[t.player]} to play`);
  if (match.rackResult) {
    const w = match.config.players[match.rackResult.winner]!;
    const score = `${match.config.players[0]} ${match.score[0]} – ${match.score[1]} ${match.config.players[1]}`;
    if (match.winner !== null) matchHud.showResult(`${w} wins the match`, score, true);
    else matchHud.showResult(`${w} wins rack ${match.rack}`, `${match.message} ${score}`);
  }
  rig.snap();
  dirty = true;
}

function rerack(): void {
  balls = layout(game.table, game.layout, (Math.random() * 1e6) | 0);
  const cue = cueBall()!;
  cueStart = { ...cue.pos };
  ballsView.setBalls(balls);
  phase = 'aim';
  playing = null;
  last = null;
  aimAtFirstBall();
  rig.snap();
  status();
  dirty = true;
}

function aimAtFirstBall(): void {
  const cue = cueBall();
  const target = balls.find((b) => b.id !== 'cue' && b.state !== 'pocketed');
  if (cue && target) shot.aim = Math.atan2(target.pos.y - cue.pos.y, target.pos.x - cue.pos.x);
}

function status(extra = ''): void {
  hud.setStatus(extra ? `${game.label} · ${extra}` : game.label);
}

// ---------------------------------------------------------------------------------------------
// Shooting

function shoot(p: number): void {
  if (phase !== 'aim') return;
  if (match && (match.turn.decision || match.rackResult)) return;
  const cue = cueBall();
  if (!cue || cue.state === 'pocketed') return;
  decl = match ? { pushOut: matchHud.pushOut } : {};
  hud.setPlacingAllowed(!match);
  placing = false;
  hud.setPlacing(false);
  shot = {
    ...shot,
    speed: strokeSpeed(powerToSpeed(p, game.maxSpeed), shot.tip, cue.mass, DEFAULT_CUE.mass),
  };
  const before = balls.map(cloneBall);
  phase = 'striking';
  strikeT = 0;
  pull = p;
  pending = null;
  hud.setBusy(true);
  const s = structuredClone(shot);
  void sim.run(simTable, before, s).then((r) => {
    pending = r;
    last = { before, shot: s, result: r.result };
  });
  dirty = true;
}

function startPlayback(): void {
  if (!pending) return;
  playing = pending.result;
  playT = 0;
  phase = 'playing';
  cueView.group.visible = false;
  rig.overview = useOverview && rig.mode === 'aim';
  navigator.vibrate?.(12);
}

function endPlayback(): void {
  if (!playing) return;
  const result = playing;
  if (replaying || match) {
    if (match && !replaying && last) match.judge(decl, last.before, result);
    replaying = false;
    balls = match ? match.balls.map(cloneBall) : result.final.map(cloneBall);
    ballsView.commit(result);
    ballsView.showState(balls);
    playing = null;
    phase = 'aim';
    rig.overview = false;
    cueView.group.visible = true;
    hud.setBusy(false);
    if (match) syncTurn();
    dirty = true;
    return;
  }
  balls = result.final.map(cloneBall);
  const miscue = result.events.some((e) => e.type === 'strike' && e.miscue);
  const potted = result.events
    .filter((e) => e.type === 'pocket')
    .map((e) => (e.type === 'pocket' ? e.ball : ''));
  const cue = cueBall();
  ballsView.commit(result);
  if (cue && cue.state === 'pocketed') respawnCue(cue);
  ballsView.showState(balls);
  playing = null;
  phase = 'aim';
  rig.overview = false;
  cueView.group.visible = true;
  hud.setBusy(false);
  const ms = pending?.ms;
  status(
    [
      miscue ? 'MISCUE' : '',
      potted.length ? `potted ${potted.join(', ')}` : 'no pot',
      ms !== undefined ? `sim ${ms.toFixed(0)} ms` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );
  dirty = true;
}

/** Puts a potted cue ball back at its starting spot (nudged clear of other balls). Rules come in M3. */
function respawnCue(cue: BallState): void {
  cue.state = 'stationary';
  delete cue.pocket;
  cue.vel = { x: 0, y: 0 };
  cue.spin = { x: 0, y: 0, z: 0 };
  for (let k = 0; k < 40; k++) {
    const p = { x: cueStart.x, y: cueStart.y + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * cue.radius * 2.2 };
    if (canPlace(cue, p)) {
      cue.pos = p;
      return;
    }
  }
}

function canPlace(cue: BallState, p: { x: number; y: number }): boolean {
  if (match) return canPlaceCueBall(match.table, balls, match.turn.ballInHand, p, cue.id);
  const hl = game.table.playfield.length / 2 - cue.radius;
  const hw = game.table.playfield.width / 2 - cue.radius;
  if (Math.abs(p.x) > hl || Math.abs(p.y) > hw) return false;
  return balls.every(
    (b) =>
      b === cue ||
      b.state === 'pocketed' ||
      Math.hypot(b.pos.x - p.x, b.pos.y - p.y) >= b.radius + cue.radius,
  );
}

function replay(): void {
  if (!last || phase !== 'aim') return;
  balls = last.before.map(cloneBall);
  ballsView.showState(balls);
  shot = structuredClone(last.shot);
  pending = { result: last.result, ms: 0 };
  replaying = true;
  hud.setBusy(true);
  startPlayback();
}

function undo(): void {
  if (match) {
    matchHud.say('Undo is only available in practice.');
    return;
  }
  if (!last || phase !== 'aim') return;
  balls = last.before.map(cloneBall);
  shot = structuredClone(last.shot);
  ballsView.showState(balls);
  rig.snap();
  status('shot undone');
  dirty = true;
}

// ---------------------------------------------------------------------------------------------
// HUD

const hud = new Hud(
  {
    onCamera: (mode: CameraMode) => {
      rig.setMode(mode);
      hud.setCamera(mode);
      dirty = true;
    },
    onPull: (p) => {
      pull = p ?? 0;
      dirty = true;
    },
    onShoot: shoot,
    onFineAim: (dx) => {
      shot.aim -= dx * 0.00012;
      rig.followAimInstantly();
      dirty = true;
    },
    onTip: (a, b) => {
      shot.tip = { a, b };
      dirty = true;
    },
    onElevation: (deg) => {
      shot.elevation = (deg * Math.PI) / 180;
      dirty = true;
    },
    onPlaceToggle: (on) => {
      if (match && match.turn.ballInHand === 'none') {
        hud.setPlacing(false);
        matchHud.say('You can only move the cue ball when you have ball in hand.');
        return;
      }
      placing = on;
      if (on && rig.mode === 'aim') {
        rig.setMode('top');
        hud.setCamera('top');
      }
      dirty = true;
    },
    onReplay: replay,
    onUndo: undo,
    onGame: (id) => setGame(GAMES.find((g) => g.id === id) ?? GAMES[0]!),
    onRerack: () =>
      match ? matchHud.say('Re-rack is for practice. Start a new match from the menu.') : rerack(),
    onNewMatch: () => matchHud.openSetup(),
    onClothSpeed: (speed) => {
      clothSpeed = speed;
      simTable = withClothSpeed(game.table, speed);
      try {
        localStorage.setItem('cuesports.clothSpeed', speed);
      } catch {
        // Not persisted; fine for this session.
      }
    },
    onOption: (name, on) => {
      if (name === 'guide') showGuide = on;
      else if (name === 'squirt') guideSquirt = on;
      else useOverview = on;
      dirty = true;
    },
  },
  GAMES.map((g) => ({ id: g.id, label: g.label })),
  Object.entries(CLOTH_SPEEDS).map(([id, c]) => ({ id, label: c.label })),
);
hud.setClothSpeed(clothSpeed);
app.append(hud.root);

const matchHud: MatchHud = new MatchHud({
  onPushOut: () => undefined,
  onDecision: (choice) => {
    if (!match) return;
    match.decide(choice);
    balls = match.balls.map(cloneBall);
    ballsView.showState(balls);
    syncTurn();
  },
  onNextRack: () => {
    if (!match) return;
    matchHud.showResult(null);
    match.startRack();
    loadRack();
  },
  onStart: startMatch,
  onPractice: () => setGame(GAMES[0]!),
});
app.append(matchHud.root);
hud.setCamera('aim');

// ---------------------------------------------------------------------------------------------
// Canvas input

const pointers = new Map<number, { x: number; y: number; t: number }>();
let pinch: { d: number; y: number } | null = null;
const raycaster = new Raycaster();
const ndc = new Vector2();

function tablePoint(clientX: number, clientY: number): { x: number; y: number } | null {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, rig.camera);
  const R = cueBall()?.radius ?? 0.028;
  const hit = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -R), new Vector3());
  if (!hit) return null;
  const p = toPhysics(hit);
  return { x: p.x, y: p.y };
}

function aimAtPoint(p: { x: number; y: number }): void {
  const cue = cueBall();
  if (!cue) return;
  if (Math.hypot(p.x - cue.pos.x, p.y - cue.pos.y) < cue.radius * 1.2) return;
  shot.aim = Math.atan2(p.y - cue.pos.y, p.x - cue.pos.x);
}

canvas.addEventListener('pointerdown', (e) => {
  if (rig.mode === 'free') return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), y: (a!.y + b!.y) / 2 };
  } else if (phase === 'aim') {
    const p = tablePoint(e.clientX, e.clientY);
    if (p && placing) placeCue(p);
    else if (p && rig.mode === 'top') aimAtPoint(p);
  }
  dirty = true;
});

canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev || rig.mode === 'free') return;
  const cur = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  pointers.set(e.pointerId, cur);
  if (pointers.size >= 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    const y = (a!.y + b!.y) / 2;
    rig.zoom(d / pinch.d);
    if (rig.mode === 'aim') rig.tilt((y - pinch.y) * 0.15);
    pinch = { d, y };
    dirty = true;
    return;
  }
  if (phase !== 'aim') return;
  if (placing) {
    const p = tablePoint(e.clientX, e.clientY);
    if (p) placeCue(p);
  } else if (rig.mode === 'top') {
    const p = tablePoint(e.clientX, e.clientY);
    if (p) aimAtPoint(p);
  } else {
    // Aim cam: sideways drag turns the aim. Slow drags are much finer than fast ones.
    const dx = cur.x - prev.x;
    const dt = Math.max(1, cur.t - prev.t);
    const speed = Math.abs(dx) / dt; // px per ms
    const gain = Math.min(1, Math.max(0.06, speed / 1.2));
    shot.aim -= dx * 0.0035 * gain;
    rig.followAimInstantly();
  }
  dirty = true;
});

const endPointer = (e: PointerEvent): void => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener(
  'wheel',
  (e) => {
    if (rig.mode === 'free') return;
    e.preventDefault();
    if (e.ctrlKey && rig.mode === 'aim') rig.tilt(-e.deltaY * 0.05);
    else rig.zoom(Math.exp(-e.deltaY * 0.0012));
    dirty = true;
  },
  { passive: false },
);

function placeCue(p: { x: number; y: number }): void {
  const cue = cueBall();
  if (!cue || !canPlace(cue, p)) return;
  cue.pos = p;
  cue.state = 'stationary';
  ballsView.showState(balls);
  dirty = true;
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const step = ((e.shiftKey ? 1 : 0.05) * Math.PI) / 180;
  if (e.key === 'ArrowLeft') shot.aim += step;
  else if (e.key === 'ArrowRight') shot.aim -= step;
  else if (e.key === 'ArrowUp') rig.tilt(2);
  else if (e.key === 'ArrowDown') rig.tilt(-2);
  else if (e.key === ' ') {
    e.preventDefault();
    shoot(hud.power);
  } else if (e.key === '1' || e.key === '2' || e.key === '3') {
    const mode = (['aim', 'top', 'free'] as const)[Number(e.key) - 1]!;
    rig.setMode(mode);
    hud.setCamera(mode);
  } else return;
  rig.followAimInstantly();
  dirty = true;
});

// ---------------------------------------------------------------------------------------------
// Frame loop: renders only when something changes, and lowers the resolution if frames are slow.

let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
const maxRatio = pixelRatio;
let slowFrames = 0;
let fastFrames = 0;

function resize(): void {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h);
  rig.resize(w / h);
  rig.snap();
  dirty = true;
}
window.addEventListener('resize', resize);

let lastT = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const cue = cueBall();

  if (phase === 'striking') {
    strikeT += dt;
    dirty = true;
    if (strikeT >= 0.09 && pending) startPlayback();
  }
  if (phase === 'playing' && playing) {
    if (!frozen) playT += dt;
    ballsView.showFrame(playing, Math.min(playT, playing.duration));
    if (playT >= playing.duration) endPlayback();
    dirty = true;
  }

  if (cue) {
    const moving = rig.update(dt, cue.pos, cue.radius, shot.aim);
    if (moving) dirty = true;
    if (phase !== 'playing') {
      // The cue draws back as the power bar is pulled, then drives through during the strike.
      const back = 0.015 + pull * 0.22;
      const gap = phase === 'striking' ? Math.max(0, back * (1 - (strikeT / 0.09) ** 2)) : back;
      cueView.pose(cue.pos.x, cue.pos.y, cue.radius, shot, gap);
    }
  }
  guideView.update(
    showGuide && phase === 'aim' && !placing && cue
      ? computeGuide(game.table, balls, 'cue', guideSquirt ? launchDirection(cue, shot) : shot.aim)
      : null,
  );

  if (dirty) {
    const t0 = performance.now();
    renderer.render(scene, rig.camera);
    adaptQuality(performance.now() - t0 + (now - lastT));
    dirty = false;
  }
  requestAnimationFrame(frame);
}

function adaptQuality(ms: number): void {
  if (ms > 24) slowFrames++;
  else if (ms < 10) fastFrames++;
  if (slowFrames > 40 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    slowFrames = fastFrames = 0;
    resize();
  } else if (fastFrames > 240 && pixelRatio < maxRatio) {
    pixelRatio = Math.min(maxRatio, pixelRatio + 0.25);
    slowFrames = fastFrames = 0;
    resize();
  }
}

// ---------------------------------------------------------------------------------------------
// Boot

setGame(GAMES[0]!);
matchHud.openSetup();
resize();
requestAnimationFrame(frame);

registerSW({ immediate: true });

// Exposed for automated smoke tests.
(window as unknown as { __cuesports: unknown }).__cuesports = {
  shoot,
  state: () => ({
    phase,
    balls,
    shot,
    match: match
      ? {
          score: match.score,
          turn: match.turn,
          message: match.message,
          rack: match.rack,
          rackResult: match.rackResult,
        }
      : null,
  }),
  /** Starts a 9-ball match with default settings. */
  startMatch: (players?: [string, string]) =>
    startMatch({ ...DEFAULT_MATCH, players: players ?? DEFAULT_MATCH.players }),
  /** Takes a decision offered to the player at the table (e.g. 'play' or 'pass' after a push out). */
  decide: (choice: string) => {
    if (!match) return;
    match.decide(choice);
    balls = match.balls.map(cloneBall);
    ballsView.showState(balls);
    syncTurn();
  },
  /** Free camera at a physics-space eye position looking at a target (for screenshots). */
  view: (eye: [number, number, number], target: [number, number, number]) => {
    rig.setMode('free');
    hud.setCamera('free');
    rig.persp.position.set(eye[0], eye[2], -eye[1]);
    rig.orbit.target.set(target[0], target[2], -target[1]);
    rig.orbit.update();
    dirty = true;
  },
  /** Moves a ball (for scripted test set-ups). */
  place: (id: string, x: number, y: number) => {
    const b = balls.find((q) => q.id === id);
    if (!b || phase !== 'aim') return;
    b.pos = { x, y };
    b.state = 'stationary';
    delete b.pocket;
    ballsView.showState(balls);
    dirty = true;
  },
  /** Sets the aim angle in radians. */
  aim: (rad: number) => {
    shot.aim = rad;
    rig.followAimInstantly();
    dirty = true;
  },
  /** Freezes playback of the current shot at time t (seconds), or resumes it with null. */
  seek: (t: number | null) => {
    frozen = t !== null;
    if (t !== null) playT = t;
    dirty = true;
  },
  /** Events of the shot being played. */
  events: () => playing?.events.filter((e) => e.type !== 'state') ?? [],
  /** Jumps to the end of the shot being played. */
  fastForward: () => {
    if (playing) playT = playing.duration;
  },
  setCamera: (m: CameraMode) => {
    rig.setMode(m);
    hud.setCamera(m);
    dirty = true;
  },
};
