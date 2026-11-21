import { CHALLENGES, loadStars, starText } from '../game/challenges';
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
  tierOpen,
  unlockedBy,
  VENUES,
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
export type OptionName = 'guide' | 'squirt' | 'player' | 'labels' | 'haptics' | 'calm';
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
  /** Enter a career event (abandoning any other in progress). */
  onCareerEnter(event: string): void;
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
      career: () => this.careerScreen(),
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
        this.tile('yellow', 'trophy', 'Career', 'Pub to arena', () => this.go('career')),
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
      String(c.billiards?.target ?? 100),
      (v) => (c.billiards = { target: Number(v) }),
    );
    const billiardsRules = this.field('Points to win a game', target.el);
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
      billiardsRules,
      caromRules,
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
      raceField.hidden = straight;
      straightField.hidden = !straight;
      rules.hidden = straight;
      snookerRules.hidden = !snooker;
      englishRules.hidden = id !== 'english';
      billiardsRules.hidden = id !== 'billiards';
    };
    setGame(c.game);
    showOpponent();

    const start = () => {
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
          b.title = `Win the ${unlockedBy(key)?.title ?? 'career'} to unlock`;
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

  private careerScreen(): HTMLElement {
    const s = this.cb.career();
    const colours = ['blue', 'orange', 'green', 'red', 'purple', 'teal'];
    const run = s.run?.status === 'playing' ? s.run : null;
    const body = h('div', { className: 'scroll' });
    if (run) {
      const e = careerEvent(run.event)!;
      body.append(
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
    }
    let colour = 0;
    for (const v of VENUES) {
      const open = tierOpen(s, v.tier);
      body.append(h('h3', {}, `${v.kind} · ${v.name}`));
      const tiles = h('div', { className: 'tiles' });
      for (const e of EVENTS.filter((x) => x.venue === v.id)) {
        const game = MATCH_GAMES.find((g) => g.id === e.game)?.label ?? e.game;
        const prize = REWARDS[e.reward];
        const sub = `${game} · ${2 ** rounds(e)} players · ${bestText(e, s.best[e.id])}${prize ? ` · Prize: ${prize}` : ''}`;
        tiles.append(
          this.tile(
            colours[colour++ % colours.length]!,
            'trophy',
            e.title,
            sub,
            open
              ? () => {
                  if (run?.event !== e.id) this.cb.onCareerEnter(e.id);
                  this.go('event');
                }
              : null,
            'wide',
          ),
        );
      }
      if (!open) {
        const below = VENUES.find((x) => x.tier === v.tier - 1);
        tiles.append(
          h(
            'p',
            { className: 'fine-print' },
            `Win an event at ${below?.name ?? 'the venue below'} to play here.`,
          ),
        );
      }
      body.append(tiles);
    }
    // Rivals: one per tier, waiting in the finals.
    body.append(h('h3', {}, 'Rivals'));
    const seen = new Set<string>();
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
          h('span', {}, `${o.style} · ${venue.kind}`),
          h('small', {}, w + l ? `You ${w}–${l}` : 'Not met yet'),
        ),
      );
    }
    return h('div', { className: 'sub career' }, this.header('Career'), body);
  }

  /** The event you're in: the bracket so far and your next match. */
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
        h('small', {}, `Race to ${e.raceTo[r]}`),
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
            { className: 'tile cta', onclick: () => this.open('career') },
            h('strong', {}, 'Back to the circuit'),
          );
    const status =
      run.status === 'won'
        ? h('p', { className: 'event-status won' }, `Champion! Unlocked: ${REWARDS[e.reward] ?? ''}.`)
        : run.status === 'out'
          ? h(
              'p',
              { className: 'event-status' },
              `Out in the ${roundName(e, run.round).toLowerCase()}. Enter again from the circuit.`,
            )
          : opp
            ? h(
                'p',
                { className: 'event-status' },
                h('strong', {}, `Next: ${opponent(opp.id).name}`),
                ` · ${opponent(opp.id).style}${opp.id === e.rival ? ' · your rival' : ''}`,
              )
            : '';
    return h(
      'div',
      { className: 'sub event' },
      this.header(e.title),
      h('div', { className: 'scroll' }, status, bracket),
      action,
    );
  }

  /** Effects and room-tone levels, saved as they change. */
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
    const set = (k: 'effects' | 'ambience') => (v: string) => {
      s[k] = Number(v);
      s.muted = false;
      this.cb.onSound({ ...s });
    };
    return [
      this.field('Effects', segmented('Sound effects', levels, near(s.effects), set('effects')).el),
      this.field('Room', segmented('Room sound', levels, near(s.ambience), set('ambience')).el),
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
