import {
  cloneBall,
  dropOutline,
  tableGeometry,
  cueClearElevation,
  layout,
  type BallState,
  type ShotInput,
  type ShotResult,
} from '@cuesports/physics';
import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  Plane,
  Raycaster,
  RingGeometry,
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
  GAMES,
  powerToSpeed,
  strokeSpeed,
  withClothSpeed,
  type ClothSpeed,
  type GameDef,
} from './game/games';
import { computeGuide, launchDirection, pocketAhead } from './game/guide';
import { SimClient } from './game/sim-client';
import { BallsView } from './render/balls-view';
import { CameraRig, type CameraMode } from './render/cameras';
import { physicsGroup, toPhysics, toWorld } from './render/coords';
import { CueView } from './render/cue-view';
import { GuideView } from './render/guide-view';
import { buildTableView, WELL_DEPTH, type TableView } from './render/table-view';
import { Hud } from './ui/hud';
import { MatchHud, type CallChoice } from './ui/match-hud';
import { Menu } from './ui/menu';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800-italic.css';
import { chooseDecision } from '@cuesports/ai';
import { AiClient } from './game/ai-client';
import { DEFAULT_MATCH, Match, type MatchConfig } from './game/match';
import { canPlaceCueBall, numberedOnTable, pocketName, type ShotDeclaration } from '@cuesports/rules';

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
const aiClient = new AiClient();
/** The computer is thinking or playing its shot. */
let aiBusy = false;
/** The player at the table is the computer (inputs are ignored). */
const aiTurn = (): boolean =>
  !!match && match.isAi(match.turn.player) && !match.rackResult && match.winner === null;
/** The player's own call (10-ball); null means call automatically from the aim. */
let manualCall: CallChoice = null;
let autoCall: CallChoice = null;
/** Snooker nomination: the player's own choice, or automatic from the aim. */
let manualNominate: string | null = null;
let autoNominate: string | null = null;
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
  // Practice has no calls or nominations: clear any chip left over from a match.
  matchHud.showCall(null, false, (p) => p, false);
  setTable(def);
  rerack();
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
  ballsView.setPockets(
    tableView.pocketRest,
    WELL_DEPTH,
    new Map(def.table.pockets.map((p) => [p.id, dropOutline(tableGeometry(def.table), p.id)])),
  );
  placeCanopy(def.table.playfield.length);
  rig.setTable(def.table);
}

// ---------------------------------------------------------------------------------------------
// Match play

