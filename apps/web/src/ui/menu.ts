import { CHALLENGES, loadStars, starText } from '../game/challenges';
import {
  AGENT,
  booking,
  bookingPitch,
  acceptSponsor,
  ceiling,
  declineOffer,
  pickNickname,
  restWeek,
  spend,
  careerRecord,
  confidenceBand,
  finishIntro,
  gameName,
  INTRO,
  markRead,
  nextGoal,
  targetText,
  unread,
} from '../game/agent';
import { tourDef, tourPlayer, TOURS, type TourId } from '../game/roster';
import {
  buyCue,
  buyKit,
  coach,
  coachedThisWeek,
  COACHING_XP,
  coachingPrice,
  cueDef,
  CUES,
  equipCue,
  isRival,
  KIT_PRICES,
  rivals,
} from '../game/economy';
import { isTourEvent, MAJOR_FIELD, MAJOR_WEEKS } from '../game/tour-events';
import {
  canChooseTours,
  canSpecialise,
  CARD_CUT,
  challengeKey,
  CHALLENGE_CARDS,
  chooseTours,
  hasCard,
  MAX_TOURS,
  membership,
  ordinal,
  QSCHOOL_PLACES,
  rankOf,
  ranking,
} from '../game/tours';
import { cost, cut, eligibility, prize, seasonSummary, weekEvents, WEEKS } from '../game/season';
import { ATTRS, levelCost, pointCost, shotTuning, TRAINING } from '../game/attributes';
import {
  bestText,
  careerEvent,
  EVENTS,
  inRound,
  isLocked,
  nextOpponent,
  opponent,
  REWARDS,
  roundName,
  rounds,
  unlockedBy,
  VENUES,
  venueOf,
  YOU,
  type CareerState,
} from '../game/career';
import {
  BUILDS,
  buildId,
  EYES,
  FACIAL,
  fromPreset,
  HAIR_COLOURS,
  HAIR_STYLES,
  POOL_CLOTHS,
  SHIRTS,
  SHOES,
  SKINS,
  SNOOKER_CLOTHS,
  TROUSERS,
  WAISTCOATS,
  WRAPS,
  type Profile,
} from '../game/profile';
import { FERRULES, WOODS, type CueFerrule, type CueWood } from '../render/equipment';
import type { SoundSettings } from '../audio/sound';
import { PRESETS } from '../render/figure';
import { bestLabel, DRILLS, type DrillId } from '../game/drills';
import { visitWord } from '../game/games';
import { DEFAULT_MATCH, type MatchConfig } from '../game/match';
import { STRAIGHT_POOL } from '@cuesports/rules';
import { reelOfHighlight, reelOfRack, type Highlight, type MatchRecord, type Reel } from '../game/record';
import { knownPlayers, percent, playerStats } from '../game/stats';
import {
  chooser,
  h,
  icon,
  iconButton,
  swatches,
  load,
  save,
  segmented,
  stepper,
  toggle,
  type IconName,
} from './kit';

import type { TierChoice } from '../render/quality';
import { markTutorialSeen, tutorialSeen } from '../game/tutorial';

export type ClothSpeedId = 'fast' | 'medium' | 'slow';
export type OptionName = 'guide' | 'squirt' | 'cushionLine' | 'player' | 'labels' | 'haptics' | 'calm';
export type TextSize = 'normal' | 'large' | 'larger';
export type ShotCamId = 'overview' | 'follow' | 'cinematic' | 'stay';
export type StrokeId = 'bar' | 'pull';
export type Settings = Record<OptionName, boolean> & {
  shotCam: ShotCamId;
  stroke: StrokeId;
  textSize: TextSize;
  graphics: TierChoice;
  /** Older saves: false meant the camera stayed put during shots. */
  overview?: boolean;
};

export interface MenuCallbacks {
  onStart(config: MatchConfig): void;
  onPractice(gameId: string): void;
  /** Pause sheet: start the rack (practice) or match over. */
  onRestart(): void;
  onConcede(): void;
  /** Leave the table for the home screen. */
  onQuit(): void;
  onClothSpeed(speed: ClothSpeedId): void;
  onOption(name: OptionName, on: boolean): void;
  onShotCamera(mode: ShotCamId): void;
  onStroke(mode: StrokeId): void;
  /** The menu covers the table (true) or has closed and play resumes (false). */
  onVisible(open: boolean): void;
  /** Saved matches and highlights, newest first. */
  saved(): Promise<{ matches: MatchRecord[]; highlights: Highlight[] }>;
  /** Watch a saved frame or highlight shot by shot. */
  onWatch(reel: Reel): void;
  onDeleteHighlight(id: string): Promise<void>;
  /** Pause sheet: keep the last shot as a highlight. */
  onSaveHighlight(): void;
  onDrill(id: DrillId): void;
  onChallenge(id: string): void;
  /** Starts the first-run lesson. */
  onTutorial(): void;
  /** The player's profile, and a change to it from the customiser. */
  profile(): Profile;
  onProfile(p: Profile): void;
  /** The customiser opened (true) or closed: show the player standing behind it. */
  onPreview(on: boolean): void;
  career(): CareerState;
  sound(): SoundSettings;
  onSound(s: SoundSettings): void;
  /** Enter a career event this week: one Joe booked, or one you picked. */
  onCareerEnter(event: string, booked: boolean): void;
  /** Start a career training session (a challenge id from TRAINING). */
  onCareerTrain(id: string): void;
  /** A change to the career from the hub (the intro seen, a message read). */
  onCareerUpdate(s: CareerState): void;
  /** Play your next match in the career event. */
  onCareerPlay(): void;
}

type Screen =
  | 'home'
  | 'play'
  | 'practice'
  | 'settings'
  | 'help'
  | 'pause'
  | 'stats'
  | 'replays'
  | 'challenges'
  | 'player'
  | 'career'
  | 'intro'
  | 'training'
  | 'shop'
  | 'event';

const MATCH_GAMES: { id: MatchConfig['game']; label: string; ball: string; sub: string }[] = [
  { id: 'nine-ball', label: '9-Ball', ball: '#f2c14e', sub: '9' },
  { id: 'ten-ball', label: '10-Ball', ball: '#2f6fdc', sub: '10' },
  { id: 'english', label: 'UK 8-Ball', ball: '#d8342c', sub: '8' },
  { id: 'chinese-8ball', label: 'Chinese 8-Ball', ball: '#1b1b1b', sub: '8' },
  { id: 'straight-pool', label: 'Straight Pool', ball: '#e0702a', sub: '14' },
  { id: 'one-pocket', label: 'One-Pocket', ball: '#2f6fdc', sub: '1' },
  { id: 'cowboy', label: 'Cowboy', ball: '#f2c14e', sub: '5' },
  { id: 'slosh', label: 'Slosh', ball: '#e57fa6', sub: '' },
  { id: 'snooker', label: 'Snooker', ball: '#c4202b', sub: '' },
  { id: 'billiards', label: 'Billiards', ball: '#f4efe0', sub: '' },
  { id: 'three-cushion', label: '3-Cushion', ball: '#f2c419', sub: '' },
  { id: 'balkline-47-2', label: 'Balkline 47/2', ball: '#c4161c', sub: '' },
  { id: 'balkline-71-2', label: 'Balkline 71/2', ball: '#c4161c', sub: '' },
  { id: 'pyramid', label: 'Pyramid', ball: '#f3ead2', sub: '' },
];

const LEVELS = ['Beginner', 'Amateur', 'Club', 'Semi-pro', 'Pro'];

const SETTINGS_KEY = 'cuesports.settings';
const LAST_MATCH_KEY = 'cuesports.lastMatch';

/** Scales the menus and HUD (CSS zoom on their roots, set from a variable on the page). */
function applyTextSize(size: TextSize): void {
  const scale = size === 'larger' ? 1.3 : size === 'large' ? 1.15 : 1;
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}

/** Short description of a match set-up, for the Quick match tile. */
function describe(c: MatchConfig): string {
  if (c.drill) return `Drill · ${DRILLS[c.drill].title}`;
  if (c.career) {
    const e = careerEvent(c.career.event);
    return e ? `Career · ${e.title} · ${roundName(e, c.career.round)}` : 'Career';
  }
  const game = MATCH_GAMES.find((g) => g.id === c.game)?.label ?? c.game;
  const who = c.ai ? `vs ${LEVELS[c.ai - 1]} CPU` : 'vs friend';
  const race = c.game === 'snooker' ? `best of ${c.raceTo * 2 - 1}` : `race to ${c.raceTo}`;
  return `${game} · ${who} · ${race}`;
}

function ballBadge(color: string, num: string): HTMLElement {
  const b = h('span', { className: 'ball-badge', ariaHidden: 'true' }, num);
  b.style.setProperty('--c', color);
  if (!num) b.classList.add('solid');
  return b;
}

/**
 * Full-screen menus: home, match set-up, practice, settings, help and the in-game pause sheet. The
 * table keeps rendering behind them.
 */
export class Menu {
  readonly root = h('div', { className: 'menu', hidden: true });
  readonly settings: Settings;
  private config: MatchConfig;
  private screen: Screen = 'home';
  private stack: Screen[] = [];
  private inMatch = false;
  private canSave = false;
  private statsPlayer: string | null = null;
  private careerTab: 'home' | 'events' | 'tours' | 'inbox' | 'profile' = 'home';
  /** Tours ticked on the specialise screen, before you confirm. */
  private tourPick: TourId[] | null = null;
  /** The tour chooser is open (it starts closed once you're on tours). */
  private tourChooserOpen = false;
  private introPage = 0;
  private openMessage: string | null = null;
  private statsGame: MatchConfig['game'] | 'all' = 'all';
  private quickSub = h('small', {});
  private graphicsNote = Object.assign(h('p', { className: 'fine-print' }, 'Restart the game to apply.'), {
    hidden: true,
  });

