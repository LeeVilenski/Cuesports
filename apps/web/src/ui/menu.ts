import { DEFAULT_MATCH, type MatchConfig } from '../game/match';
import { h, icon, iconButton, load, save, segmented, stepper, toggle, type IconName } from './kit';

export type ClothSpeedId = 'fast' | 'medium' | 'slow';
export type OptionName = 'guide' | 'squirt' | 'overview';
export type Settings = Record<OptionName, boolean>;

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
  /** The menu covers the table (true) or has closed and play resumes (false). */
  onVisible(open: boolean): void;
}

type Screen = 'home' | 'play' | 'practice' | 'settings' | 'help' | 'pause';

const MATCH_GAMES: { id: MatchConfig['game']; label: string; ball: string; sub: string }[] = [
  { id: 'nine-ball', label: '9-Ball', ball: '#f2c14e', sub: '9' },
  { id: 'ten-ball', label: '10-Ball', ball: '#2f6fdc', sub: '10' },
  { id: 'english', label: 'UK 8-Ball', ball: '#d8342c', sub: '8' },
  { id: 'snooker', label: 'Snooker', ball: '#c4202b', sub: '' },
];

const LEVELS = ['Beginner', 'Amateur', 'Club', 'Semi-pro', 'Pro'];

const SETTINGS_KEY = 'cuesports.settings';
const LAST_MATCH_KEY = 'cuesports.lastMatch';

/** Short description of a match set-up, for the Quick match tile. */
function describe(c: MatchConfig): string {
  const game = MATCH_GAMES.find((g) => g.id === c.game)?.label ?? c.game;
  const who = c.ai ? `vs ${LEVELS[c.ai - 1]} CPU` : 'vs friend';
  const race = c.game === 'snooker' ? `best of ${c.raceTo * 2 - 1}` : `race to ${c.raceTo}`;
  return `${game} · ${who} · ${race}`;
}

function ballBadge(color: string, num: string): HTMLElement {
  const b = h('span', { className: 'ball-badge' }, num);
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
  private quickSub = h('small', {});

  constructor(
    private cb: MenuCallbacks,
    private practiceGames: { id: string; label: string }[],
    private cloth: ClothSpeedId,
  ) {
    this.settings = load<Settings>(SETTINGS_KEY, { guide: true, squirt: true, overview: true });
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

  open(screen: Screen, ctx: { inMatch?: boolean } = {}): void {
    if (ctx.inMatch !== undefined) this.inMatch = ctx.inMatch;
    this.stack = [];
    this.show(screen);
  }

  close(): void {
    if (this.root.hidden) return;
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
    };
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
      h(
        'div',
        { className: 'tiles' },
        this.tile('blue', 'play', 'Quick match', this.quickSub, () => this.start(), 'wide'),
        this.tile('orange', 'cue', 'Play', 'Game, opponent, format', () => this.go('play')),
        this.tile('green', 'target', 'Practice', 'Free table', () => this.go('practice')),
        this.tile('yellow', 'trophy', 'Career', 'Coming soon', null),
        this.tile('purple', 'globe', 'Online', 'Coming soon', null),
      ),
      h(
        'div',
        { className: 'utility' },
        h('button', { className: 'ubtn', onclick: () => this.go('help') }, icon('help'), 'How to play'),
        h('button', { className: 'ubtn', onclick: () => this.go('settings') }, icon('settings'), 'Settings'),
      ),
    );
  }

  private play(): HTMLElement {
    const c = this.config;
    const games = h('div', { className: 'game-pick', role: 'group', ariaLabel: 'Game' });
    const gameButtons = MATCH_GAMES.map((g) =>
      h(
        'button',
        { type: 'button', onclick: () => setGame(g.id) },
        ballBadge(g.ball, g.sub),
        h('span', {}, g.label),
      ),
    );
    games.append(...gameButtons);

    const name1 = h('input', { type: 'text', value: c.players[0], maxLength: 16, ariaLabel: 'Player 1 name' });
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
      toggle('Three fouls lose the rack', c.rules.threeFoulRule, (on) => (c.rules = { ...c.rules, threeFoulRule: on })),
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
    const rules = h(
      'details',
      { className: 'rules' },
      h('summary', {}, icon('settings'), 'Rules'),
      poolRules,
      snookerRules,
      englishRules,
    );

    const setGame = (id: MatchConfig['game']) => {
      c.game = id;
      gameButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(MATCH_GAMES[i]!.id === id)));
      const snooker = id === 'snooker';
      raceLabel.textContent = snooker ? 'Frames to win' : 'Race to';
      poolRules.hidden = snooker || id === 'english';
      snookerRules.hidden = !snooker;
      englishRules.hidden = id !== 'english';
    };
    setGame(c.game);
    showOpponent();

    const start = () => {
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
        h('div', { className: 'field' }, raceLabel, race.el),
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
              h('span', {}, g.label.replace(/^Practice: /, '')),
            );
          }),
        ),
        this.field('Cloth', cloth.el),
      ),
    );
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
        h('h3', {}, 'Camera'),
        opt('overview', 'Rise to overview during shots'),
        h('h3', {}, 'Table'),
        this.field('Cloth', cloth.el),
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
        row('cue', 'Pull the power bar down and let go to shoot.'),
        row('target', 'Tap the cue ball (bottom right) for spin and elevation.'),
        row('camera', 'Tap the camera to switch views. Pinch to zoom.'),
        row('undo', 'Undo and replay: bottom left.'),
        h('p', { className: 'fine-print' }, 'Keys: ← → aim (Shift: bigger steps), ↑ ↓ tilt, Space shoots.'),
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
          ? this.tile('orange', 'flag', 'Concede', 'Give up this rack', done(() => this.cb.onConcede()))
          : this.tile('green', 'grid', 'Change game', 'Practice tables', () => this.go('practice')),
        this.tile(
          'navy',
          'restart',
          this.inMatch ? 'Restart' : 'Re-rack',
          this.inMatch ? 'New match, same set-up' : 'Fresh balls',
          done(() => this.cb.onRestart()),
        ),
        this.tile('navy', 'settings', 'Settings', '', () => this.go('settings')),
        this.tile('navy', 'home', 'Home', '', () => {
          this.cb.onQuit();
          this.open('home');
        }),
      ),
    );
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