function startMatch(config: MatchConfig): void {
  setTable(GAMES.find((g) => g.id === config.game) ?? GAMES[0]!);
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
  manualCall = null;
  manualNominate = null;
  endPick();
  matchHud.showBoard({
    players: match.config.players,
    score: match.score,
    raceTo: match.config.raceTo,
    turn: t,
    frame: match.framePoints,
  });
  matchHud.setPushAvailable(t.canPushOut && !match.rackResult);
  matchHud.showDecision(
    t.decision && !match.isAi(t.player) ? match.names(t.decision.prompt) : null,
    (t.decision?.choices ?? []).map((c) => ({ ...c, label: match!.names(c.label) })),
  );
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
      ? match.config.game === 'english'
        ? ' Ball in hand in baulk: drag the cue ball.'
        : ' Ball in hand behind the head string: drag the cue ball.'
      : t.ballInHand === 'in-d'
        ? ' Ball in hand in the D: drag the cue ball.'
        : t.ballInHand === 'anywhere'
          ? ' Ball in hand: drag the cue ball anywhere.'
          : '';
  matchHud.say(match.notable ? match.message + hand : '', hand ? 5000 : 3500);
  status(`${match.config.players[t.player]} to play`);
  window.setTimeout(maybeAiTurn, 400);
  if (match.rackResult) {
    const w = match.config.players[match.rackResult.winner]!;
    const score = `${match.config.players[0]} ${match.score[0]} – ${match.score[1]} ${match.config.players[1]}`;
    if (match.winner !== null) matchHud.showResult(`${w} wins the match`, score, true);
    else matchHud.showResult(`${w} wins ${match.unit} ${match.rack}`, `${match.message} ${score}`);
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
  if (phase !== 'aim' || aiTurn()) return;
  if (match && (match.turn.decision || match.rackResult)) return;
  const cue = cueBall();
  if (!cue || cue.state === 'pocketed') return;
  decl = {};
  if (match) {
    if (matchHud.pushOut) decl = { pushOut: true };
    else if (match.turn.mustNominate) {
      const n = manualNominate ?? autoNominate;
      if (n) decl = { nominate: n };
    } else if (match.turn.mustCall) {
      const call = manualCall ?? autoCall;
      if (call === 'safety') decl = { safety: true };
      else if (call) decl = { call };
    }
  }
  strike(
    { ...shot, speed: strokeSpeed(powerToSpeed(p, game.maxSpeed), shot.tip, cue.mass, DEFAULT_CUE.mass) },
    decl,
    p,
  );
}

/** Takes a shot exactly as given (used by the player's stroke and by the AI). */
function strike(input: ShotInput, declaration: ShotDeclaration, pullVisual: number): void {
  // The cue can't pass through the rail or a ball: it is raised until it clears them.
  input = withClearance(input);
  decl = declaration;
  hud.setPlacingAllowed(!match);
  placing = false;
  hud.setPlacing(false);
  shot = { ...input };
  const before = balls.map(cloneBall);
  phase = 'striking';
  strikeT = 0;
  pull = pullVisual;
  pending = null;
  hud.setBusy(true);
  const s = structuredClone(shot);
  void sim.run(simTable, before, s).then((r) => {
    pending = r;
    last = { before, shot: s, result: r.result };
  });
  dirty = true;
}

/** The shot with the butt raised as far as the cushion, rail and other balls force it. */
function withClearance(s: ShotInput): ShotInput {
  return { ...s, elevation: cueClearElevation(game.table, balls, s) };
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

/** A potted ball takes this long to drop and settle in the pocket. */
const POT_SETTLE = 0.5;

/** The shot is over when every ball is at rest, including balls still dropping into a pocket. */
function playbackEnd(result: ShotResult): number {
  let lastPot = -Infinity;
  for (const e of result.events) if (e.type === 'pocket') lastPot = Math.max(lastPot, e.t);
  return Math.max(result.duration, lastPot + POT_SETTLE);
}

/** Every shot starts from a centre-ball hit with a level cue. */
function resetSpin(): void {
  shot = { ...shot, tip: { a: 0, b: 0 }, elevation: 0 };
  hud.showSpin(shot.tip, 0);
}

function endPlayback(): void {
  if (!playing) return;
  const result = playing;
  resetSpin();
  if (replaying || match) {
    if (match && !replaying && last) match.judge(decl, last.before, result);
    replaying = false;
    balls = match ? match.balls.map(cloneBall) : result.final.map(cloneBall);
    if (match?.reracked) ballsView.setBalls(balls);
    else {
      ballsView.commit(result);
      ballsView.showState(balls);
    }
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

/** Lets the computer take its turn: answer a decision, or think, place the cue ball and play. */
function maybeAiTurn(): void {
  if (!match || aiBusy || phase !== 'aim' || !aiTurn()) return;
  const m = match;
  const t = m.turn;
  aiBusy = true;
  hud.setBusy(true);
  placing = false;
  hud.setPlacing(false);
  const input = {
    game: m.config.game,
    options: m.ruleOptions,
    state: m.state,
    turn: t,
    balls: balls.map(cloneBall),
    me: t.player,
    level: m.config.ai ?? 3,
    seed: (Math.random() * 2 ** 31) | 0,
    simTable,
    budgetMs: 1500,
  };
  if (t.decision) {
    const choice = chooseDecision({
      ruleset: m.ruleset,
      options: m.ruleOptions,
      state: m.state,
      turn: t,
      balls,
      me: t.player,
      level: input.level,
      seed: input.seed,
    });
    const label = t.decision.choices.find((c) => c.id === choice)?.label ?? choice;
    matchHud.say(`${m.config.players[t.player]}: ${m.names(label)}`);
    window.setTimeout(() => {
      aiBusy = false;
      if (match !== m) return;
      m.decide(choice);
      balls = m.balls.map(cloneBall);
      if (m.reracked) ballsView.setBalls(balls);
      else ballsView.showState(balls);
      hud.setBusy(false);
      syncTurn();
    }, 1100);
    return;
  }
  status(`${m.config.players[t.player]} is thinking…`);
  const started = performance.now();
  void aiClient.choose(input).then(({ ai }) => {
    if (match !== m || phase !== 'aim') {
      aiBusy = false;
      return;
    }
    // Show the decision for a moment: place the cue ball, line up, then strike.
    const wait = Math.max(0, 700 - (performance.now() - started));
    window.setTimeout(() => {
      if (match !== m) return;
      if (ai.place) placeCue(ai.place, true);
      shot = { ...ai.shot };
      hud.showSpin(ai.shot.tip, (ai.shot.elevation * 180) / Math.PI);
      rig.followAimInstantly();
      status(`${m.config.players[t.player]}: ${ai.label}`);
      dirty = true;
      window.setTimeout(() => {
        if (match !== m) return;
        aiBusy = false;
        strike(ai.shot, ai.decl, 0.5);
      }, 900);
    }, wait);
  });
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

const hud = new Hud({
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
  onMenu: () => {
    hud.closeSheets();
    menu.open('pause', { inMatch: match !== null });
  },
});
app.append(hud.root);

const matchHud: MatchHud = new MatchHud({
  onPushOut: () => undefined,
  onCall: (c) => {
    manualCall = c;
    dirty = true;
  },
  onDecision: (choice) => {
    if (!match) return;
    match.decide(choice);
    balls = match.balls.map(cloneBall);
    if (match.reracked) ballsView.setBalls(balls);
    else ballsView.showState(balls);
    syncTurn();
  },
  onNextRack: () => {
    if (!match) return;
    matchHud.showResult(null);
    match.startRack();
    loadRack();
  },
  onNewMatch: () => menu.open('play'),
  onHome: () => {
    quitToHome();
    menu.open('home');
  },
});
app.append(matchHud.root);

// ---------------------------------------------------------------------------------------------
// Menus

/** Camera mode to go back to when the menu closes. */
let playCamera: CameraMode = 'aim';
const menu: Menu = new Menu(
  {
    onStart: startMatch,
    onPractice: (id) => setGame(GAMES.find((g) => g.id === id) ?? GAMES[0]!),
    onRestart: () => (match ? startMatch(match.config) : rerack()),
    onConcede: () => {
      if (!match || phase !== 'aim') return;
      match.concede();
      syncTurn();
    },
    onQuit: quitToHome,
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
    onVisible: (open) => {
      app.classList.toggle('menu-open', open);
      if (open) {
        if (rig.mode !== 'free' || !rig.orbit.autoRotate) playCamera = rig.mode;
        // Attract mode: a slow orbit around the table behind the menu.
        const L = game.table.playfield.length;
        rig.setMode('free');
        rig.persp.position.set(L * 0.55, L * 0.42, L * 0.55);
        rig.orbit.target.set(0, 0, 0);
        rig.orbit.enabled = false;
        rig.orbit.autoRotate = true;
        rig.orbit.autoRotateSpeed = 0.35;
      } else {
        rig.orbit.autoRotate = false;
        rig.setMode(playCamera);
        hud.setCamera(playCamera);
        rig.snap();
      }
      dirty = true;
    },
  },
  GAMES.map((g) => ({ id: g.id, label: g.label })),
  clothSpeed,
);
showGuide = menu.settings.guide;
guideSquirt = menu.settings.squirt;
useOverview = menu.settings.overview;
app.append(menu.root);

/** Back to a practice rack behind the home screen. */
function quitToHome(): void {
  playCamera = 'aim';
  setGame(GAMES[0]!);
}
// The scoreboard lives in the top bar, next to the menu button.
hud.placeInTop(matchHud.board);
// ---------------------------------------------------------------------------------------------
// Calling a shot / nominating a ball by tapping the table in the top-down view

interface Pick {
  kind: 'call' | 'nominate';
  /** Balls that may be picked. */
  candidates: string[];
  ball: string | null;
  /** Camera to return to when done. */
  back: CameraMode;
}
let picking: Pick | null = null;

const pickRing = new Mesh(
  new RingGeometry(1.35, 1.75, 40),
  new MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.9, depthTest: false }),
);
pickRing.renderOrder = 10;
pickRing.visible = false;
world.add(pickRing);

function markBall(id: string | null): void {
  const b = id ? balls.find((x) => x.id === id) : undefined;
  pickRing.visible = !!b;
  if (b) {
    pickRing.scale.setScalar(b.radius);
    pickRing.position.set(b.pos.x, b.pos.y, b.radius * 2.2);
  }
  dirty = true;
}

function updatePickBar(): void {
  if (!picking) return matchHud.showPickBar(null);
  const cancel = { label: 'Cancel', run: () => endPick() };
  const auto = {
    label: 'Auto from aim',
    run: () => {
      if (picking?.kind === 'nominate') manualNominate = null;
      else manualCall = null;
      endPick();
    },
  };
  if (picking.kind === 'nominate') {
    matchHud.showPickBar('Tap the ball you are nominating.', [auto, cancel]);
    return;
  }
  const text = picking.ball ? `Ball ${picking.ball}: now tap the pocket.` : 'Tap the ball you are calling.';
  const actions = [{ label: 'Safety', run: () => ((manualCall = 'safety'), endPick()) }, auto, cancel];
  if (picking.ball && picking.candidates.length > 1)
    actions.unshift({
      label: 'Change ball',
      run: () => ((picking!.ball = null), markBall(null), updatePickBar()),
    });
  matchHud.showPickBar(text, actions);
}

function startPick(): void {
  if (!match || phase !== 'aim' || aiTurn()) return;
  const nominate = !!match.turn.mustNominate;
  const candidates = nominate ? match.turn.targets : numberedOnTable(balls);
  if (candidates.length === 0) return;
  picking = {
    kind: nominate ? 'nominate' : 'call',
    candidates,
    // With only one ball left the choice of ball is irrelevant: go straight to the pocket.
    ball: !nominate && candidates.length === 1 ? candidates[0]! : null,
    back: picking?.back ?? rig.mode,
  };
  rig.setMode('top');
  hud.setCamera('top');
  markBall(picking.ball);
  updatePickBar();
}

function endPick(): void {
  if (!picking) return;
  const back = picking.back;
  picking = null;
  pickRing.visible = false;
  matchHud.showPickBar(null);
  if (back !== 'top') {
    rig.setMode(back);
    hud.setCamera(back);
  }
  dirty = true;
}

/** Handles a tap on the table while picking. */
function pickAt(p: { x: number; y: number }): void {
  if (!picking) return;
  const near = (id: string) => {
    const b = balls.find((x) => x.id === id && x.state !== 'pocketed');
    return b ? Math.hypot(b.pos.x - p.x, b.pos.y - p.y) / b.radius : Infinity;
  };
  let best: string | null = null;
  for (const id of picking.candidates) if (near(id) < 2.5 && (!best || near(id) < near(best))) best = id;
  if (picking.kind === 'nominate') {
    if (!best) return;
    manualNominate = best;
    endPick();
    return;
  }
  // A tap on a ball (re)selects the ball; otherwise, with a ball chosen, it picks the nearest pocket.
  if (best && (!picking.ball || best !== picking.ball)) {
    picking.ball = best;
    markBall(best);
    updatePickBar();
    return;
  }
  if (!picking.ball) return;
  let pocket: string | null = null;
  let dist = Infinity;
  for (const pk of game.table.pockets) {
    const d = Math.hypot(pk.position.x - p.x, pk.position.y - p.y);
    if (d < dist) [pocket, dist] = [pk.id, d];
  }
  if (!pocket || dist > game.table.playfield.width * 0.3) return;
  manualCall = { ball: picking.ball, pocket };
  endPick();
}

matchHud.onCallClick(() => (picking ? endPick() : startPick()));
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
  if (rig.mode === 'free' || aiTurn()) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), y: (a!.y + b!.y) / 2 };
  } else if (phase === 'aim') {
    const p = tablePoint(e.clientX, e.clientY);
    if (picking) {
      if (p) pickAt(p);
    } else if (p && placing) placeCue(p);
    else if (p && rig.mode === 'top') aimAtPoint(p);
  }
  dirty = true;
});

canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev || rig.mode === 'free') return;
  if (aiTurn()) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    return;
  }
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
  if (phase !== 'aim' || picking) return;
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

function placeCue(p: { x: number; y: number }, force = false): void {
  const cue = cueBall();
  if (!cue || (!force && !canPlace(cue, p))) return;
  cue.pos = p;
  cue.state = 'stationary';
  ballsView.showState(balls);
  dirty = true;
}

window.addEventListener('keydown', (e) => {
  if (menu.isOpen) return;
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
    // The drop animation keeps running after the simulation ends.
    ballsView.showFrame(playing, playT);
    if (playT >= playbackEnd(playing)) endPlayback();
    dirty = true;
  }

  if (menu.isOpen) dirty = true;
  if (cue) {
    // While aiming the camera rides just above the cue when it is raised (chin on the cue).
    const cueElevation =
      phase === 'aim' ? withClearance(shot).elevation : phase === 'striking' ? shot.elevation : 0;
    const moving = rig.update(dt, cue.pos, cue.radius, shot.aim, cueElevation);
    if (moving) dirty = true;
    if (phase !== 'playing') {
      // The cue draws back as the power bar is pulled, then drives through during the strike.
      const back = 0.015 + pull * 0.22;
      const gap = phase === 'striking' ? Math.max(0, back * (1 - (strikeT / 0.09) ** 2)) : back;
      const live = phase === 'aim' ? withClearance(shot) : shot;
      cueView.pose(cue.pos.x, cue.pos.y, cue.radius, live, gap);
      if (phase === 'aim') hud.setForcedElevation((live.elevation * 180) / Math.PI);
    }
  }
  const guide =
    phase === 'aim' && cue
      ? computeGuide(game.table, balls, 'cue', guideSquirt ? launchDirection(cue, shot) : shot.aim)
      : null;
  guideView.update(showGuide && !placing ? guide : null);
  if (match && phase === 'aim') {
    const pocket = guide?.object ? pocketAhead(game.table, guide.object.from, guide.object.dir) : null;
    autoCall = guide?.object && pocket ? { ball: guide.object.id, pocket } : null;
    const free = !match.turn.decision && !match.rackResult && !aiTurn() && !picking;
    if (match.turn.mustNominate) {
      const aimed = guide?.object?.id ?? null;
      autoNominate = aimed && match.turn.targets.includes(aimed) ? aimed : null;
      matchHud.showNomination(manualNominate ?? autoNominate, manualNominate !== null, free);
    } else {
      const needsCall = match.turn.mustCall && !matchHud.pushOut && free;
      matchHud.showCall(manualCall ?? autoCall, manualCall !== null, pocketName, needsCall);
    }
  }

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
menu.open('home');
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
  /** Starts a match with default settings (9-ball unless another game is given). */
  startMatch: (players?: [string, string], game?: MatchConfig['game']) =>
    startMatch({
      ...DEFAULT_MATCH,
      players: players ?? DEFAULT_MATCH.players,
      game: game ?? DEFAULT_MATCH.game,
    }),
  /** Takes a decision offered to the player at the table (e.g. 'play' or 'pass' after a push out). */
  decide: (choice: string) => {
    if (!match) return;
    match.decide(choice);
    balls = match.balls.map(cloneBall);
    if (match.reracked) ballsView.setBalls(balls);
    else ballsView.showState(balls);
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
  /** Sets the cue elevation in degrees. */
  elevation: (deg: number) => {
    shot.elevation = (deg * Math.PI) / 180;
    dirty = true;
  },
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
    if (playing) playT = playbackEnd(playing);
  },
  /** Screen (client) position of a physics-space point on the table, for driving taps in tests. */
  screenOf: (x: number, y: number) => {
    const v = toWorld(x, y, cueBall()?.radius ?? 0.028).project(rig.camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  },
  setCamera: (m: CameraMode) => {
    rig.setMode(m);
    hud.setCamera(m);
    dirty = true;
  },
};