  constructor(
    private cb: MenuCallbacks,
    private practiceGames: { id: string; label: string }[],
    private cloth: ClothSpeedId,
  ) {
    const saved0 = load<Partial<Settings>>(SETTINGS_KEY, {});
    this.settings = {
      guide: true,
      squirt: true,
      cushionLine: true,
      player: true,
      labels: false,
      haptics: true,
      // Reduced motion follows the device's own setting until changed here.
      calm: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      shotCam: saved0.overview === false ? 'stay' : 'cinematic',
      stroke: 'bar',
      textSize: 'normal',
      graphics: 'auto',
      ...saved0,
    };
    applyTextSize(this.settings.textSize);
    const saved = load<Partial<MatchConfig>>(LAST_MATCH_KEY, {});
    this.config = {
      ...DEFAULT_MATCH,
      ai: 3,
      players: ['Player 1', 'CPU (Club)'],
      ...saved,
      rules: { ...DEFAULT_MATCH.rules, ...saved.rules },
      snooker: { ...DEFAULT_MATCH.snooker, ...saved.snooker },
    };
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.back();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(screen: Screen, ctx: { inMatch?: boolean; canSave?: boolean } = {}): void {
    if (ctx.inMatch !== undefined) this.inMatch = ctx.inMatch;
    this.canSave = ctx.canSave ?? false;
    this.stack = [];
    this.show(screen);
  }

  close(): void {
    if (this.root.hidden) return;
    this.cb.onPreview(false);
    this.root.hidden = true;
    this.cb.onVisible(false);
  }

  private go(screen: Screen): void {
    this.stack.push(this.screen);
    this.show(screen);
  }

  private back(): void {
    const prev = this.stack.pop();
    if (prev) this.show(prev);
    else if (this.screen === 'pause') this.close();
    // Opened straight onto a screen (after a match, say): back goes home.
    else if (this.screen !== 'home') this.show('home');
  }

  private show(screen: Screen): void {
    this.screen = screen;
    const wasHidden = this.root.hidden;
    this.root.hidden = false;
    this.root.dataset.screen = screen;
    const build: Record<Screen, () => HTMLElement> = {
      home: () => this.home(),
      play: () => this.play(),
      practice: () => this.practice(),
      settings: () => this.settingsScreen(),
      help: () => this.help(),
      pause: () => this.pause(),
      stats: () => this.stats(),
      replays: () => this.replays(),
      challenges: () => this.challenges(),
      player: () => this.player(),
      career: () => (this.cb.career().introSeen ? this.careerScreen() : this.introScreen()),
      intro: () => this.introScreen(),
      training: () => this.trainingScreen(),
      shop: () => this.shopScreen(),
      event: () => this.eventScreen(),
    };
    this.cb.onPreview(screen === 'player');
    const panel = build[screen]();
    panel.classList.add('panel', 'enter');
    this.root.replaceChildren(panel);
    if (wasHidden) this.cb.onVisible(true);
  }

  // -------------------------------------------------------------------------------------------
  // Pieces

  private tile(
    color: string,
    ico: IconName,
    title: string,
    sub: string | HTMLElement,
    onclick: (() => void) | null,
    extra = '',
  ): HTMLButtonElement {
    const locked = onclick === null;
    return h(
      'button',
      {
        className: `tile ${color} ${extra} ${locked ? 'locked' : ''}`.trim(),
        disabled: locked,
        onclick: onclick ?? null,
      },
      h('span', { className: 'tile-ico' }, icon(locked ? 'lock' : ico)),
      h(
        'span',
        { className: 'tile-text' },
        h('strong', {}, title),
        typeof sub === 'string' ? h('small', {}, sub) : sub,
      ),
    );
  }

  private header(title: string): HTMLElement {
    return h(
      'header',
      { className: 'bar' },
      iconButton('back', 'Back', () => this.back()),
      h('h2', {}, title),
    );
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    return h('div', { className: 'field' }, h('span', { className: 'field-label' }, label), control);
  }

  // -------------------------------------------------------------------------------------------
  // Screens

  private home(): HTMLElement {
    this.quickSub.textContent = describe(this.config);
    return h(
      'div',
      { className: 'home' },
      h(
        'div',
        { className: 'brand' },
        h('span', { className: 'wordmark' }, 'CUESPORTS'),
        h('span', { className: 'tag' }, 'POOL · SNOOKER'),
      ),
      tutorialSeen() ? '' : this.welcome(),
      h(
        'div',
        { className: 'tiles' },
        this.tile('blue', 'play', 'Quick match', this.quickSub, () => this.start(), 'wide'),
        this.tile('orange', 'cue', 'Play', 'Game, opponent, format', () => this.go('play')),
        this.tile('green', 'target', 'Practice', 'Free table', () => this.go('practice')),
        this.tile('yellow', 'trophy', 'Career', this.careerSub(), () => this.go('career')),
        this.tile('purple', 'globe', 'Online', 'Coming soon', null),
        this.tile('red', 'chart', 'Stats', 'Pots, breaks, wins', () => this.go('stats')),
        this.tile('teal', 'replay', 'Replays', 'Frames and highlights', () => this.go('replays')),
      ),
      h(
        'div',
        { className: 'utility' },
        h('button', { className: 'ubtn', onclick: () => this.go('player') }, icon('user'), 'Player'),
        h('button', { className: 'ubtn', onclick: () => this.go('help') }, icon('help'), 'How to play'),
        h('button', { className: 'ubtn', onclick: () => this.go('settings') }, icon('settings'), 'Settings'),
      ),
      this.status,
    );
  }

  /** First launch: an offer of the tutorial above the tiles. */
  private welcome(): HTMLElement {
    const el: HTMLElement = h(
      'div',
      { className: 'welcome' },
      h('span', {}, h('strong', {}, 'New here?'), ' Learn to aim, shoot and spin in a minute.'),
      h(
        'button',
        {
          className: 'coach-btn primary',
          onclick: () => {
            this.close();
            this.cb.onTutorial();
          },
        },
        'Show me',
      ),
      h(
        'button',
        {
          className: 'coach-skip',
          onclick: () => {
            markTutorialSeen('skipped');
            el.remove();
          },
        },
        'No thanks',
      ),
    );
    return el;
  }

  /** The line under the home screen: offline readiness, or a waiting update. */
  private status = h('div', { className: 'app-status', role: 'status' });

  setStatus(s: { offline?: boolean; update?: () => void }): void {
    this.status.replaceChildren();
    if (s.update) {
      this.status.append(
        h('span', {}, 'A new version is ready.'),
        h('button', { className: 'link-btn', onclick: s.update }, 'Restart to update'),
      );
    } else if (s.offline) {
      this.status.append(h('span', { className: 'dot' }), h('span', {}, 'Available offline'));
    }
  }

  private play(): HTMLElement {
    const c = this.config;
    const games = chooser(h('div', { className: 'game-pick', role: 'group', ariaLabel: 'Game' }));
    const gameButtons = MATCH_GAMES.map((g) =>
      h(
        'button',
        { type: 'button', onclick: () => setGame(g.id) },
        ballBadge(g.ball, g.sub),
        h('span', {}, g.label),
      ),
    );
    games.append(...gameButtons);

    const name1 = h('input', {
      type: 'text',
      value: c.players[0],
      maxLength: 16,
      ariaLabel: 'Player 1 name',
    });
    const name2 = h('input', {
      type: 'text',
      value: c.ai ? 'Player 2' : c.players[1],
      maxLength: 16,
      ariaLabel: 'Player 2 name',
    });
    const name2Field = this.field('Player 2', name2);

    let lvl = c.ai ?? 3;
    const level = segmented(
      'Computer level',
      LEVELS.map((l, i) => ({ value: String(i + 1), label: l })),
      String(lvl),
      (v) => {
        lvl = Number(v);
        c.ai = lvl;
      },
    );
    level.el.classList.add('levels');
    const levelField = this.field('Level', level.el);

    const opponent = segmented(
      'Opponent',
      [
        { value: 'cpu', label: 'Computer' },
        { value: 'friend', label: 'Friend' },
      ],
      c.ai ? 'cpu' : 'friend',
      (v) => {
        c.ai = v === 'cpu' ? lvl : null;
        showOpponent();
      },
    );
    const showOpponent = () => {
      levelField.hidden = c.ai === null;
      name2Field.hidden = c.ai !== null;
    };

    const raceLabel = h('span', { className: 'field-label' });
    const race = stepper('Racks', [1, 2, 3, 4, 5, 7, 9, 11], c.raceTo, (v) => (c.raceTo = v));

    // Rules: tucked away; the defaults are the official ones.
    const breaks = segmented(
      'Break',
      [
        { value: 'alternate', label: 'Alternate' },
        { value: 'winner', label: 'Winner' },
      ],
      c.breaks,
      (v) => (c.breaks = v),
    );
    const poolRules = h(
      'div',
      {},
      this.field('Break', breaks.el),
      toggle(
        'Three fouls lose the rack',
        c.rules.threeFoulRule,
        (on) => (c.rules = { ...c.rules, threeFoulRule: on }),
      ),
    );
    const reds = segmented(
      'Reds',
      [
        { value: '15', label: '15' },
        { value: '10', label: '10' },
        { value: '6', label: '6' },
      ],
      String(c.snooker.reds),
      (v) => (c.snooker = { ...c.snooker, reds: Number(v) as 15 | 10 | 6 }),
    );
    const snookerRules = h(
      'div',
      {},
      this.field('Reds', reds.el),
      toggle('Miss rule', c.snooker.missRule, (on) => (c.snooker = { ...c.snooker, missRule: on })),
    );
    const preset = segmented(
      'Rules',
      [
        { value: 'international', label: 'International' },
        { value: 'wepf', label: 'WEPF' },
      ],
      c.english,
      (v) => (c.english = v as MatchConfig['english']),
    );
    const englishRules = this.field('Rulebook', preset.el);
    const target = segmented(
      'Points to win',
      [
        { value: '50', label: '50' },
        { value: '100', label: '100' },
        { value: '200', label: '200' },
        { value: '300', label: '300' },
      ],
      String(c.billiards?.target ?? 50),
      (v) => (c.billiards = { target: Number(v) }),
    );
    const billiardsField = this.field('Points to win', target.el);
    const caromTarget = segmented(
      'Points to win',
      [
        { value: '0', label: 'Standard' },
        { value: '10', label: '10' },
        { value: '15', label: '15' },
        { value: '25', label: '25' },
        { value: '50', label: '50' },
      ],
      String(c.caromTarget ?? 0),
      (v) => (c.caromTarget = Number(v)),
    );
    const straightTarget = segmented(
      'Points to win',
      [
        { value: '25', label: '25' },
        { value: '50', label: '50' },
        { value: '100', label: '100' },
      ],
      String(c.straightTarget ?? STRAIGHT_POOL.defaults.target),
      (v) => (c.straightTarget = Number(v)),
    );
    const straightField = this.field('Points to win', straightTarget.el);
    const raceField = h('div', { className: 'field' }, raceLabel, race.el);
    const pyramidRules = h(
      'div',
      {},
      this.field(
        'Rules',
        segmented(
          'Rules',
          [
            { value: 'free', label: 'Free' },
            { value: 'neva', label: 'Neva' },
          ],
          c.pyramid ?? 'free',
          (v) => (c.pyramid = v === 'neva' ? 'neva' : 'free'),
        ).el,
      ),
      h(
        'p',
        { className: 'fine-print' },
        'Free: after the break any ball may be the cue ball. Neva: only the coloured ball, and a foul costs a point.',
      ),
    );
    const caromRules = h(
      'div',
      {},
      this.field('Points to win a game', caromTarget.el),
      h('p', { className: 'fine-print' }, 'Standard: 25 for 3-Cushion, 100 for Balkline.'),
    );
    const rules = h(
      'details',
      { className: 'rules' },
      h('summary', {}, icon('settings'), 'Rules'),
      poolRules,
      snookerRules,
      englishRules,
      caromRules,
      pyramidRules,
    );

    const setGame = (id: MatchConfig['game']) => {
      c.game = id;
      gameButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(MATCH_GAMES[i]!.id === id)));
      const snooker = id === 'snooker';
      raceLabel.textContent = snooker ? 'Frames to win' : id === 'billiards' ? 'Games to win' : 'Race to';
      const straight = id === 'straight-pool';
      const carom = id === 'three-cushion' || id.startsWith('balkline');
      if (carom) raceLabel.textContent = 'Games to win';
      poolRules.hidden =
        snooker ||
        id === 'english' ||
        id === 'chinese-8ball' ||
        id === 'billiards' ||
        carom ||
        straight ||
        id === 'pyramid';
      if (id === 'pyramid' || id === 'one-pocket' || id === 'cowboy' || id === 'slosh')
        raceLabel.textContent = 'Games to win';
      caromRules.hidden = !carom;
      pyramidRules.hidden = id !== 'pyramid';
      raceField.hidden = straight || id === 'billiards';
      straightField.hidden = !straight;
      billiardsField.hidden = id !== 'billiards';
      rules.hidden = straight || id === 'billiards';
      snookerRules.hidden = !snooker;
      englishRules.hidden = id !== 'english';
    };
    setGame(c.game);
    showOpponent();

