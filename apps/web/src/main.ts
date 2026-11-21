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
  Group,
  Scene,
  SpotLight,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DEFAULT_CUE, type TableSpec } from '@cuesports/shared';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { registerSW } from 'virtual:pwa-register';
import {
  GAMES,
  powerToSpeed,
  strokeSpeed,
  visitWord,
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
import { Character, type StanceInput, type TableFrame, type Want } from './render/character';
import { lookFor, PRESETS, presetsFor } from './render/figure';
import { ShotCamera, type ShotCameraMode } from './render/shot-camera';
import { GuideView } from './render/guide-view';
import { buildTableView, WELL_DEPTH, type TableView } from './render/table-view';
import { Hud } from './ui/hud';
import { MatchHud, type CallChoice } from './ui/match-hud';
import { Menu } from './ui/menu';
import { ReplayBar } from './ui/replay-bar';
import { EditorBar } from './ui/editor-bar';
import {
  ballsLabel,
  compactBalls,
  expandBalls,
  firstContact,
  recordId,
  reelOfRack,
  specsOf,
  type Highlight,
  type Reel,
  type ShotRecord,
} from './game/record';
import { openStore } from './game/store';
import { cuesFor, due, type SoundCue } from './audio/cues';
import { DEFAULT_SOUND, Sound, type SoundSettings } from './audio/sound';
import type { AmbienceKind } from './audio/synth';
import { addMatch, emptyStats, percent } from './game/stats';
import {
  careerEvent,
  enter,
  loadCareer,
  nextOpponent,
  opponent,
  recordMatch,
  REWARDS,
  roundName,
  saveCareer,
  VENUES,
  type CareerState,
} from './game/career';
import { loadProfile, profilePreset, saveProfile, type Profile } from './game/profile';
import { bestLabel, DRILLS, recordBest, type DrillId } from './game/drills';
import {
  CHALLENGES,
  judgeChallenge,
  loadStars,
  newRun,
  recordStars,
  starText,
  type ChallengeRun,
  type ChallengeSpec,
} from './game/challenges';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800-italic.css';
import { chooseDecision } from '@cuesports/ai';
import { AiClient } from './game/ai-client';
import {
  advance as tutorialAdvance,
  markTutorialSeen,
  newTutorial,
  stepOf,
  type TutorialEvent,
  type TutorialState,
} from './game/tutorial';
import { Coach } from './ui/coach';
import { resolveTier, TIERS, type TierChoice } from './render/quality';
import { DEFAULT_MATCH, Match, type MatchConfig } from './game/match';
import { canPlaceCueBall, numberedOnTable, pocketName, theD, type ShotDeclaration } from '@cuesports/rules';

// ---------------------------------------------------------------------------------------------
// Renderer and scene

function loadTierChoice(): TierChoice {
  try {
    const v = (JSON.parse(localStorage.getItem('cuesports.settings') ?? '{}') as { graphics?: TierChoice })
      .graphics;
    return v ?? 'auto';
  } catch {
    return 'auto';
  }
}

const app = document.getElementById('app')!;
const tierChoice = loadTierChoice();
const tier = resolveTier(tierChoice);
const tierParams = TIERS[tier];
document.documentElement.dataset.tier = tier;
const renderer = new WebGLRenderer({ antialias: tierParams.antialias, powerPreference: 'high-performance' });
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
scene.environmentIntensity = tierParams.reflections;
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
ballsView.segments = tierParams.ballSegments;
const cueView = new CueView();
const guideView = new GuideView();
world.add(ballsView.group, cueView.group, guideView.group);

let game: GameDef = GAMES[0]!;
let tableView: TableView | null = null;
let clothSpeed: ClothSpeed = loadClothSpeed();
/** The player's own look, cue and cloth colours (the customiser). */
let profile: Profile = loadProfile();
/** The customiser is open: player 1 stands on a turntable behind it. */
let previewing = false;
/** Accessibility: vibrate on strikes and pots; reduce camera motion. */
let haptics = true;
let calm = false;
cueView.setStyle(profile.cue);
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
let last: { before: BallState[]; shot: ShotInput; result: ShotResult; shooter: number } | null = null;
/** During a replay, the player who played the shot (they take it again at the table). */
let replayShooter: number | null = null;
/** A replay shows the player down on the shot for this long before the stroke. */
const REPLAY_PREROLL = 0.9;
let showGuide = true;
/** The guide follows the cue ball's real launch direction, including squirt from side. */
let guideSquirt = true;
let shotCamMode: ShotCameraMode = 'cinematic';
let shotCam: ShotCamera | null = null;
let showPlayer = true;
/** The two players (placeholder characters); [0] plays practice. */
let players: Character[] = [];
/** The stance of the last shot, so the player stays down through the follow-through. */
let lastStance: StanceInput | null = null;
let placing = false;
let dirty = true;
/** The 9-ball match being played, or null in practice. */
let match: Match | null = null;
let decl: ShotDeclaration = {};
const aiClient = new AiClient();
/** The computer is thinking or playing its shot. */
let aiBusy = false;
/** Bumped whenever the table is reset, so a computer turn from before can't act afterwards. */
let aiTurnId = 0;
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
/** Saved shots being watched (from the Replays screen or "Watch again"), or null. */
let viewer: { reel: Reel; i: number; auto: boolean } | null = null;
/** Saved matches and highlights. */
const store = openStore();
/** Playback frozen at a fixed time (test hook). */
let frozen = false;

const rig = new CameraRig(canvas, game.table);

/** The ball the player at the table strikes ('cue', or in billiards 'spot' for player 2). */
let cueId = 'cue';
const cueBall = (): BallState | undefined => balls.find((b) => b.id === cueId);

/**
 * Drops anything left over from the last table: a computer turn still thinking or waiting to
 * strike, a replay, the busy HUD. Without this, leaving a match mid-way through the computer's turn
 * left the controls disabled in the next one.
 */
function resetTurnState(): void {
  aiTurnId++;
  aiBusy = false;
  replaying = false;
  replayShooter = null;
  pending = null;
  playing = null;
  rig.shotView = null;
  shotCam = null;
  hud.setBusy(false);
}

function setGame(def: GameDef): void {
  resetTurnState();
  match = null;
  cueId = 'cue';
  shot.ball = 'cue';
  endChallenge();
  viewer = null;
  replayBar.show(null);
  app.classList.remove('viewing');
  matchHud.showBoard(null);
  matchHud.setPushAvailable(false);
  matchHud.showDecision(null);
  matchHud.showResult(null);
  // Practice has no calls or nominations: clear any chip left over from a match.
  matchHud.showCall(null, false, (p) => p, false);
  setTable(def);
  rerack();
  sound.setAmbience(roomFor(null));
}

function setTable(def: GameDef): void {
  game = def;
  simTable = withClothSpeed(def.table, clothSpeed);
  if (tableView) {
    world.remove(tableView.group);
    tableView.dispose();
  }
  tableView = buildTableView(def.table, scene.environment, clothFor(def.table));
  world.add(tableView.group);
  ballsView.setPockets(
    tableView.pocketRest,
    WELL_DEPTH,
    new Map(def.table.pockets.map((p) => [p.id, dropOutline(tableGeometry(def.table), p.id)])),
    tableView.pocketRunners,
  );
  placeCanopy(def.table.playfield.length);
  rig.setTable(def.table);
  buildPlayers();
}

function buildPlayers(): void {
  if (!tableView) return;
  for (const p of players) {
    world.remove(p.group, p.chair);
    p.dispose();
  }
  const t: TableFrame = {
    hl: game.table.playfield.length / 2,
    hw: game.table.playfield.width / 2,
    hx: tableView.outer.hx,
    hy: tableView.outer.hy,
    railTop: tableView.railTop,
    floorZ: tableView.floorZ,
    // How far past the rail a player stretches by hand: a snooker player can bridge at the centre
    // line playing across the table; up the length, it's the rest.
    restReach: game.table.id.startsWith('snooker') ? 0.85 : 0.8,
  };
  const names = viewer?.reel.players ?? (match ? match.config.players : [profile.name, 'Player 2']);
  const picks = presetsFor(names);
  // A career opponent has a look of their own.
  const look = match?.config.aiLook;
  if (look !== undefined && look !== picks[0]) picks[1] = look;
  // Seat 1 is whoever holds the device: their own look and cue (unless watching someone else's).
  const mine = (i: number) => i === 0 && (!viewer || names[0] === profile.name);
  players = picks.map((pi, i) => {
    const c = mine(i)
      ? new Character(lookFor(profilePreset(profile), game.table.id), profile.cue)
      : new Character(lookFor(PRESETS[pi]!, game.table.id));
    // Chairs along one long side, facing the table.
    c.setTable(t, { x: (i === 0 ? -1 : 1) * t.hl * 0.55, y: -(t.hy + 1.15) }, Math.PI / 2);
    world.add(c.group, c.chair);
    return c;
  });
  lastStance = null;
}

/** The player at the table now. */
const activePlayer = (): number => replayShooter ?? (match ? match.turn.player : 0);

/** What each player should be doing this frame. */
function playerWants(i: number, cue: BallState | undefined, gap: number): Want {
  if (i !== activePlayer()) return { kind: 'sit' };
  if (!cue || cue.state === 'pocketed') return { kind: 'watch' };
  // Watch from beside the cue ball.
  const near = { kind: 'watch' as const, at: { ...cue.pos } };
  if (phase === 'playing') {
    // Stay down through the follow-through, then stand and watch.
    if (lastStance && playT < 0.8) return { kind: 'shoot', stance: { ...lastStance, gap: -0.06 } };
    return { kind: 'watch' };
  }
  if (placing || (match && (match.turn.decision || match.rackResult))) return near;
  const stance: StanceInput = {
    ball: cue.pos,
    R: cue.radius,
    shot: phase === 'aim' ? withClearance(shot) : shot,
    gap,
    others: balls.filter((b) => b.id !== cue.id && b.state !== 'pocketed').map((b) => b.pos),
  };
  lastStance = stance;
  return { kind: 'shoot', stance };
}

// ---------------------------------------------------------------------------------------------
// Match play

function startMatch(config: MatchConfig): void {
  resetTurnState();
  endChallenge();
  setTable(GAMES.find((g) => g.id === config.game) ?? GAMES[0]!);
  viewer = null;
  replayBar.show(null);
  app.classList.remove('viewing');
  match = new Match(config, (Math.random() * 1e9) | 0, clothSpeed);
  sound.setAmbience(roomFor(config));
  // Each player gets their own look, chosen from their name.
  buildPlayers();
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
  placePlayers();
}

/** Updates the HUD and controls for whoever is at the table now. */
function syncTurn(): void {
  if (!match) return;
  const t = match.turn;
  cueId = t.cueBall ?? 'cue';
  shot.ball = cueId;
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
  // A ball off the table (billiards: in hand after an in-off, or not yet in play) comes back in the D.
  const inHand = cueBall();
  if (placing && inHand?.state === 'pocketed') {
    const d = theD(match.table);
    if (d) cueStart = { x: d.centre.x - 0.02, y: 0 };
    respawnCue(inHand);
    ballsView.showState(balls);
    aimAtFirstBall();
  }
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
  if (match.rackResult && match.config.drill) showDrillResult(match);
  else if (match.rackResult) {
    const w = match.config.players[match.rackResult.winner]!;
    const score = `${match.config.players[0]} ${match.score[0]} – ${match.score[1]} ${match.config.players[1]}`;
    if (match.winner !== null && match.config.career) careerResult(match, w, score);
    else if (match.winner !== null)
      matchHud.showResult(
        `${w} wins the match`,
        `${score}. ${matchSummary(match)}`,
        true,
        'New match',
        'Rematch',
      );
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
  placePlayers();
  rig.snap();
  status();
  dirty = true;
}

/** Puts both players straight into place (new rack or table), without walking. */
function placePlayers(): void {
  const cue = cueBall();
  players.forEach((p, i) => p.place(i === 0 || match ? playerWants(i, cue, 0.015) : { kind: 'sit' }));
}

function aimAtFirstBall(): void {
  const cue = cueBall();
  const target = balls.find((b) => b.id !== cueId && b.state !== 'pocketed');
  if (cue && target) shot.aim = Math.atan2(target.pos.y - cue.pos.y, target.pos.x - cue.pos.x);
}

function status(extra = ''): void {
  hud.setStatus(extra ? `${game.label} · ${extra}` : game.label);
}

// ---------------------------------------------------------------------------------------------
// Shooting

function shoot(p: number): void {
  if (phase !== 'aim' || aiTurn() || viewer || challenge?.sheet) return;
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
  const shooter = activePlayer();
  void sim.run(simTable, before, s).then((r) => {
    pending = r;
    last = { before, shot: s, result: r.result, shooter };
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
  shotCues = cuesFor(playing.events);
  // Just before the strike (t = 0), so it is due on the first frame and isn't taken for a jump.
  heardTo = -1e-3;
  phase = 'playing';
  cueView.group.visible = false;
  // Reduced motion: the camera stays where it is, replays included.
  const camMode: ShotCameraMode = calm ? 'stay' : replaying ? 'cinematic' : shotCamMode;
  rig.overview = camMode === 'overview' && rig.mode === 'aim';
  shotCam = rig.mode === 'aim' ? new ShotCamera(playing, game.table, camMode, shot.aim) : null;
  if (haptics) navigator.vibrate?.(12);
}

/** A potted ball takes this long to drop and settle in the pocket. */
const POT_SETTLE = 0.8;

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
  const wasReplay = replaying;
  if (replaying || match) {
    if (match && !replaying && last) {
      match.judge(decl, last.before, result, last.shot);
      saveMatch();
    }
    replaying = false;
    replayShooter = null;
    balls = match ? match.balls.map(cloneBall) : result.final.map(cloneBall);
    if (match?.reracked) ballsView.setBalls(balls);
    else {
      ballsView.commit(result);
      ballsView.showState(balls);
    }
    playing = null;
    phase = 'aim';
    rig.overview = false;
    rig.shotView = null;
    shotCam = null;
    cueView.group.visible = true;
    hud.setBusy(false);
    if (match) syncTurn();
    if (viewer) afterViewedShot();
    // A challenge's result sheet comes back after watching the shot again.
    if (wasReplay && challenge?.sheet) challenge.sheet();
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
  // In a challenge a scratch ends the attempt; the table is set up again instead.
  if (cue && cue.state === 'pocketed' && !challenge && !tutorial) respawnCue(cue);
  ballsView.showState(balls);
  playing = null;
  phase = 'aim';
  rig.overview = false;
  rig.shotView = null;
  shotCam = null;
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
  if (challenge) challengeShot(result);
  teach({ type: 'settled', potted: potted.includes('1') });
  dirty = true;
}

/** Lets the computer take its turn: answer a decision, or think, place the cue ball and play. */
function maybeAiTurn(): void {
  if (!match || aiBusy || phase !== 'aim' || !aiTurn()) return;
  const m = match;
  const t = m.turn;
  const id = ++aiTurnId;
  // The table was reset (new match, practice, home) since this turn began.
  const stale = () => id !== aiTurnId || match !== m;
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
    attack: m.config.aiAttack ?? 0,
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
      if (stale()) return;
      aiBusy = false;
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
    if (stale()) return;
    if (phase !== 'aim') {
      aiBusy = false;
      hud.setBusy(false);
      return;
    }
    // Show the decision for a moment: place the cue ball, line up, then strike.
    const wait = Math.max(0, 700 - (performance.now() - started));
    window.setTimeout(() => {
      if (stale()) return;
      if (ai.place) placeCue(ai.place, true);
      shot = { ...ai.shot };
      hud.showSpin(ai.shot.tip, (ai.shot.elevation * 180) / Math.PI);
      rig.followAimInstantly();
      status(`${m.config.players[t.player]}: ${ai.label}`);
      dirty = true;
      // Strike once the player has walked round and got down on the shot.
      const started = performance.now();
      const go = () => {
        if (stale()) return;
        const p = players[t.player];
        if (p && showPlayer && (p.busy || !p.isDown) && performance.now() - started < 4000) {
          window.setTimeout(go, 100);
          return;
        }
        aiBusy = false;
        strike(ai.shot, ai.decl, 0.5);
      };
      window.setTimeout(go, 900);
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
  if (viewer) {
    viewShot(viewer.i, true);
    return;
  }
  if (!last || phase !== 'aim') return;
  balls = last.before.map(cloneBall);
  ballsView.showState(balls);
  shot = structuredClone(last.shot);
  pending = { result: last.result, ms: 0 };
  replaying = true;
  hud.setBusy(true);
  // The shooter takes the shot again: down on it for a moment, then the stroke.
  replayShooter = last.shooter;
  phase = 'striking';
  strikeT = -REPLAY_PREROLL;
  pull = 0.5;
  cueView.group.visible = true;
  placePlayers();
  dirty = true;
}

function undo(): void {
  if (viewer) return;
  if (challenge) {
    matchHud.say('No undo in a challenge: that would be too easy.');
    return;
  }
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
    teach({ type: 'camera' });
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
    teach({ type: 'aim', amount: dx * 0.00012 });
    rig.followAimInstantly();
    dirty = true;
  },
  onTip: (a, b) => {
    shot.tip = { a, b };
    if (a || b) teach({ type: 'spin' });
    dirty = true;
  },
  onElevation: (deg) => {
    shot.elevation = (deg * Math.PI) / 180;
    dirty = true;
  },
  onPlaceToggle: (on) => {
    if (challenge) {
      hud.setPlacing(false);
      matchHud.say('The balls stay where they are in a challenge.');
      return;
    }
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
    menu.open('pause', { inMatch: match !== null, canSave: last !== null && !viewer });
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
  onNewMatch: () => {
    if (match?.config.career) menu.open('event');
    else if (challenge) startChallenge(challenge.next ?? challenge.spec);
    else if (match?.config.drill) startMatch(match.config);
    else menu.open('play');
  },
  onAlt: () => {
    if (challenge) startChallenge(challenge.spec);
    else if (match) startMatch(match.config);
  },
  onWatch: () => {
    if (challenge) {
      matchHud.showResult(null);
      replay();
      return;
    }
    if (!match) return;
    // The match is kept as it was saved: watching leaves it.
    saveMatch();
    watch(reelOfRack(match.record, match.rack - 1), true);
  },
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
      saveMatch();
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
      else if (name === 'labels') ballsView.setLabels(on);
      else if (name === 'haptics') haptics = on;
      else if (name === 'calm') calm = on;
      else showPlayer = on;
      dirty = true;
    },
    onShotCamera: (mode) => (shotCamMode = mode),
    onDrill: (id) => startDrill(id),
    profile: () => profile,
    onProfile: (p) => applyProfile(p),
    onPreview: (on) => setPreview(on),
    sound: () => loadSound(),
    onSound: (s) => {
      sound.set(s);
      try {
        localStorage.setItem(SOUND_KEY, JSON.stringify(s));
      } catch {
        // Not kept; fine for this session.
      }
    },
    career: () => career,
    onCareerEnter: (id) => {
      const e = careerEvent(id);
      if (!e) return;
      career = { ...career, run: enter(e, (Math.random() * 1e9) | 0) };
      saveCareer(career);
    },
    onCareerPlay: () => startCareerMatch(),
    onTutorial: () => startTutorial(),
    onChallenge: (id) => {
      const spec = CHALLENGES.find((c) => c.id === id);
      if (spec) startChallenge(spec);
    },
    saved: async () => {
      const st = await store;
      const [matches, highlights] = await Promise.all([st.matches(), st.highlights()]);
      return { matches, highlights };
    },
    onWatch: (reel) => watch(reel),
    onDeleteHighlight: async (id) => (await store).deleteHighlight(id),
    onSaveHighlight: saveHighlight,
    onStroke: (mode) => hud.setStrokeMode(mode),
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
        rig.orbit.autoRotate = !calm;
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
shotCamMode = menu.settings.shotCam;
showPlayer = menu.settings.player;
ballsView.setLabels(menu.settings.labels);
haptics = menu.settings.haptics;
calm = menu.settings.calm;
hud.setStrokeMode(menu.settings.stroke);
app.append(menu.root);

// ---------------------------------------------------------------------------------------------
// The player's profile (customiser)

/** Cloth colour for a table, from the profile. */
function clothFor(t: TableSpec): string {
  // Carom tables: the classic tournament blue.
  if (t.pockets.length === 0) return '#2b5fa6';
  return t.id.startsWith('snooker')
    ? profile.cloth.snooker
    : t.id.startsWith('english')
      ? profile.cloth.english
      : profile.cloth.pool;
}

/** Where player 1 stands for the customiser: just past the bottom end, under the table lights. */
function previewSpot(): { x: number; y: number } {
  return { x: -(game.table.playfield.length / 2 + 0.5), y: 0 };
}

function aimPreview(): void {
  const s = previewSpot();
  rig.setMode('free');
  rig.orbit.target.copy(toWorld(s.x, s.y, 0.95));
  // Further back on a phone: the whole figure has to fit above the panel.
  const k = app.clientWidth > 520 ? 1 : 1.45;
  rig.persp.position.copy(toWorld(s.x + 3.0 * k, s.y - 1.2 * k, 1.35));
  rig.orbit.enabled = false;
  rig.orbit.autoRotate = !calm;
  rig.orbit.autoRotateSpeed = 1.6;
  framePreview();
}

/**
 * Shifts the picture so the player sits in the space the customiser leaves: to the right of the
 * panel on a wide screen, above it on a phone.
 */
function framePreview(): void {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (!previewing) {
    rig.persp.clearViewOffset();
    return;
  }
  const panel = menu.root.querySelector('.sub')?.getBoundingClientRect();
  if (!panel) return;
  if (w > 520) {
    // The middle of the space right of the panel, compared with the middle of the screen.
    const dx = (panel.right + w) / 2 - w / 2;
    rig.persp.setViewOffset(w, h, -dx, 0, w, h);
  } else {
    const dy = panel.top / 2 - h / 2;
    rig.persp.setViewOffset(w, h, 0, -dy, w, h);
  }
}

function setPreview(on: boolean): void {
  if (previewing === on) return;
  previewing = on;
  if (on) {
    players[0]?.place({ kind: 'watch', at: previewSpot() });
    // After the panel is laid out, so the picture can be framed beside it.
    requestAnimationFrame(aimPreview);
  } else {
    framePreview();
    // Back to the slow orbit round the table behind the menus.
    const L = game.table.playfield.length;
    rig.persp.position.set(L * 0.55, L * 0.42, L * 0.55);
    rig.orbit.target.set(0, 0, 0);
    rig.orbit.autoRotateSpeed = 0.35;
    placePlayers();
  }
  dirty = true;
}

/** A change from the customiser: save it and show it straight away. */
function applyProfile(p: Profile): void {
  const before = clothFor(game.table);
  profile = p;
  const clothChanged = clothFor(game.table) !== before;
  saveProfile(p);
  cueView.setStyle(p.cue);
  if (clothChanged) setTable(game);
  else buildPlayers();
  if (previewing) players[0]?.place({ kind: 'watch', at: previewSpot() });
  ballsView.showState(balls);
  dirty = true;
}

// ---------------------------------------------------------------------------------------------
// Sound

const SOUND_KEY = 'cuesports.sound';
const sound = new Sound(loadSound());
/** The shot's sounds, and how far into it they have been played. */
let shotCues: SoundCue[] = [];
let heardTo = 0;

function loadSound(): SoundSettings {
  try {
    return {
      ...DEFAULT_SOUND,
      ...(JSON.parse(localStorage.getItem(SOUND_KEY) ?? '{}') as Partial<SoundSettings>),
    };
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

// Browsers only start audio from a gesture: the first touch, click or key.
for (const type of ['pointerdown', 'keydown'] as const)
  window.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });

/** The room tone: the career venue's, or a quiet club. */
function roomFor(config: MatchConfig | null): AmbienceKind {
  const e = config?.career && careerEvent(config.career.event);
  const kind = e && VENUES.find((v) => v.id === e.venue)?.kind;
  return kind ? (kind.toLowerCase() as AmbienceKind) : 'club';
}

// ---------------------------------------------------------------------------------------------
// Career

let career: CareerState = loadCareer();
/** Matches whose result has gone into the career already (a result sheet can be shown twice). */
const careerRecorded = new WeakSet<Match>();

function startCareerMatch(): void {
  const run = career.run;
  const e = run && careerEvent(run.event);
  const opp = run && nextOpponent(run);
  if (!run || !e || !opp) return;
  const o = opponent(opp.id);
  startMatch({
    ...DEFAULT_MATCH,
    game: e.game,
    players: [profile.name, o.name],
    raceTo: e.raceTo[run.round] ?? 3,
    breaks: 'alternate',
    snooker: { ...DEFAULT_MATCH.snooker, reds: e.reds ?? 15 },
    ai: opp.level,
    aiAttack: o.attack,
    aiLook: o.look,
    career: { event: e.id, round: run.round },
  });
}

/** Each player's match in a line: pots, best break (or run) and fouls, from the match record. */
function matchSummary(m: Match): string {
  const word = visitWord(m.config.game);
  return m.config.players
    .map((name, seat) => {
      const s = emptyStats();
      addMatch(s, m.record, seat);
      return `${name}: pots ${percent(s.pots, s.potAttempts)}, best ${word} ${s.highestBreak}, fouls ${s.fouls}`;
    })
    .join(' · ');
}

/** The end of a career match: into the bracket, then on to the next round (or out). */
function careerResult(m: Match, winner: string, score: string): void {
  const c = m.config.career!;
  const e = careerEvent(c.event)!;
  const won = m.winner === 0;
  if (!careerRecorded.has(m) && career.run?.event === c.event && career.run.round === c.round) {
    careerRecorded.add(m);
    career = recordMatch(career, won, (Math.random() * 1e9) | 0);
    saveCareer(career);
  }
  const champion = won && career.run?.status === 'won';
  const title = champion
    ? `Champion of the ${e.title}!`
    : won
      ? `Through to the ${roundName(e, c.round + 1).toLowerCase()}`
      : `${winner} wins the ${roundName(e, c.round).toLowerCase()}`;
  const prize = champion ? ` Unlocked: ${REWARDS[e.reward] ?? ''}.` : '';
  matchHud.showResult(title, `${score}.${prize} ${matchSummary(m)}`, true, 'Continue');
}

// ---------------------------------------------------------------------------------------------
// Challenges

/** The challenge being played: its spec, the run so far, and (once over) its result sheet. */
let challenge: {
  spec: ChallengeSpec;
  run: ChallengeRun;
  next: ChallengeSpec | null;
  sheet: (() => void) | null;
} | null = null;

/** The target for a position challenge: three rings, for three, two and one stars. */
const targetRings = new Group();
targetRings.visible = false;
targetRings.renderOrder = 3;
world.add(targetRings);

function showTarget(t: ChallengeSpec['target']): void {
  targetRings.clear();
  targetRings.visible = !!t;
  if (!t) return;
  const colours = ['#ffd84a', '#ffffff', '#ffffff'];
  t.r.forEach((r, i) => {
    const ring = new Mesh(
      new RingGeometry(Math.max(0, r - 0.006), r, 64),
      new MeshBasicMaterial({
        color: colours[i] ?? '#ffffff',
        transparent: true,
        opacity: i === 0 ? 0.9 : 0.45 - i * 0.1,
        depthWrite: false,
      }),
    );
    targetRings.add(ring);
  });
  targetRings.position.set(t.x, t.y, 0.0015);
}

function startChallenge(spec: ChallengeSpec): void {
  setGame(GAMES.find((g) => g.id === spec.table) ?? GAMES[0]!);
  const i = CHALLENGES.indexOf(spec);
  challenge = { spec, run: newRun(), next: CHALLENGES[i + 1] ?? null, sheet: null };
  setupChallengeTable();
  matchHud.say(spec.goal, 5000);
}

/** Puts the balls back where the challenge starts (a new attempt). */
function setupChallengeTable(): void {
  if (!challenge) return;
  const { spec, run } = challenge;
  const t = game.table;
  const specs = Object.fromEntries(
    spec.balls.map(([id]) => {
      const b = id === 'cue' ? t.balls.cue : t.balls.object;
      return [id, [b.radius, b.mass] as [number, number]];
    }),
  );
  balls = expandBalls(spec.balls, specs);
  cueStart = { ...cueBall()!.pos };
  ballsView.setBalls(balls);
  last = null;
  phase = 'aim';
  aimAtFirstBall();
  placePlayers();
  showTarget(spec.target);
  rig.snap();
  status(challengeStatus(spec, run));
  dirty = true;
}

function challengeStatus(spec: ChallengeSpec, run: ChallengeRun): string {
  return spec.kind === 'clear'
    ? `${spec.title} · shot ${run.shots + 1} of ${spec.limit}`
    : `${spec.title} · attempt ${run.attempt} of ${spec.limit}`;
}

function challengeShot(result: ShotResult): void {
  if (!challenge) return;
  const c = challenge;
  const v = judgeChallenge(c.spec, c.run, result);
  if (v.status === 'continue') {
    status(challengeStatus(c.spec, c.run));
    matchHud.say(v.message);
    return;
  }
  if (v.status === 'retry') {
    matchHud.say(v.message, 2500);
    window.setTimeout(() => challenge === c && phase === 'aim' && setupChallengeTable(), 1200);
    return;
  }
  const won = v.status === 'won';
  status(`${c.spec.title} · ${won ? starText(v.stars) : 'not this time'}`);
  const better = won && recordStars(c.spec.id, v.stars);
  const best = loadStars()[c.spec.id] ?? 0;
  c.sheet = () =>
    matchHud.showResult(
      won ? `${starText(v.stars)}  ${c.spec.title}` : 'Not this time',
      `${v.message}${better ? ' A new best!' : best ? ` Best: ${starText(best)}` : ''}`,
      true,
      won && c.next ? 'Next challenge' : 'Retry',
      won && c.next ? 'Retry' : null,
    );
  c.sheet();
}

function endChallenge(): void {
  challenge = null;
  targetRings.visible = false;
  if (tutorial) {
    tutorial = null;
    coach.hide();
  }
}

// ---------------------------------------------------------------------------------------------
// The first-run tutorial: a straight-in pot on a pool table, with a card saying what to do next.

let tutorial: TutorialState | null = null;
const coach = new Coach({
  onSkip: () => {
    markTutorialSeen('skipped');
    endChallenge();
    matchHud.say('The tutorial is in How to play whenever you want it.', 3000);
  },
  onPractice: () => endChallenge(),
  onHome: () => {
    endChallenge();
    quitToHome();
    menu.open('home');
  },
});
app.append(coach.root);

function startTutorial(): void {
  setGame(GAMES.find((g) => g.id === 'nine-ball') ?? GAMES[0]!);
  tutorial = newTutorial();
  setupTutorialTable();
  coach.show(stepOf(tutorial), 0);
}

function setupTutorialTable(): void {
  const t = game.table;
  const specs = { cue: [t.balls.cue.radius, t.balls.cue.mass] as [number, number] };
  const layout = CHALLENGES.find((c) => c.id === 'straight-in')!.balls.filter(([id]) => id !== '2');
  balls = expandBalls(layout, {
    ...specs,
    '1': [t.balls.object.radius, t.balls.object.mass],
  });
  cueStart = { ...cueBall()!.pos };
  ballsView.setBalls(balls);
  last = null;
  phase = 'aim';
  aimAtFirstBall();
  // Start a little off line, so there is something to aim.
  shot.aim += 0.12;
  placePlayers();
  rig.snap();
  status('Tutorial');
  dirty = true;
}

/** Feeds what the player just did to the tutorial. */
function teach(e: TutorialEvent): void {
  if (!tutorial) return;
  const a = tutorialAdvance(tutorial, e);
  tutorial = a.state;
  if (a.say) matchHud.say(a.say, 2500);
  if (a.reset) {
    const t = tutorial;
    window.setTimeout(() => tutorial === t && phase === 'aim' && setupTutorialTable(), 1200);
  }
  if (a.next) {
    const step = stepOf(tutorial);
    if (step.id === 'done') markTutorialSeen('done');
    coach.show(step, tutorial.step);
  }
}

// ---------------------------------------------------------------------------------------------
// Practice drills

function startDrill(id: DrillId): void {
  const d = DRILLS[id];
  const name = menu.lastConfig.players[0] || 'Player 1';
  startMatch({
    ...DEFAULT_MATCH,
    game: d.game,
    raceTo: d.raceTo,
    players: [name, d.opponent],
    ai: null,
    drill: id,
  });
}

/** The end of a line-up, or of a rack or race against the ghost, with the personal best. */
function showDrillResult(m: Match): void {
  const id = m.config.drill!;
  if (id === 'lineup') {
    const pts = m.framePoints?.points[0] ?? 0;
    const cleared = m.rackResult?.winner === 0;
    const best = recordBest(id, pts);
    matchHud.showResult(
      cleared ? `Cleared the line-up: ${pts}` : `Break of ${pts}`,
      best ? 'A new best!' : bestLabel(id),
      true,
      'Go again',
    );
    return;
  }
  const [you, ghost] = m.score;
  if (m.winner === null) {
    const won = m.rackResult!.winner === 0;
    matchHud.showResult(
      won ? `${m.config.players[0]} wins rack ${m.rack}` : `The ghost wins rack ${m.rack}`,
      `${m.message} ${you}–${ghost}, race to ${m.config.raceTo}.`,
    );
    return;
  }
  const best = recordBest(id, you);
  matchHud.showResult(
    m.winner === 0 ? `You beat the ghost ${you}–${ghost}` : `The ghost wins ${ghost}–${you}`,
    best ? 'A new best!' : bestLabel(id),
    true,
    'Go again',
  );
}

// ---------------------------------------------------------------------------------------------
// Saved matches, highlights and watching them

function saveMatch(): void {
  if (!match) return;
  const record = structuredClone(match.record);
  void store.then((st) => st.putMatch(record)).catch(() => undefined);
}

/** Keeps the last shot played as a highlight. */
function saveHighlight(): void {
  if (!last) return;
  const fromMatch = match?.rackRecord?.shots.at(-1);
  const potted = last.result.events.flatMap((e) =>
    e.type === 'pocket' && e.ball !== last!.shot.ball ? [e.ball] : [],
  );
  const rec: ShotRecord = fromMatch ?? {
    player: 0,
    before: compactBalls(last.before),
    shot: structuredClone(last.shot),
    decl: {},
    firstHit: firstContact(last.result, last.shot.ball),
    potted,
    fouls: [],
    scored: potted.length,
    isBreak: false,
  };
  const players: [string, string] = match ? [...match.config.players] : ['Player 1', 'Player 2'];
  const what = rec.potted.length ? `potted ${ballsLabel(rec.potted)}` : 'a shot';
  const date = Date.now();
  const h: Highlight = {
    id: recordId(date),
    date,
    title: `${players[rec.player]}: ${what} (${game.label})`,
    game: match ? match.config.game : null,
    table: game.id,
    cloth: clothSpeed,
    players,
    specs: specsOf(last.before),
    shot: rec,
  };
  void store
    .then((st) => st.putHighlight(h))
    .then(
      () => (match ? matchHud.say('Shot saved to Replays.') : status('shot saved to Replays')),
      () => matchHud.say('The shot could not be saved.'),
    );
}

/** Leaves whatever is on the table and shows the saved shots, starting from the first. */
function watch(reel: Reel, fromMatch = false): void {
  if (!reel.shots.length) return;
  const def = GAMES.find((g) => g.id === reel.table) ?? GAMES[0]!;
  setGame(def);
  viewer = { reel, i: 0, auto: false };
  viewerFromMatch = fromMatch;
  simTable = withClothSpeed(def.table, reel.cloth);
  buildPlayers();
  app.classList.add('viewing');
  replayBar.show(reel.title);
  viewShot(0, false);
}
/** Watching was started from a finished rack, so closing goes home rather than to Replays. */
let viewerFromMatch = false;

function describeShot(s: ShotRecord, players: [string, string]): string {
  const who = players[s.player] ?? '';
  if (s.fouls.length) return `${who} · foul`;
  if (s.potted.length) return `${who} · potted ${ballsLabel(s.potted)}`;
  return `${who}${s.isBreak ? ' · break' : ''}`;
}

/** Sets up saved shot i, and plays it if asked. */
function viewShot(i: number, play: boolean): void {
  if (!viewer || phase !== 'aim') return;
  const s = viewer.reel.shots[i];
  if (!s) return;
  viewer.i = i;
  balls = expandBalls(s.before, viewer.reel.specs);
  ballsView.setBalls(balls);
  shot = structuredClone(s.shot);
  replayShooter = s.player;
  last = null;
  placePlayers();
  rig.snap();
  replayBar.setShot(i, viewer.reel.shots.length, describeShot(s, viewer.reel.players), play);
  dirty = true;
  if (!play) return;
  const v = viewer;
  replaying = true;
  pending = null;
  hud.setBusy(true);
  phase = 'striking';
  strikeT = -REPLAY_PREROLL;
  pull = 0.5;
  cueView.group.visible = true;
  void sim.run(simTable, balls.map(cloneBall), structuredClone(s.shot)).then((r) => {
    if (viewer === v) pending = r;
  });
}

function afterViewedShot(): void {
  if (!viewer) return;
  const v = viewer;
  const s = v.reel.shots[v.i]!;
  replayShooter = s.player;
  const more = v.i < v.reel.shots.length - 1;
  replayBar.setShot(v.i, v.reel.shots.length, describeShot(s, v.reel.players), false);
  if (v.auto && more) window.setTimeout(() => viewer === v && viewShot(v.i + 1, true), 900);
  else if (v.auto) {
    v.auto = false;
    replayBar.setAuto(false);
  }
}

const replayBar = new ReplayBar({
  onStep: (d) => viewer && viewShot(viewer.i + d, false),
  onPlay: () => viewer && viewShot(viewer.i, true),
  onAuto: (on) => {
    if (!viewer) return;
    viewer.auto = on;
    // From the last shot, play all starts again at the first.
    if (on && phase === 'aim') viewShot(viewer.i >= viewer.reel.shots.length - 1 ? 0 : viewer.i, true);
  },
  onClose: () => {
    const home = viewerFromMatch;
    quitToHome();
    menu.open(home ? 'home' : 'replays');
  },
});
app.append(replayBar.root);

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
  const before = shot.aim;
  shot.aim = Math.atan2(p.y - cue.pos.y, p.x - cue.pos.x);
  const turn = Math.atan2(Math.sin(shot.aim - before), Math.cos(shot.aim - before));
  teach({ type: 'aim', amount: turn });
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
    } else if (p && placing && !match) arrangeAt(p);
    else if (p && placing) placeCue(p);
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
    if (p && grabbed) moveBall(grabbed, p);
    else if (p && !removing) placeCue(p);
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
    teach({ type: 'aim', amount: dx * 0.0035 * gain });
    rig.followAimInstantly();
  }
  dirty = true;
});

const endPointer = (e: PointerEvent): void => {
  pointers.delete(e.pointerId);
  grabbed = null;
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

// ---------------------------------------------------------------------------------------------
// Practice: arranging the balls

/** The ball being dragged while arranging. */
let grabbed: string | null = null;
/** Arranging: taps take balls off the table. */
let removing = false;

/** Whether ball `id` fits at p: on the cloth and clear of every other ball. */
function fits(id: string, p: { x: number; y: number }): boolean {
  const b = balls.find((x) => x.id === id);
  if (!b) return false;
  const hl = game.table.playfield.length / 2 - b.radius;
  const hw = game.table.playfield.width / 2 - b.radius;
  if (Math.abs(p.x) > hl || Math.abs(p.y) > hw) return false;
  return balls.every(
    (o) =>
      o === b || o.state === 'pocketed' || Math.hypot(o.pos.x - p.x, o.pos.y - p.y) >= o.radius + b.radius,
  );
}

function ballAtPoint(p: { x: number; y: number }): BallState | undefined {
  let best: BallState | undefined;
  let d = Infinity;
  for (const b of balls) {
    if (b.state === 'pocketed') continue;
    const e = Math.hypot(b.pos.x - p.x, b.pos.y - p.y);
    if (e < b.radius * 1.8 && e < d) [best, d] = [b, e];
  }
  return best;
}

/** A tap while arranging: take a ball off, pick one up, or move the cue ball here. */
function arrangeAt(p: { x: number; y: number }): void {
  const b = ballAtPoint(p);
  if (removing) {
    if (b && b.id !== 'cue') {
      b.state = 'pocketed';
      delete b.pocket;
      tableEdited();
    }
    return;
  }
  grabbed = b?.id ?? 'cue';
  if (!b) moveBall('cue', p);
}

function moveBall(id: string, p: { x: number; y: number }): void {
  const b = balls.find((x) => x.id === id);
  if (!b || !fits(id, p)) return;
  b.pos = { ...p };
  b.state = 'stationary';
  delete b.pocket;
  tableEdited();
}

/** Nearest free point to p, searching outwards (null if the table is somehow full there). */
function freeNear(id: string, p: { x: number; y: number }): { x: number; y: number } | null {
  const step = (balls.find((b) => b.id === id)?.radius ?? 0.028) * 0.5;
  for (let r = 0; r < 120; r++)
    for (let k = 0; k < Math.max(1, r * 6); k++) {
      const a = (k / Math.max(1, r * 6)) * Math.PI * 2;
      const q = { x: p.x + Math.cos(a) * r * step, y: p.y + Math.sin(a) * r * step };
      if (fits(id, q)) return q;
    }
  return null;
}

/** Puts potted balls back, each as close to its place in the rack (or its spot) as it fits. */
function spotPotted(): void {
  const home = new Map(layout(game.table, game.layout, 1).map((b) => [b.id, b.pos]));
  for (const b of balls) {
    if (b.state !== 'pocketed') continue;
    const q = freeNear(b.id, home.get(b.id) ?? { x: game.table.playfield.length / 4, y: 0 });
    if (!q) continue;
    b.pos = q;
    b.state = 'stationary';
    delete b.pocket;
  }
  tableEdited();
}

function clearTable(): void {
  for (const b of balls)
    if (b.id !== 'cue') {
      b.state = 'pocketed';
      delete b.pocket;
    }
  tableEdited();
}

function tableEdited(): void {
  // The last shot no longer matches the table, so it can't be undone onto it.
  last = null;
  ballsView.showState(balls);
  dirty = true;
}

function stopArranging(): void {
  placing = false;
  removing = false;
  hud.setPlacing(false);
  dirty = true;
}

const editorBar = new EditorBar({
  onRemove: (on) => (removing = on),
  onSpot: spotPotted,
  onClear: clearTable,
  onDone: stopArranging,
  // The challenge level editor: arrange the table, then paste this into a ChallengeSpec.
  onCopy: import.meta.env.DEV || new URLSearchParams(location.search).has('debug') ? copyLayout : undefined,
});

function copyLayout(): void {
  const text = JSON.stringify({
    table: game.id,
    balls: compactBalls(balls)
      .filter((b) => b.length === 3)
      .map(([id, x, y]) => [id, Math.round(x! * 1e4) / 1e4, Math.round(y! * 1e4) / 1e4]),
  });
  console.info('Challenge layout:', text);
  void navigator.clipboard?.writeText(text).then(
    () => status('layout copied'),
    () => status('layout in the console'),
  );
}
app.append(editorBar.root);

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

let pixelRatio = Math.min(window.devicePixelRatio || 1, tierParams.maxRatio);
const maxRatio = pixelRatio;
let slowFrames = 0;
let fastFrames = 0;

function resize(): void {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h);
  rig.resize(w / h);
  framePreview();
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
    else if (replaying && strikeT < 0 && cue) {
      // Replay: side-on to the player down on the shot.
      const c = Math.cos(shot.aim);
      const sn = Math.sin(shot.aim);
      rig.shotView = {
        eye: { x: cue.pos.x - sn * 1.5 - c * 0.5, y: cue.pos.y + c * 1.5 - sn * 0.5, z: 0.75 },
        look: { x: cue.pos.x - c * 0.55, y: cue.pos.y - sn * 0.55, z: 0.05 },
        cut: strikeT + dt <= -REPLAY_PREROLL + 1e-6,
      };
    }
  }
  if (phase === 'playing' && playing) {
    if (!frozen) playT += dt;
    // The sounds of the shot as playback passes them (a fast-forward skips them).
    if (playT - heardTo < 0.25)
      for (const c of due(shotCues, heardTo, playT)) {
        sound.play(c);
        // A short buzz as a ball drops.
        if (c.kind === 'drop' && haptics) navigator.vibrate?.(18);
      }
    heardTo = playT;
    // The drop animation keeps running after the simulation ends.
    ballsView.showFrame(playing, playT);
    if (playT >= playbackEnd(playing)) endPlayback();
    dirty = true;
  }

  editorBar.show(placing && !match && !viewer && phase === 'aim' && !menu.isOpen);
  if (!placing) removing = false;
  if (menu.isOpen) dirty = true;
  if (cue) {
    // While aiming the camera rides just above the cue when it is raised (chin on the cue).
    const cueElevation =
      phase === 'aim' ? withClearance(shot).elevation : phase === 'striking' ? shot.elevation : 0;
    const moving = rig.update(dt, cue.pos, cue.radius, shot.aim, cueElevation);
    if (moving) dirty = true;
    if (phase === 'playing' && shotCam) rig.shotView = shotCam.view(playT);
    if (phase !== 'playing') {
      // The cue draws back as the power bar is pulled, then drives through during the strike.
      const back = 0.015 + pull * 0.22;
      const gap = phase === 'striking' ? Math.max(0, back * (1 - (Math.max(0, strikeT) / 0.09) ** 2)) : back;
      const live = phase === 'aim' ? withClearance(shot) : shot;
      cueView.pose(cue.pos.x, cue.pos.y, cue.radius, live, gap);
      if (phase === 'aim') hud.setForcedElevation((live.elevation * 180) / Math.PI);
    }
  }
  updatePlayers(dt, cue);
  const guide =
    phase === 'aim' && cue
      ? computeGuide(game.table, balls, cueId, guideSquirt ? launchDirection(cue, shot) : shot.aim)
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

function updatePlayers(dt: number, cue: BallState | undefined): void {
  if (previewing) {
    // The customiser: player 1 stands for inspection, everyone else sits.
    players.forEach((p, i) => {
      p.chair.visible = false;
      if (p.update(dt, i === 0 ? { kind: 'watch', at: previewSpot() } : { kind: 'sit' })) dirty = true;
      p.group.visible = i === 0;
    });
    cueView.group.visible = false;
    return;
  }
  const back = 0.015 + pull * 0.22;
  const gap = phase === 'striking' ? Math.max(0, back * (1 - (Math.max(0, strikeT) / 0.09) ** 2)) : back;
  players.forEach((p, i) => {
    const inMatch = match !== null;
    // Practice has one player; the chairs come out for matches.
    p.chair.visible = inMatch;
    const here = i === 0 || inMatch;
    const want = playerWants(i, cue, gap);
    if (p.update(menu.isOpen ? 0 : dt, here ? want : { kind: 'sit' })) dirty = true;
    // The player at the table would block the aim cam while aiming: cue only.
    const blocks =
      i === activePlayer() && rig.mode === 'aim' && phase !== 'playing' && !menu.isOpen && !replaying;
    p.group.visible = showPlayer && here && !blocks;
  });
  // One cue: while the player is up and walking they carry their own; once down on the shot the
  // shot cue (which follows the aim and stroke exactly) takes over.
  const a = players[activePlayer()];
  if (phase !== 'playing') cueView.group.visible = !(a && a.group.visible && !a.isDown);
  players.forEach((p, i) => (p.ownCue = !(i === activePlayer() && p.isDown && cueView.group.visible)));
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

// Updates wait for the player (an automatic reload could land mid-frame); once everything is
// cached the home screen says the game works offline.
let offlineReady = false;
const updateSW = registerSW({
  immediate: true,
  onOfflineReady() {
    offlineReady = true;
    menu.setStatus({ offline: true });
  },
  onNeedRefresh() {
    menu.setStatus({ offline: offlineReady, update: () => void updateSW(true) });
  },
  onRegisteredSW(_url, reg) {
    // An installed copy that already works offline reports nothing new: say so from the cache.
    if (reg?.active && navigator.serviceWorker.controller) {
      offlineReady = true;
      menu.setStatus({ offline: true });
    }
    // Check for a new version now and then while the game stays open.
    if (reg) setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
  },
});
// Ask the browser not to clear saved matches, replays and career progress under storage pressure.
void navigator.storage?.persist?.().catch(() => false);

// Exposed for automated smoke tests.
(window as unknown as { __cuesports: unknown }).__cuesports = {
  shoot,
  /** The last frame's draw calls and triangles, and the quality tier. */
  /** The last frame's draw calls and triangles, and the quality tier. */
  perfTree: () => {
    const lines: string[] = [];
    const count = (o: import('three').Object3D): [number, number] => {
      if (!o.visible) return [0, 0];
      let n = 0,
        t = 0;
      const m = o as import('three').Mesh;
      if (m.isMesh || (o as import('three').Sprite).isSprite) {
        n++;
        const g = m.geometry;
        t += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
      }
      for (const c of o.children) {
        const [a, b] = count(c);
        n += a;
        t += b;
      }
      return [n, Math.round(t)];
    };
    const show = (o: import('three').Object3D, d: number) => {
      const [n, t] = count(o);
      if (n < 3) return;
      lines.push('  '.repeat(d) + `${o.name || o.type} (${o.children.length}): ${n} draws, ${t} tris`);
      if (d < 4) for (const c of o.children) show(c, d + 1);
    };
    show(scene, 0);
    return lines.join('\n');
  },
  perf: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, tier }),
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
  /** Opens a practice table for a game (no rules), e.g. 'snooker'. */
  practice: (id: string) => {
    match = null;
    setGame(GAMES.find((g) => g.id === id) ?? GAMES[0]!);
  },
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