    const start = () => {
      if (c.game === 'billiards') {
        c.raceTo = 1;
        c.billiards ??= { target: 50 };
      }
      if (c.game === 'straight-pool') {
        c.raceTo = 1;
        c.straightTarget ??= STRAIGHT_POOL.defaults.target;
      }
      c.players = [
        name1.value.trim() || 'Player 1',
        c.ai ? `CPU (${LEVELS[c.ai - 1]})` : name2.value.trim() || 'Player 2',
      ];
      this.start();
    };

    return h(
      'div',
      { className: 'sub play' },
      this.header('Play'),
      h(
        'div',
        { className: 'scroll' },
        games,
        this.field('Opponent', opponent.el),
        levelField,
        this.field('Player 1', name1),
        name2Field,
        raceField,
        straightField,
        billiardsField,
        rules,
      ),
      h('button', { className: 'tile blue cta', onclick: start }, icon('play'), h('strong', {}, 'Start')),
    );
  }

  private practice(): HTMLElement {
    const art: Record<string, [string, string]> = {
      'nine-ball': ['#f2c14e', '9'],
      'eight-ball': ['#1b1b1b', '8'],
      'ten-ball': ['#2f6fdc', '10'],
      english: ['#d8342c', '8'],
      snooker: ['#c4202b', ''],
      billiards: ['#f4efe0', ''],
      'three-cushion': ['#f2c419', ''],
      'balkline-47-2': ['#c4161c', ''],
      'balkline-71-2': ['#c4161c', ''],
      pyramid: ['#f3ead2', ''],
      'chinese-8ball': ['#1b1b1b', '8'],
      'straight-pool': ['#e0702a', '14'],
      'one-pocket': ['#2f6fdc', '1'],
      cowboy: ['#f2c14e', '5'],
      slosh: ['#e57fa6', ''],
      practice: ['#f6f3ea', ''],
    };
    const cloth = segmented<ClothSpeedId>(
      'Cloth speed',
      [
        { value: 'fast', label: 'Fast' },
        { value: 'medium', label: 'Medium' },
        { value: 'slow', label: 'Slow' },
      ],
      this.cloth,
      (v) => this.setCloth(v),
    );
    return h(
      'div',
      { className: 'sub practice' },
      this.header('Practice'),
      h(
        'div',
        { className: 'scroll' },
        h('h3', {}, 'Free table'),
        h(
          'div',
          { className: 'game-pick big' },
          ...this.practiceGames.map((g) => {
            const [color, num] = art[g.id] ?? ['#ccc', ''];
            return h(
              'button',
              {
                type: 'button',
                onclick: () => {
                  this.close();
                  this.cb.onPractice(g.id);
                },
              },
              ballBadge(color, num),
              h(
                'span',
                {},
                g.label.replace(/^Practice: (.)/, (_, c: string) => c.toUpperCase()),
              ),
            );
          }),
        ),
        h('h3', {}, 'Drills'),
        h(
          'div',
          { className: 'tiles' },
          this.tile(
            'red',
            'target',
            DRILLS.lineup.title,
            bestLabel('lineup'),
            () => {
              this.close();
              this.cb.onDrill('lineup');
            },
            'wide',
          ),
          this.tile(
            'yellow',
            'cue',
            DRILLS.ghost.title,
            bestLabel('ghost'),
            () => {
              this.close();
              this.cb.onDrill('ghost');
            },
            'wide',
          ),
        ),
        h('h3', {}, 'Challenges'),
        h(
          'div',
          { className: 'tiles' },
          this.tile(
            'purple',
            'star',
            'Challenges',
            `${Object.values(loadStars()).reduce((a, b) => a + b, 0)} of ${CHALLENGES.length * 3} stars`,
            () => this.go('challenges'),
            'wide',
          ),
        ),
        h('h3', {}, 'Graphics'),
        this.field(
          'Quality',
          segmented<TierChoice>(
            'Quality',
            [
              { value: 'auto', label: autoLabel() },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ],
            this.settings.graphics,
            (v) => {
              this.settings.graphics = v;
              save(SETTINGS_KEY, this.settings);
              this.graphicsNote.hidden = false;
            },
          ).el,
        ),
        this.graphicsNote,
        h('h3', {}, 'Table'),
        this.field('Cloth', cloth.el),
      ),
    );
  }

  private challenges(): HTMLElement {
    const stars = loadStars();
    const colours = ['blue', 'orange', 'green', 'red', 'purple', 'teal'];
    return h(
      'div',
      { className: 'sub challenges' },
      this.header('Challenges'),
      h(
        'div',
        { className: 'scroll' },
        h(
          'div',
          { className: 'tiles challenge-list' },
          ...CHALLENGES.map((c, i) =>
            this.tile(
              colours[i % colours.length]!,
              'target',
              `${i + 1}. ${c.title}`,
              h('small', {}, h('span', { className: 'stars' }, starText(stars[c.id] ?? 0)), ` ${c.goal}`),
              () => {
                this.close();
                this.cb.onChallenge(c.id);
              },
              'wide',
            ),
          ),
        ),
      ),
    );
  }

  /** The customiser: everything about the player's look, cue and tables, saved as it changes. */
  private player(): HTMLElement {
    let p = structuredClone(this.cb.profile());
    const change = (f: (q: Profile) => void) => {
      f(p);
      this.cb.onProfile(structuredClone(p));
    };
    const body = h('div', { className: 'scroll' });
    const draw = () => {
      const look = p.look;
      const name = h('input', { type: 'text', value: p.name, maxLength: 16, ariaLabel: 'Your name' });
      name.addEventListener('change', () => {
        change((q) => (q.name = name.value.trim() || 'Player 1'));
        // The Play screen's player 1 is the same person.
        this.config.players = [p.name, this.config.players[1]];
        save(LAST_MATCH_KEY, this.config);
      });
      const presets = h(
        'div',
        { className: 'presets seg' },
        ...PRESETS.map((pr) =>
          h(
            'button',
            {
              type: 'button',
              onclick: () => {
                p = fromPreset(p, pr);
                this.cb.onProfile(structuredClone(p));
                draw();
              },
            },
            pr.name,
          ),
        ),
      );
      // Items won in the career stay locked until then (`kind` is the reward key's prefix).
      const career = this.cb.career();
      const lock = <T extends string | null>(el: HTMLElement, opts: { value: T }[], kind?: string) => {
        if (!kind) return el;
        [...el.querySelectorAll('button')].forEach((b, i) => {
          const key = `${kind}:${opts[i]?.value}`;
          if (!isLocked(career, key)) return;
          b.disabled = true;
          b.classList.add('locked');
          b.title = `Win the ${unlockedBy(key)?.title ?? 'career event'}, or buy it in the career shop`;
        });
        return el;
      };
      const sw = (
        label: string,
        opts: { value: string; label: string }[],
        v: string,
        set: (x: string) => void,
        kind?: string,
      ) => this.field(label, lock(swatches(label, opts, v, (x) => change(() => set(x))).el, opts, kind));
      const seg = <T extends string>(
        label: string,
        opts: { value: T; label: string }[],
        v: T,
        set: (x: T) => void,
        kind?: string,
      ) => this.field(label, lock(segmented(label, opts, v, (x) => change(() => set(x))).el, opts, kind));
      body.replaceChildren(
        this.field('Name', name),
        h('h3', {}, 'Start from'),
        presets,
        h('h3', {}, 'Look'),
        sw('Skin', SKINS, look.skin, (x) => (look.skin = x)),
        seg('Hair', HAIR_STYLES, look.hairStyle, (x) => (look.hairStyle = x)),
        sw('Hair colour', HAIR_COLOURS, look.hair, (x) => (look.hair = x)),
        seg('Face', FACIAL, look.facial, (x) => (look.facial = x)),
        sw('Eyes', EYES, look.eyes, (x) => (look.eyes = x)),
        seg(
          'Build',
          BUILDS,
          buildId(look.build),
          (x) => (look.build = { ...BUILDS.find((b) => b.value === x)!.build }),
        ),
        h('h3', {}, 'Outfit'),
        sw('Shirt (pool)', SHIRTS, look.shirt, (x) => (look.shirt = x)),
        sw('Trousers (pool)', TROUSERS, look.trousers, (x) => (look.trousers = x)),
        sw('Shoes (pool)', SHOES, look.shoes, (x) => (look.shoes = x)),
        sw('Waistcoat (snooker)', WAISTCOATS, look.waistcoat, (x) => (look.waistcoat = x), 'waistcoat'),
        h('h3', {}, 'Cue'),
        seg<CueWood>(
          'Wood',
          (Object.keys(WOODS) as CueWood[]).map((k) => ({ value: k, label: WOODS[k].label })),
          p.cue.wood,
          (x) => (p.cue.wood = x),
          'wood',
        ),
        seg<CueFerrule>(
          'Ferrule',
          (Object.keys(FERRULES) as CueFerrule[]).map((k) => ({ value: k, label: FERRULES[k].label })),
          p.cue.ferrule,
          (x) => (p.cue.ferrule = x),
          'ferrule',
        ),
        this.field(
          'Wrap',
          lock(swatches('Wrap', WRAPS, p.cue.wrap, (x) => change((q) => (q.cue.wrap = x))).el, WRAPS, 'wrap'),
        ),
        h('h3', {}, 'Tables'),
        sw('Pool cloth', POOL_CLOTHS, p.cloth.pool, (x) => (p.cloth.pool = x), 'cloth.pool'),
        sw('UK pool cloth', POOL_CLOTHS, p.cloth.english, (x) => (p.cloth.english = x), 'cloth.pool'),
        sw('Snooker cloth', SNOOKER_CLOTHS, p.cloth.snooker, (x) => (p.cloth.snooker = x)),
      );
    };
    draw();
    return h('div', { className: 'sub player' }, this.header('Player'), body);
  }

  /** The Career tile's line: unread messages, or the event in progress. */
  private careerSub(): string {
    const s = this.cb.career();
    if (!s.introSeen) return 'Meet your agent';
    const n = unread(s);
    if (n) return `${n} new message${n > 1 ? 's' : ''} from ${AGENT.name}`;
    const e = s.run?.status === 'playing' && careerEvent(s.run.event);
    return e ? `${e.title} · ${roundName(e, s.run!.round)}` : 'Pub to arena';
  }

  /** Old Joe's card: his face, how he rates you, and what he has to say. */
  private joeCard(lines: string[], ...extra: (Node | string)[]): HTMLElement {
    const s = this.cb.career();
    return h(
      'div',
      { className: 'joe' },
      h(
        'div',
        { className: 'joe-head' },
        h('span', { className: 'joe-face', ariaHidden: 'true' }, AGENT.initials),
        h(
          'span',
          {},
          h('strong', {}, AGENT.name),
          h('small', {}, s.introSeen ? `Your agent · ${confidenceBand(s.confidence)}` : 'Agent'),
        ),
      ),
      ...lines.map((l) => h('p', {}, l)),
      ...extra,
    );
  }

  /** The first visit: Joe introduces himself over a few cards. */
  private introScreen(): HTMLElement {
    const page = Math.min(this.introPage, INTRO.length - 1);
    const card = INTRO[page]!;
    const last = page === INTRO.length - 1;
    const dots = h(
      'div',
      { className: 'coach-dots', ariaHidden: 'true' },
      ...INTRO.map((_, i) => h('span', { className: i < page ? 'on' : i === page ? 'now' : '' })),
    );
    const next = h(
      'button',
      {
        className: 'tile yellow cta',
        onclick: () => {
          if (!last) {
            this.introPage++;
            this.show('intro');
            return;
          }
          this.introPage = 0;
          const s = this.cb.career();
          if (!s.introSeen) this.cb.onCareerUpdate(finishIntro(s));
          this.careerTab = 'home';
          this.stack = [];
          this.show('career');
        },
      },
      h('strong', {}, last ? "Let's go" : 'Next'),
    );
    return h(
      'div',
      { className: 'sub career intro' },
      this.header('Career'),
      h('div', { className: 'scroll' }, h('h3', {}, card.title), this.joeCard([card.text]), dots),
      next,
    );
  }

  private careerScreen(): HTMLElement {
    const s = this.cb.career();
    const n = unread(s);
    const tabs = segmented(
      'Career',
      [
        { value: 'home', label: 'Home' },
        { value: 'events', label: 'Calendar' },
        { value: 'tours', label: 'Tours' },
        { value: 'inbox', label: n ? `Inbox ${n}` : 'Inbox' },
        { value: 'profile', label: 'Profile' },
      ],
      this.careerTab,
      (v) => {
        this.careerTab = v;
        this.show('career');
      },
    );
    tabs.el.classList.add('career-tabs');
    const body =
      this.careerTab === 'events'
        ? this.careerEvents()
        : this.careerTab === 'tours'
          ? this.careerTours()
          : this.careerTab === 'inbox'
            ? this.careerInbox()
            : this.careerTab === 'profile'
              ? this.careerProfile()
              : this.careerHome();
    return h('div', { className: 'sub career' }, this.header('Career'), tabs.el, body);
  }

  private careerHome(): HTMLElement {
    const s = this.cb.career();
    const body = h('div', { className: 'scroll' });
    const run = s.run?.status === 'playing' ? s.run : null;
    body.append(this.weekBar());
    if (run) {
      const e = careerEvent(run.event)!;
      body.append(
        this.joeCard(run.talk ?? []),
        h(
          'div',
          { className: 'tiles' },
          this.tile(
            'yellow',
            'play',
            'Continue',
            `${e.title} · ${roundName(e, run.round)}`,
            () => this.go('event'),
            'wide',
          ),
        ),
      );
    } else {
      const e = booking(s, 1);
      const rest = h(
        'button',
        {
          className: 'coach-btn',
          onclick: () => {
            this.cb.onCareerUpdate(restWeek(this.cb.career()));
            this.show('career');
          },
        },
        'Rest this week',
      );
      if (!e)
        body.append(
          this.joeCard(
            ["Nothing I can get you into this week, kid. Rest up, train, and we'll go again next week."],
            h('div', { className: 'joe-actions' }, rest),
          ),
        );
      if (e) {
        const c = cost(s, e, true);
        body.append(
          this.joeCard(
            [
              bookingPitch(s, e, 1),
              c.total
                ? `Entry £${c.fee}. I'll cover the travel. Winner gets £${prize(e, rounds(e))}.`
                : `It's on me. Winner gets £${prize(e, rounds(e))}.`,
            ],
            h(
              'div',
              { className: 'joe-actions' },
              h(
                'button',
                {
                  className: 'coach-btn primary',
                  onclick: () => {
                    this.cb.onCareerEnter(e.id, true);
                    this.go('event');
                  },
                },
                'Take it',
              ),
              h(
                'button',
                {
                  className: 'coach-btn',
                  onclick: () => {
                    this.careerTab = 'events';
                    this.show('career');
                  },
                },
                'Something else',
              ),
              rest,
            ),
          ),
        );
      }
    }
    // How Joe rates you, and what's next.
    const meter = h('div', { className: 'meter', role: 'meter', ariaLabel: 'Confidence' });
    meter.setAttribute('aria-valuenow', String(s.confidence));
    meter.append(h('span', {}));
    (meter.firstElementChild as HTMLElement).style.width = `${s.confidence}%`;
    if (s.trainingReady)
      body.append(
        h(
          'div',
          { className: 'tiles' },
          this.tile(
            'green',
            'target',
            'Training',
            'One session before your next event',
            () => this.go('training'),
            'wide',
          ),
        ),
      );
    body.append(
      h(
        'div',
        { className: 'tiles' },
        this.tile(
          'purple',
          'star',
          'Shop & coaching',
          `Cues, kit and a coach · £${s.money}`,
          () => this.go('shop'),
          'wide',
        ),
      ),
    );
    if (s.player.points > 0)
      body.append(
        h(
          'p',
          { className: 'event-status won' },
          `${s.player.points} skill point${s.player.points > 1 ? 's' : ''} to spend on the Profile tab.`,
        ),
      );
    body.append(
      h('h3', {}, "Joe's confidence"),
      h('div', { className: 'stat-line' }, meter, h('small', {}, confidenceBand(s.confidence))),
      h('h3', {}, 'Next goal'),
      h('p', { className: 'event-status' }, nextGoal(s)),
    );
    const latest = s.inbox.find((m) => !m.read);
    if (latest)
      body.append(
        h('h3', {}, 'New message'),
        h(
          'button',
          {
            className: 'message unread',
            onclick: () => {
              this.careerTab = 'inbox';
              this.openMessage = latest.id;
              this.cb.onCareerUpdate(markRead(s, latest.id));
              this.show('career');
            },
          },
          h('strong', {}, latest.subject),
          h('small', {}, latest.from),
        ),
      );
    const form = s.log.slice(-5).map((l) => (l.champion ? 'W' : l.reached >= l.target ? '✓' : '✗'));
    if (form.length)
      body.append(
        h('h3', {}, 'Recent events'),
        h(
          'div',
          { className: 'form-strip' },
          ...s.log.slice(-5).map((l, i) =>
            h(
              'span',
              {
                className: l.champion ? 'title' : l.reached >= l.target ? 'met' : 'missed',
                title: `${careerEvent(l.event)?.title ?? ''}: ${bestText(careerEvent(l.event)!, l.reached)}`,
              },
              form[i]!,
            ),
          ),
        ),
        h('p', { className: 'fine-print' }, 'Title · target met · target missed, oldest first.'),
      );
    return body;
  }

  /** Season, week and bank balance. */
  private weekBar(): HTMLElement {
    const s = this.cb.career();
    return h(
      'div',
      { className: 'week-bar' },
      h('strong', {}, `Season ${s.season} · Week ${s.week} of ${WEEKS}`),
      h('span', { className: 'money' }, `£${s.money}`),
    );
  }

  /** This week's events, a week off, what's coming, and how the season has gone. */
  private careerEvents(): HTMLElement {
    const s = this.cb.career();
    const colours = ['blue', 'orange', 'green', 'red', 'purple', 'teal'];
    const run = s.run?.status === 'playing' ? s.run : null;
    const body = h('div', { className: 'scroll' });
    body.append(this.weekBar(), h('h3', {}, 'This week'));
    const tiles = h('div', { className: 'tiles' });
    weekEvents(s).forEach((e, i) => {
      const game = MATCH_GAMES.find((g) => g.id === e.game)?.label ?? e.game;
      const venue = venueOf(e);
      const c = cost(s, e, false);
      const ok = eligibility(s, e);
      const now = run?.event === e.id;
      const sub = [
        `${game} · ${venue.name} · ${2 ** rounds(e)} players`,
        c.total ? `Entry £${c.fee} + travel £${c.travel}` : 'Free entry',
        `Winner £${prize(e, rounds(e))}`,
        isTourEvent(e) ? '' : bestText(e, s.best[e.id]),
        now ? 'In progress' : ok.ok ? '' : ok.reason,
      ]
        .filter(Boolean)
        .join(' · ');
      tiles.append(
        this.tile(
          isTourEvent(e) ? tourDef(e.tour).colour : colours[i % colours.length]!,
          'trophy',
          e.title,
          sub,
          now
            ? () => this.go('event')
            : ok.ok
              ? () => {
                  this.cb.onCareerEnter(e.id, false);
                  this.go('event');
                }
              : null,
          'wide',
        ),
      );
    });
    body.append(tiles);
    if (!run)
      body.append(
        h(
          'button',
          {
            className: 'coach-btn',
            onclick: () => {
              this.cb.onCareerUpdate(restWeek(this.cb.career()));
              this.show('career');
            },
          },
          'Rest this week (and train)',
        ),
      );
    body.append(
      h(
        'p',
        { className: 'fine-print' },
        `Joe's bookings on the Home tab save you the travel. He takes ${Math.round(cut(s) * 100)}% of prize money.`,
      ),
    );
    // The weeks ahead.
    const ahead = h('ol', { className: 'timeline ahead' });
    for (let w = s.week + 1; w <= Math.min(WEEKS, s.week + 4); w++)
      ahead.append(
        h(
          'li',
          {},
          h('strong', {}, `Week ${w}`),
          h(
            'small',
            {},
            weekEvents(s, s.season, w)
              .map((e) => e.title)
              .join(' · '),
          ),
        ),
      );
    if (ahead.childElementCount) body.append(h('h3', {}, 'Coming up'), ahead);
    // This season so far.
    const played = s.log.filter((l) => l.season === s.season);
    if (played.length) {
      const sum = seasonSummary(s, s.season);
      body.append(
        h('h3', {}, `Season ${s.season} so far`),
        h(
          'p',
          { className: 'fine-print' },
          `${sum.events} events · ${sum.titles} titles · £${sum.earned} won`,
        ),
      );
      const list = h('ol', { className: 'timeline' });
      for (const l of played) {
        const e = careerEvent(l.event);
        if (!e) continue;
        list.append(
          h(
            'li',
            { className: l.champion ? 'title' : l.reached >= l.target ? 'met' : 'missed' },
            h('strong', {}, `Week ${l.week}: ${e.title}`),
            h('small', {}, `${bestText(e, l.reached)}${l.prize ? ` · £${l.prize}` : ''}`),
          ),
        );
      }
      body.append(list);
    }
    return body;
  }

  /** Specialising, and the tours you're on: your status, the ranking and the majors. */
  private careerTours(): HTMLElement {
    const s = this.cb.career();
    const body = h('div', { className: 'scroll' });
    if (!canSpecialise(s)) {
      body.append(
        this.joeCard([
          "Tours are for players who've outgrown the club tables. Win at the clubs, get the halls open, and we'll talk about which tours to go for.",
        ]),
        h('h3', {}, 'The tours'),
      );
      for (const t of TOURS)
        body.append(h('div', { className: 'rival' }, h('strong', {}, t.name), h('span', {}, t.blurb)));
      return body;
    }
    if (canChooseTours(s) && (!s.tours.length || this.tourChooserOpen)) body.append(this.tourChooser());
    else if (canChooseTours(s))
      body.append(
        h(
          'button',
          {
            className: 'coach-btn',
            onclick: () => {
              this.tourChooserOpen = true;
              this.show('career');
            },
          },
          'Change tours (week 1 only)',
        ),
      );
    for (const m of s.tours) body.append(this.tourCard(m.tour));
    return body;
  }

  /** Pick up to two tours (in week 1 of a season, or the first time). */
  private tourChooser(): HTMLElement {
    const s = this.cb.career();
    const pick = (this.tourPick ??= s.tours.map((m) => m.tour));
    const wrap = h('div', { className: 'tour-chooser' });
    wrap.append(
      this.joeCard([
        s.tours.length
          ? 'Keep your tours, or change them. Drop one and you lose your card on it. Join a new one and you start on its Challenge Tour.'
          : "Pick your path, kid. One tour, or two if you think you can handle both. You start on each tour's Challenge Tour: top two at the end of the season get a tour card, or get to the Q-School semi-finals in week 12.",
      ]),
    );
    const tiles = h('div', { className: 'tiles' });
    for (const t of TOURS) {
      const on = pick.includes(t.id);
      const m = membership(s, t.id);
      const status = m ? (hasCard(s, t.id) ? 'Your tour: card held' : 'Your tour: Challenge Tour') : t.blurb;
      const tile = this.tile(
        t.colour,
        on ? 'star' : 'trophy',
        t.name,
        status,
        () => {
          const cur = this.tourPick ?? [];
          this.tourPick = cur.includes(t.id)
            ? cur.filter((x) => x !== t.id)
            : cur.length < MAX_TOURS
              ? [...cur, t.id]
              : cur;
          this.show('career');
        },
        `wide${on ? ' picked' : ''}`,
      );
      tile.setAttribute('aria-pressed', String(on));
      tiles.append(tile);
    }
    const same = pick.length === s.tours.length && pick.every((t) => s.tours.some((m) => m.tour === t));
    wrap.append(
      tiles,
      h(
        'button',
        {
          className: 'tile yellow cta',
          disabled: pick.length === 0 || same,
          onclick: () => {
            this.cb.onCareerUpdate(chooseTours(this.cb.career(), pick));
            this.tourPick = null;
            this.tourChooserOpen = false;
            this.careerTab = 'events';
            this.show('career');
          },
        },
        h(
          'strong',
          {},
          pick.length === 0
            ? 'Pick a tour'
            : same
              ? 'These are your tours'
              : `Go with ${pick.map((t) => tourDef(t).name).join(' and ')}`,
        ),
      ),
    );
    return wrap;
  }

  /** One of your tours: status, the ranking (or the Challenge Tour's) with the cut, and the majors. */
  private tourCard(tour: TourId): HTMLElement {
    const s = this.cb.career();
    const t = tourDef(tour);
    const card = hasCard(s, tour);
    const m = membership(s, tour)!;
    const key = card ? tour : challengeKey(tour);
    const me = rankOf(s, key) ?? 0;
    const wrap = h('div', { className: `tour-card ${t.colour}` });
    const status = card
      ? `Tour card until the end of season ${m.card!.until}. Keep it by finishing in the top ${CARD_CUT}. Majors (weeks ${MAJOR_WEEKS.join(', ')}): top ${MAJOR_FIELD}.`
      : `Challenge Tour. Top ${CHALLENGE_CARDS} at the end of the season earn a card; top ${QSCHOOL_PLACES} get a free Q-School place in week 12 (or pay the entry).`;
    wrap.append(
      h('h3', {}, t.name),
      h('p', { className: 'fine-print' }, status),
      h(
        'p',
        { className: 'event-status' },
        `You're ${ordinal(me)} on the ${card ? 'ranking' : 'Challenge Tour'}.`,
      ),
    );
    const rows = ranking(s, key);
    const cutAt = card ? CARD_CUT : CHALLENGE_CARDS;
    const show = rows.slice(0, 16);
    const table = h('ol', { className: 'ranking' });
    const row = (r: { id: string; money: number }, i: number) => {
      const p = tourPlayer(r.id);
      const visitor = p && p.home !== tour ? ` · ${tourDef(p.home).name.replace(/ Tour$/, '')}` : '';
      const li = h(
        'li',
        { className: `${r.id === YOU ? 'you' : ''}${i + 1 === cutAt ? ' cut' : ''}`.trim() },
        h('span', { className: 'pos' }, String(i + 1)),
        h(
          'span',
          { className: 'who' },
          r.id === YOU ? this.cb.profile().name : opponent(r.id).name,
          h('small', {}, visitor),
        ),
        h('span', { className: 'cash' }, `£${r.money.toLocaleString('en-GB')}`),
      );
      return li;
    };
    show.forEach((r, i) => table.append(row(r, i)));
    if (me > show.length) table.append(h('li', { className: 'gap' }, '…'), row(rows[me - 1]!, me - 1));
    wrap.append(
      table,
      h(
        'p',
        { className: 'fine-print' },
        `Prize money over this season and last. The line marks the ${card ? `top ${CARD_CUT} (keep your card)` : `top ${CHALLENGE_CARDS} (a tour card)`}. Players from other tours are marked.`,
      ),
    );
    return wrap;
  }

  private careerInbox(): HTMLElement {
    const s = this.cb.career();
    const body = h('div', { className: 'scroll' });
    if (!s.inbox.length) body.append(h('p', { className: 'fine-print' }, 'No messages yet.'));
    const act = (next: CareerState) => {
      this.cb.onCareerUpdate(next);
      this.show('career');
    };
    for (const m of s.inbox) {
      const open = this.openMessage === m.id;
      const head = h(
        'button',
        {
          className: 'message-head',
          ariaExpanded: String(open),
          onclick: () => {
            this.openMessage = open ? null : m.id;
            if (!m.read) this.cb.onCareerUpdate(markRead(this.cb.career(), m.id));
            this.show('career');
          },
        },
        h('strong', {}, m.subject),
        h('small', {}, m.from),
      );
      const actions = h('div', { className: 'joe-actions' });
      if (open && m.action && !m.done) {
        if (m.action.kind === 'sponsor' && m.action.offer.season === s.season) {
          const id = m.id;
          actions.append(
            h(
              'button',
              { className: 'coach-btn primary', onclick: () => act(acceptSponsor(this.cb.career(), id)) },
              `Sign (£${m.action.offer.retainer})`,
            ),
            h(
              'button',
              { className: 'coach-btn', onclick: () => act(declineOffer(this.cb.career(), id)) },
              'No thanks',
            ),
          );
        } else if (m.action.kind === 'nickname') {
          const id = m.id;
          for (const n of m.action.choices)
            actions.append(
              h(
                'button',
                { className: 'coach-btn', onclick: () => act(pickNickname(this.cb.career(), id, n)) },
                `“${n}”`,
              ),
            );
        }
      }
      body.append(
        h(
          'div',
          { className: `message${m.read ? '' : ' unread'}${open ? ' open' : ''}` },
          head,
          open ? h('p', {}, m.body) : '',
          open && m.done && m.action ? h('small', {}, 'Done.') : '',
          actions.childElementCount ? actions : '',
        ),
      );
    }
    return body;
  }

  /** Coaching, cues and kit, paid for with prize money. */
  private shopScreen(): HTMLElement {
    const s = this.cb.career();
    const cap = ceiling(s);
    const body = h('div', { className: 'scroll' });
    const update = (next: CareerState) => {
      this.cb.onCareerUpdate(next);
      this.show('shop');
    };
    body.append(this.weekBar());
    // Coaching
    const price = coachingPrice(s);
    body.append(
      h('h3', {}, 'Coaching'),
      h(
        'p',
        { className: 'fine-print' },
        coachedThisWeek(s)
          ? "You've had your session this week. One a week: there's only so much a coach can teach."
          : `One session a week: £${price} for ${COACHING_XP} XP on the skill of your choice. It speeds you up, but it won't take you past your ceiling (${cap}).`,
      ),
    );
    const grid = h('div', { className: 'shop-grid' });
    for (const a of ATTRS) {
      const r = s.player.ratings[a.id];
      const ok = !coachedThisWeek(s) && s.money >= price && r < cap;
      grid.append(
        h(
          'button',
          {
            className: 'coach-btn',
            disabled: !ok,
            onclick: () => update(coach(this.cb.career(), a.id, cap)),
          },
          `${a.label} ${r}`,
        ),
      );
    }
    body.append(grid);
    // Cues
    body.append(h('h3', {}, 'Cues'));
    for (const c of CUES) {
      const owned = s.cues.includes(c.id);
      const using = s.cue === c.id;
      const stats = Object.entries(c.bonus)
        .map(([k, v]) => `${ATTRS.find((x) => x.id === k)?.label ?? k} ${v! > 0 ? '+' : ''}${v}`)
        .join(', ');
      body.append(
        h(
          'div',
          { className: `shop-item${using ? ' using' : ''}` },
          h('span', {}, h('strong', {}, c.name), h('small', {}, `${c.blurb}${stats ? ` (${stats})` : ''}`)),
          using
            ? h('em', {}, 'In your hands')
            : owned
              ? h(
                  'button',
                  { className: 'coach-btn', onclick: () => update(equipCue(this.cb.career(), c.id)) },
                  'Use',
                )
              : h(
                  'button',
                  {
                    className: 'coach-btn primary',
                    disabled: s.money < c.price,
                    onclick: () => update(buyCue(this.cb.career(), c.id)),
                  },
                  `£${c.price}`,
                ),
        ),
      );
    }
    // Kit
    body.append(
      h('h3', {}, 'Kit'),
      h(
        'p',
        { className: 'fine-print' },
        'Cosmetic only. Win the event to get it free, or buy it here. Use it from the Player screen.',
      ),
    );
    for (const [key, p] of Object.entries(KIT_PRICES)) {
      const owned = s.unlocked.includes(key);
      body.append(
        h(
          'div',
          { className: 'shop-item' },
          h(
            'span',
            {},
            h('strong', {}, REWARDS[key] ?? key),
            h('small', {}, owned ? 'Yours' : `Or win the ${unlockedBy(key)?.title ?? 'event'}`),
          ),
          owned
            ? h('em', {}, 'Owned')
            : h(
                'button',
                {
                  className: 'coach-btn primary',
                  disabled: s.money < p,
                  onclick: () => update(buyKit(this.cb.career(), key)),
                },
                `£${p}`,
              ),
        ),
      );
    }
    return h('div', { className: 'sub career' }, this.header('Shop & coaching'), body);
  }

  private careerProfile(): HTMLElement {
    const s = this.cb.career();
    const r = careerRecord(s);
    const body = h('div', { className: 'scroll' });
    const cell = (label: string, value: string) =>
      h('div', { className: 'stat' }, h('strong', {}, value), h('small', {}, label));
    body.append(
      h('h3', {}, s.nickname ? `${this.cb.profile().name} “${s.nickname}”` : this.cb.profile().name),
      h(
        'p',
        { className: 'fine-print' },
        `Cue: ${cueDef(s.cue).name}.${s.sponsor?.season === s.season ? ` Sponsored by ${s.sponsor.name} this season.` : ''}`,
      ),
      h(
        'div',
        { className: 'stat-grid' },
        cell('Events', String(r.events)),
        cell('Titles', String(r.titles)),
        cell('Matches won', String(r.won)),
        cell('Matches lost', String(r.lost)),
        cell('In the bank', `£${s.money}`),
        cell('Prize money', `£${s.log.reduce((a, l) => a + (l.prize ?? 0), 0)}`),
      ),
    );
    body.append(this.skills());
    const titles = EVENTS.filter((e) => (s.best[e.id] ?? 0) >= rounds(e));
    body.append(h('h3', {}, 'Trophies'));
    body.append(
      titles.length
        ? h('div', { className: 'trophies' }, ...titles.map((e) => h('span', {}, icon('trophy'), e.title)))
        : h('p', { className: 'fine-print' }, 'None yet. Old Joe is working on it.'),
    );
    if (s.log.length) {
      body.append(h('h3', {}, 'Career so far'));
      const list = h('ol', { className: 'timeline' });
      s.log.forEach((l) => {
        const e = careerEvent(l.event);
        if (!e) return;
        list.append(
          h(
            'li',
            { className: l.champion ? 'title' : l.reached >= l.target ? 'met' : 'missed' },
            h('strong', {}, e.title),
            h('small', {}, `${bestText(e, l.reached)} · Joe wanted you to ${targetText(e, l.target)}`),
          ),
        );
      });
      body.append(list);
    }
    // Rivals: the players who've earned it by beating you, then the circuit's finalists.
    body.append(h('h3', {}, 'Rivals'));
    const earned = rivals(s);
    for (const r of earned) {
      const o = opponent(r.id);
      const where = r.group === 'circuit' ? 'The circuit' : tourDef(r.group).name;
      body.append(
        h(
          'div',
          { className: 'rival nemesis' },
          h('strong', {}, o.name),
          h('span', {}, `${o.style} · ${where}`),
          h('small', {}, `You ${r.won}–${r.lost}`),
        ),
      );
    }
    const seen = new Set<string>(earned.map((r) => r.id));
    for (const e of EVENTS) {
      if (seen.has(e.rival)) continue;
      seen.add(e.rival);
      const o = opponent(e.rival);
      const [w, l] = s.h2h[o.id] ?? [0, 0];
      const venue = VENUES.find((x) => x.id === e.venue)!;
      body.append(
        h(
          'div',
          { className: 'rival' },
          h('strong', {}, o.name),
          h('span', {}, `${o.style} · ${venue.kind} finals`),
          h('small', {}, w + l ? `You ${w}–${l}` : 'Not met yet'),
        ),
      );
    }
    body.append(
      h(
        'div',
        { className: 'tiles' },
        this.tile('purple', 'replay', `Hear ${AGENT.name} again`, 'His introduction', () => {
          this.introPage = 0;
          this.go('intro');
        }),
      ),
    );
    return body;
  }

  /** Your ratings with their XP, skill points to spend, and how well you know each game. */
  private skills(): HTMLElement {
    const s = this.cb.career();
    const p = s.player;
    const cap = ceiling(s);
    const wrap = h('div', { className: 'skills' });
    wrap.append(
      h('h3', {}, `Level ${p.level}`),
      h(
        'div',
        { className: 'stat-line' },
        this.bar(p.levelXp / levelCost(p.level)),
        h('small', {}, `${p.levelXp} / ${levelCost(p.level)} XP`),
      ),
      h(
        'p',
        { className: 'fine-print' },
        `Your ceiling is ${cap}: no skill goes higher until you move up.${p.points ? ` Skill points: ${p.points}.` : ''}`,
      ),
    );
    for (const a of ATTRS) {
      const r = p.ratings[a.id];
      const plus =
        p.points > 0 && r < cap
          ? h(
              'button',
              {
                className: 'coach-btn primary skill-plus',
                ariaLabel: `Spend a point on ${a.label}`,
                onclick: () => {
                  this.cb.onCareerUpdate(spend(this.cb.career(), a.id));
                  this.show('career');
                },
              },
              '+1',
            )
          : '';
      wrap.append(
        h(
          'div',
          { className: 'skill' },
          h(
            'div',
            { className: 'skill-head' },
            h('strong', {}, a.label),
            h('span', { className: 'skill-num' }, String(r)),
            plus,
          ),
          h(
            'div',
            { className: 'stat-line' },
            this.bar(r / 99, cap / 99),
            h('small', {}, r >= cap ? 'At ceiling' : `${p.xp[a.id]} / ${pointCost(r)} XP`),
          ),
          h('small', {}, `${a.low}. Trained by: ${a.trained.toLowerCase()}.`),
        ),
      );
    }
    const games = Object.entries(p.familiarity).filter(([, f]) => (f ?? 0) > 0);
    if (games.length) {
      wrap.append(h('h3', {}, 'Familiarity'));
      for (const [g, f] of games.sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))) {
        const label = MATCH_GAMES.find((x) => x.id === g)?.label ?? g;
        wrap.append(
          h(
            'div',
            { className: 'stat-line fam' },
            h('span', {}, label),
            this.bar((f ?? 0) / 100),
            h('small', {}, `${f}`),
          ),
        );
      }
      wrap.append(
        h(
          'p',
          { className: 'fine-print' },
          'You play below your ratings in a game you know less well. It grows by playing it.',
        ),
      );
    }
    return wrap;
  }

  /** A thin progress bar, with an optional mark (the ceiling). */
  private bar(f: number, mark?: number): HTMLElement {
    const m = h('div', { className: 'meter', ariaHidden: 'true' }, h('span', {}));
    (m.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, f)) * 100}%`;
    if (mark !== undefined && mark < 1) {
      const c = h('i', { className: 'cap' });
      c.style.left = `${mark * 100}%`;
      m.append(c);
    }
    return m;
  }

  /** Pick a training session: each is a challenge that works on one or two skills. */
  private trainingScreen(): HTMLElement {
    const s = this.cb.career();
    const body = h('div', { className: 'scroll' });
    body.append(
      this.joeCard([
        s.trainingReady
          ? 'One session before your next event. Pick what needs work. The better you do, the more you get out of it.'
          : "You've trained already. Play your next event and we'll go again after it.",
      ]),
    );
    const t = shotTuning(s.player, 'nine-ball');
    body.append(
      h(
        'p',
        { className: 'fine-print' },
        `You train as you play: with your own guide (Vision ${Math.round(s.player.ratings.vision)}), spin reach and elevation (up to ${t.maxElevation}°).`,
      ),
    );
    const tiles = h('div', { className: 'tiles' });
    const colours = ['blue', 'orange', 'green', 'red', 'purple', 'teal'];
    TRAINING.forEach((tr, i) => {
      const c = CHALLENGES.find((x) => x.id === tr.id);
      if (!c) return;
      const skills = tr.attrs.map((a) => ATTRS.find((x) => x.id === a)!.label).join(' + ');
      tiles.append(
        this.tile(
          colours[i % colours.length]!,
          'target',
          `${skills}: ${c.title}`,
          c.goal,
          s.trainingReady
            ? () => {
                this.close();
                this.cb.onCareerTrain(tr.id);
              }
            : null,
          'wide',
        ),
      );
    });
    body.append(tiles);
    return h('div', { className: 'sub career' }, this.header('Training'), body);
  }

  /** The event you're in: Joe's talk, the walk-on card for your next match, and the bracket. */
  private eventScreen(): HTMLElement {
    const s = this.cb.career();
    const run = s.run;
    const e = run && careerEvent(run.event);
    if (!run || !e) return this.careerScreen();
    const name = (id: string) => (id === YOU ? this.cb.profile().name : opponent(id).name);
    const bracket = h('div', { className: 'bracket' });
    for (let r = 0; r < rounds(e); r++) {
      const ids = inRound(run, r);
      const won = run.winners[r] ?? [];
      const col = h(
        'div',
        { className: 'round' },
        h('h4', {}, roundName(e, r)),
        h('small', {}, e.game === 'snooker' ? `Best of ${e.raceTo[r]! * 2 - 1}` : `Race to ${e.raceTo[r]}`),
      );
      for (let i = 0; i < 2 ** (rounds(e) - r); i += 2) {
        const row = (id: string | undefined) =>
          h(
            'div',
            {
              className: `slot${id === YOU ? ' you' : ''}${id && won.includes(id) ? ' won' : ''}${id && won.length && !won.includes(id) ? ' lost' : ''}`,
            },
            id ? name(id) : '—',
          );
        col.append(h('div', { className: 'pair' }, row(ids[i]), row(ids[i + 1])));
      }
      bracket.append(col);
    }
    const opp = nextOpponent(run);
    const action =
      run.status === 'playing' && opp
        ? h(
            'button',
            {
              className: 'tile blue cta',
              onclick: () => {
                this.close();
                this.cb.onCareerPlay();
              },
            },
            icon('play'),
            h('strong', {}, `Play the ${roundName(e, run.round).toLowerCase()}`),
          )
        : h(
            'button',
            {
              className: 'tile cta',
              onclick: () => {
                this.careerTab = 'home';
                this.open('career');
              },
            },
            h('strong', {}, 'Back to Old Joe'),
          );
    const target = run.target;
    const joe = this.joeCard(
      run.status === 'playing' ? (run.talk ?? []) : (run.debrief ?? []),
      target !== undefined && run.status === 'playing'
        ? h('small', { className: 'joe-target' }, `Target: ${targetText(e, target)}`)
        : '',
    );
    const status =
      run.status === 'won'
        ? h(
            'p',
            { className: 'event-status won' },
            REWARDS[e.reward] ? `Champion! Unlocked: ${REWARDS[e.reward]}.` : 'Champion!',
          )
        : run.status === 'out'
          ? h(
              'p',
              { className: 'event-status' },
              `Out in the ${roundName(e, run.round).toLowerCase()}. Enter again from the Events tab.`,
            )
          : '';
    return h(
      'div',
      { className: 'sub event' },
      this.header(e.title),
      h(
        'div',
        { className: 'scroll' },
        joe,
        status,
        opp && run.status === 'playing' ? this.walkOn(e, opp) : '',
        bracket,
      ),
      action,
    );
  }

  /** Before each match: who you're playing, how you've done against them, and what's at stake. */
  private walkOn(
    e: NonNullable<ReturnType<typeof careerEvent>>,
    opp: { id: string; level: number },
  ): HTMLElement {
    const s = this.cb.career();
    const run = s.run!;
    const o = opponent(opp.id);
    const [w, l] = s.h2h[o.id] ?? [0, 0];
    const last = run.round === rounds(e) - 1;
    const stake = last
      ? 'Win for the title'
      : `Win to reach the ${roundName(e, run.round + 1).toLowerCase()}`;
    const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.round(opp.level) - 1))]!;
    return h(
      'div',
      { className: `walk-on${opp.id === e.rival ? ' rival-card' : ''}` },
      h('small', {}, `${roundName(e, run.round)} · ${gameName(e)}`),
      h('strong', {}, `${s.nickname ? `“${s.nickname}”` : 'You'} vs ${o.name}`),
      h(
        'span',
        {},
        `${o.style} · ${level}${opp.id === e.rival || isRival(s, opp.id) ? ' · your rival' : ''}${
          isTourEvent(e) && tourPlayer(o.id) && tourPlayer(o.id)!.home !== e.tour
            ? ` · from the ${tourDef(tourPlayer(o.id)!.home).name}`
            : ''
        }`,
      ),
      h('span', {}, w + l ? `Head to head: you ${w}–${l}` : 'First meeting'),
      h('span', {}, `Your ${gameName(e)}: familiarity ${s.player.familiarity[e.game] ?? 0}`),
      h('em', {}, stake),
    );
  }

  /** Effects and music levels, saved as they change. */
  private soundFields(): HTMLElement[] {
    const s = this.cb.sound();
    const levels = [
      { value: '0', label: 'Off' },
      { value: '0.35', label: 'Low' },
      { value: '0.65', label: 'Medium' },
      { value: '1', label: 'High' },
    ];
    // The nearest level to a saved value.
    const near = (v: number) =>
      levels.reduce((a, b) => (Math.abs(Number(b.value) - v) < Math.abs(Number(a.value) - v) ? b : a)).value;
    const set = (k: 'effects' | 'music') => (v: string) => {
      s[k] = Number(v);
      s.muted = false;
      this.cb.onSound({ ...s });
    };
    return [
      this.field('Effects', segmented('Sound effects', levels, near(s.effects), set('effects')).el),
      this.field('Music', segmented('Music', levels, near(s.music), set('music')).el),
    ];
  }

  private settingsScreen(): HTMLElement {
    const opt = (name: OptionName, label: string) =>
      toggle(label, this.settings[name], (on) => {
        this.settings[name] = on;
        save(SETTINGS_KEY, this.settings);
        this.cb.onOption(name, on);
      });
    const cloth = segmented<ClothSpeedId>(
      'Cloth speed',
      [
        { value: 'fast', label: 'Fast' },
        { value: 'medium', label: 'Medium' },
        { value: 'slow', label: 'Slow' },
      ],
      this.cloth,
      (v) => this.setCloth(v),
    );
    const shotCam = segmented<ShotCamId>(
      'Camera during shots',
      [
        { value: 'cinematic', label: 'Cinematic' },
        { value: 'follow', label: 'Follow' },
        { value: 'overview', label: 'Overview' },
        { value: 'stay', label: 'Stay' },
      ],
      this.settings.shotCam,
      (v) => {
        this.settings.shotCam = v;
        save(SETTINGS_KEY, this.settings);
        this.cb.onShotCamera(v);
      },
    );
    const stroke = segmented<StrokeId>(
      'Stroke control',
      [
        { value: 'bar', label: 'Power bar' },
        { value: 'pull', label: 'Pull back' },
      ],
      this.settings.stroke,
      (v) => {
        this.settings.stroke = v;
        save(SETTINGS_KEY, this.settings);
        this.cb.onStroke(v);
      },
    );
    return h(
      'div',
      { className: 'sub settings' },
      this.header('Settings'),
      h(
        'div',
        { className: 'scroll' },
        h('h3', {}, 'Aiming'),
        opt('guide', 'Aiming guide'),
        opt('squirt', 'Guide allows for squirt'),
        opt('cushionLine', '3-cushion: longer guide, to the first cushion and off it'),
        this.field('Stroke', stroke.el),
        h('h3', {}, 'Camera'),
        this.field('During shots', shotCam.el),
        opt('player', 'Show the player at the table'),
        h('h3', {}, 'Accessibility'),
        opt('labels', 'Label coloured balls (Y, G, Br, Bl, P, Bk)'),
        opt('haptics', 'Vibrate on strikes and pots'),
        opt('calm', 'Reduce camera motion'),
        this.field(
          'Text size',
          segmented<TextSize>(
            'Text size',
            [
              { value: 'normal', label: 'Normal' },
              { value: 'large', label: 'Large' },
              { value: 'larger', label: 'Larger' },
            ],
            this.settings.textSize,
            (v) => {
              this.settings.textSize = v;
              save(SETTINGS_KEY, this.settings);
              applyTextSize(v);
            },
          ).el,
        ),
        h('h3', {}, 'Table'),
        this.field('Cloth', cloth.el),
        h('h3', {}, 'Sound'),
        ...this.soundFields(),
        h('p', { className: 'fine-print' }, h('a', { href: '/lab/' }, 'Physics lab ›')),
      ),
    );
  }

  private help(): HTMLElement {
    const row = (ico: IconName, text: string) =>
      h('div', { className: 'help-row' }, h('span', { className: 'help-ico' }, icon(ico)), h('p', {}, text));
    return h(
      'div',
      { className: 'sub help' },
      this.header('How to play'),
      h(
        'div',
        { className: 'scroll' },
        row('hand', 'Drag on the table to aim. Slow drags are finer.'),
        row(
          'cue',
          'Pull the power bar down and let go to shoot. With Pull back stroke (Settings), pull down, then push up to strike: the faster the push, the harder the shot.',
        ),
        row('target', 'Tap the cue ball (bottom right) for spin and elevation.'),
        row('camera', 'Tap the camera to switch views. Pinch to zoom.'),
        row('undo', 'Undo and replay: bottom left.'),
        h('p', { className: 'fine-print' }, 'Keys: ← → aim (Shift: bigger steps), ↑ ↓ tilt, Space shoots.'),
        this.tile('yellow', 'target', 'Tutorial', 'Aim, shoot, pot, spin: one minute', () => {
          this.close();
          this.cb.onTutorial();
        }),
      ),
    );
  }

  private pause(): HTMLElement {
    const done = (fn: () => void) => () => {
      this.close();
      fn();
    };
    return h(
      'div',
      { className: 'pause' },
      h(
        'div',
        { className: 'tiles' },
        this.tile('blue', 'play', 'Resume', '', () => this.close(), 'wide'),
        this.inMatch
          ? this.tile(
              'orange',
              'flag',
              'Concede',
              'Give up this rack',
              done(() => this.cb.onConcede()),
            )
          : this.tile('green', 'grid', 'Change game', 'Practice tables', () => this.go('practice')),
        this.tile(
          'teal',
          'restart',
          this.inMatch ? 'Restart' : 'Re-rack',
          this.inMatch ? 'New match, same set-up' : 'Fresh balls',
          done(() => this.cb.onRestart()),
        ),
        this.canSave
          ? this.tile(
              'yellow',
              'star',
              'Save last shot',
              'Keep it as a highlight',
              done(() => this.cb.onSaveHighlight()),
            )
          : '',
        this.tile('purple', 'settings', 'Settings', '', () => this.go('settings')),
        this.tile('navy', 'home', 'Home', '', () => {
          this.cb.onQuit();
          this.open('home');
        }),
      ),
    );
  }

  /** A screen whose body fills in once the saved data has loaded. */
  private async(cls: string, title: string, fill: (body: HTMLElement) => Promise<void>): HTMLElement {
    const body = h('div', { className: 'scroll' }, h('p', { className: 'fine-print' }, 'Loading…'));
    const screen = this.screen;
    void (async () => {
      const out = h('div', { className: 'scroll' });
      try {
        await fill(out);
      } catch {
        out.replaceChildren(h('p', { className: 'fine-print' }, 'Saved data could not be read.'));
      }
      if (this.screen === screen) body.replaceWith(out);
    })();
    return h('div', { className: `sub ${cls}` }, this.header(title), body);
  }

  private stats(): HTMLElement {
    return this.async('stats', 'Stats', async (out) => {
      const { matches } = await this.cb.saved();
      const names = knownPlayers(matches);
      if (!names.length) {
        out.append(h('p', { className: 'empty' }, 'Play a match and your stats appear here.'));
        return;
      }
      const player = this.statsPlayer && names.includes(this.statsPlayer) ? this.statsPlayer : names[0]!;
      const grid = h('div', { className: 'stat-grid' });
      const draw = () => {
        const game = this.statsGame === 'all' ? undefined : this.statsGame;
        const s = playerStats(matches, { player: this.statsPlayer ?? player, game });
        const cell = (label: string, value: string, sub = '') =>
          h(
            'div',
            { className: 'stat' },
            h('strong', {}, value),
            h('span', {}, label),
            sub ? h('small', {}, sub) : '',
          );
        const snooker = game === 'snooker';
        grid.replaceChildren(
          cell('Matches won', percent(s.matchesWon, s.matches), `${s.matchesWon} of ${s.matches}`),
          cell(
            snooker ? 'Frames won' : 'Racks won',
            percent(s.racksWon, s.racks),
            `${s.racksWon} of ${s.racks}`,
          ),
          cell('Pot success', percent(s.pots, s.potAttempts), `${s.pots} of ${s.potAttempts}`),
          cell('Long pots', percent(s.longPots, s.longAttempts), `${s.longPots} of ${s.longAttempts}`),
          cell('Safety success', percent(s.safetiesWon, s.safeties), `${s.safetiesWon} of ${s.safeties}`),
          cell(
            // "Highest run" for American pool, "Highest break" elsewhere; both across all games.
            game ? `Highest ${visitWord(game)}` : 'Highest break / run',
            String(s.highestBreak),
            snooker ? 'points' : game ? 'balls' : 'points or balls',
          ),
          ...(game === undefined || snooker ? [cell('Centuries', String(s.centuries))] : []),
          ...(!snooker
            ? [cell('Run-outs', String(s.runOuts)), cell('Break and runs', String(s.breakAndRuns))]
            : []),
          cell('Fouls', String(s.fouls), `in ${s.shots} shots`),
        );
      };
      const who = segmented(
        'Player',
        names.slice(0, 4).map((n) => ({ value: n, label: n })),
        player,
        (v) => {
          this.statsPlayer = v;
          draw();
        },
      );
      const games = segmented<MatchConfig['game'] | 'all'>(
        'Game',
        [{ value: 'all', label: 'All' }, ...MATCH_GAMES.map((g) => ({ value: g.id, label: g.label }))],
        this.statsGame,
        (v) => {
          this.statsGame = v;
          draw();
        },
      );
      draw();
      out.append(
        this.field('Player', who.el),
        this.field('Game', chooser(games.el)),
        grid,
        h(
          'p',
          { className: 'fine-print' },
          'A pot attempt is any shot but a break, push out or declared safety. A long pot starts half a table or more from the cue ball. A safety is a legal shot that pots nothing; it works when the next shot pots nothing or fouls.',
        ),
      );
    });
  }

  private replays(): HTMLElement {
    return this.async('replays', 'Replays', async (out) => {
      const { matches, highlights } = await this.cb.saved();
      const watch = (reel: Reel) => () => {
        this.close();
        this.cb.onWatch(reel);
      };
      const when = (t: number) =>
        new Date(t).toLocaleString(undefined, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
      out.append(h('h3', {}, 'Highlights'));
      if (!highlights.length)
        out.append(h('p', { className: 'empty' }, 'Save a shot from the pause menu to keep it here.'));
      for (const hl of highlights) {
        const row: HTMLElement = h(
          'div',
          { className: 'saved-row highlight' },
          h(
            'button',
            { className: 'saved-main', onclick: watch(reelOfHighlight(hl)) },
            icon('star'),
            h('span', {}, h('strong', {}, hl.title), h('small', {}, when(hl.date))),
          ),
          iconButton('trash', 'Delete highlight', () => {
            void this.cb.onDeleteHighlight(hl.id).then(() => row.remove());
          }),
        );
        out.append(row);
      }
      out.append(h('h3', {}, 'Matches'));
      const played = matches.filter((m) => m.racks.some((r) => r.shots.length));
      if (!played.length) out.append(h('p', { className: 'empty' }, 'Matches you play are kept here.'));
      for (const m of played) {
        const [a, b] = m.config.players;
        const result = m.winner === null ? 'unfinished' : `${m.config.players[m.winner]} won`;
        const frames = h('div', { className: 'saved-frames', hidden: true });
        const unit = m.config.game === 'snooker' ? 'Frame' : 'Rack';
        m.racks.forEach((r, i) => {
          if (!r.shots.length) return;
          const who = r.winner === null ? 'not finished' : `${m.config.players[r.winner]} won`;
          frames.append(
            h(
              'button',
              { className: 'chip', onclick: watch(reelOfRack(m, i)) },
              `${unit} ${i + 1} · ${who} · ${r.shots.length} shot${r.shots.length === 1 ? '' : 's'}`,
            ),
          );
        });
        out.append(
          h(
            'div',
            { className: 'saved-row match' },
            h(
              'button',
              {
                className: 'saved-main',
                ariaExpanded: 'false',
                onclick: (e: Event) => {
                  frames.hidden = !frames.hidden;
                  (e.currentTarget as HTMLElement).ariaExpanded = String(!frames.hidden);
                },
              },
              icon('replay'),
              h(
                'span',
                {},
                h('strong', {}, `${a} ${m.score[0]}–${m.score[1]} ${b}`),
                h('small', {}, `${describe(m.config)} · ${result} · ${when(m.date)}`),
              ),
            ),
            frames,
          ),
        );
      }
    });
  }

  // -------------------------------------------------------------------------------------------

  private setCloth(v: ClothSpeedId): void {
    this.cloth = v;
    this.cb.onClothSpeed(v);
  }

  private start(): void {
    save(LAST_MATCH_KEY, this.config);
    this.close();
    this.cb.onStart(structuredClone(this.config));
  }

  /** The set-up of the last match started (for Restart). */
  get lastConfig(): MatchConfig {
    return structuredClone(this.config);
  }
}

/** "Auto (Medium)": the tier Auto chose this time, if one is running. */
function autoLabel(): string {
  const t = typeof document !== 'undefined' ? document.documentElement.dataset.tier : undefined;
  return t ? `Auto (${t[0]!.toUpperCase()}${t.slice(1)})` : 'Auto';
}
