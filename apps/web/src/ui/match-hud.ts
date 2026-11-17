import type { Turn } from '@cuesports/rules';
import { ballArt } from '../render/textures';
import { DEFAULT_MATCH, type MatchConfig } from '../game/match';

export type CallChoice = { ball: string; pocket: string } | 'safety' | null;

export interface MatchHudCallbacks {
  onPushOut(on: boolean): void;
  /** The player picked a call by hand (null = go back to calling automatically from the aim). */
  onCall(call: CallChoice): void;
  onDecision(choice: string): void;
  onNextRack(): void;
  onStart(config: MatchConfig): void;
  onPractice(): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
};

/** What a snooker player is on, in words. */
function onLabel(turn: Turn): string {
  if (turn.mustNominate) return 'a colour';
  if (turn.targets.length > 1 && turn.targets.every((t) => t.startsWith('red'))) return 'red';
  return turn.targets[0] ?? '';
}

/** Scoreboard, shot messages and the match sheets (setup, push-out decision, rack result). */
export class MatchHud {
  readonly root = h('div', { className: 'match-hud' });
  private board = h('div', { className: 'scoreboard', hidden: true });
  private toast = h('div', { className: 'toast', role: 'status', hidden: true });
  private pushBtn = h('button', { className: 'chip push', hidden: true }, 'Push out');
  private callBtn = h('button', { className: 'chip call', hidden: true, ariaLabel: 'Called shot' });
  private picker = h('div', { className: 'sheet call-sheet', hidden: true });
  private decision = h('div', { className: 'sheet decision-sheet', hidden: true });
  private result = h('div', { className: 'sheet result-sheet', hidden: true });
  private setup = h('div', { className: 'sheet setup-sheet', hidden: true });
  private toastTimer = 0;
  private pushOn = false;

  constructor(private cb: MatchHudCallbacks) {
    this.pushBtn.addEventListener('click', () => {
      this.pushOn = !this.pushOn;
      this.pushBtn.classList.toggle('on', this.pushOn);
      cb.onPushOut(this.pushOn);
    });
    this.root.append(
      this.board,
      this.toast,
      this.pushBtn,
      this.callBtn,
      this.decision,
      this.result,
      this.setup,
      this.picker,
    );
    this.buildSetup();
  }

  /** Shows the scoreboard for the current turn, or hides it (practice). */
  showBoard(
    info: {
      players: [string, string];
      score: [number, number];
      raceTo: number;
      turn: Turn;
      /** Snooker: points in the frame, current break, points remaining. */
      frame?: { points: [number, number]; break: number; remaining: number } | null;
    } | null,
  ): void {
    this.board.hidden = info === null;
    if (!info) return;
    const { players, score, raceTo, turn, frame } = info;
    const side = (i: number) =>
      h(
        'div',
        { className: `side${turn.player === i ? ' active' : ''}` },
        h('span', { className: 'name' }, players[i]!),
        frame ? h('span', { className: 'frames', title: 'Frames' }, `(${score[i]})`) : '',
        h('span', { className: 'score' }, String(frame ? frame.points[i] : score[i])),
        turn.player === i && turn.fouls > 0
          ? h('span', { className: 'fouls', title: 'Fouls in a row' }, '●'.repeat(turn.fouls))
          : '',
      );
    const target = turn.targets[0];
    const art = target ? ballArt(target) : null;
    const on = target
      ? h(
          'span',
          { className: 'ball-on', title: `Ball on: the ${target}` },
          (() => {
            const dot = h('span', { className: 'dot' }, target);
            dot.style.setProperty('--c', art!.stripe ?? art!.base);
            return dot;
          })(),
        )
      : '';
    const mid = frame
      ? h(
          'div',
          { className: 'mid' },
          h('small', {}, `best of ${raceTo * 2 - 1}`),
          h(
            'small',
            {},
            frame.break > 0 ? `break ${frame.break}` : turn.freeBall ? 'free ball' : `on: ${onLabel(turn)}`,
          ),
          h('small', {}, `${frame.remaining} left`),
        )
      : h(
          'div',
          { className: 'mid' },
          h('small', {}, `race to ${raceTo}`),
          on,
          (turn.visits ?? 1) > 1 ? h('small', {}, `${turn.visits} visits`) : '',
        );
    this.board.replaceChildren(side(0), mid, side(1));
  }

  setPushAvailable(can: boolean): void {
    this.pushBtn.hidden = !can;
    if (!can && this.pushOn) {
      this.pushOn = false;
      this.pushBtn.classList.remove('on');
    }
  }

  /** Shows the current call (or hides the chip when the shot needs no call). */
  showCall(call: CallChoice, manual: boolean, label: (pocket: string) => string, visible: boolean): void {
    this.callBtn.hidden = !visible;
    if (!visible) return;
    this.callBtn.textContent =
      call === 'safety'
        ? 'Call: safety'
        : call
          ? `Call: ${call.ball} → ${label(call.pocket)}${manual ? '' : ' (auto)'}`
          : 'Call a shot';
    this.callBtn.classList.toggle('on', manual);
  }

  /** Shows the nominated ball (snooker) on the call chip. */
  showNomination(ball: string | null, manual: boolean, visible: boolean): void {
    this.callBtn.hidden = !visible;
    if (!visible) return;
    this.callBtn.textContent = ball ? `Nominate: ${ball}${manual ? '' : ' (auto)'}` : 'Nominate a ball';
    this.callBtn.classList.toggle('on', manual);
  }

  /** Lets the player nominate a ball (snooker). */
  openNominatePicker(balls: string[], onPick: (ball: string | null) => void): void {
    const done = (b: string | null) => {
      this.picker.hidden = true;
      onPick(b);
    };
    this.picker.replaceChildren(
      h('h2', {}, 'Nominate a ball'),
      h(
        'div',
        { className: 'row wrap' },
        ...balls.map((b) => h('button', { className: 'chip', onclick: () => done(b) }, b)),
      ),
      h(
        'div',
        { className: 'row' },
        h('button', { className: 'chip', onclick: () => done(null) }, 'Auto from aim'),
        h('button', { className: 'chip', onclick: () => (this.picker.hidden = true) }, 'Cancel'),
      ),
    );
    this.picker.hidden = false;
  }

  /** Lets the player pick a ball and pocket, or a safety. */
  openCallPicker(balls: string[], pockets: { id: string; label: string }[]): void {
    let ball: string | null = null;
    const pocketRow = h('div', { className: 'row wrap' });
    const ballRow = h('div', { className: 'row wrap' });
    const done = (c: CallChoice) => {
      this.picker.hidden = true;
      this.cb.onCall(c);
    };
    const showPockets = () => {
      pocketRow.replaceChildren(
        ...pockets.map((p) =>
          h(
            'button',
            {
              className: 'chip',
              disabled: ball === null,
              onclick: () => ball && done({ ball, pocket: p.id }),
            },
            p.label,
          ),
        ),
      );
    };
    ballRow.append(
      ...balls.map((b) =>
        h(
          'button',
          {
            className: 'chip',
            onclick: (e: MouseEvent) => {
              ball = b;
              for (const x of ballRow.children) x.classList.remove('on');
              (e.currentTarget as HTMLElement).classList.add('on');
              showPockets();
            },
          },
          b,
        ),
      ),
    );
    showPockets();
    this.picker.replaceChildren(
      h('h2', {}, 'Call your shot'),
      h('p', { className: 'help' }, 'Pick a ball, then a pocket.'),
      ballRow,
      pocketRow,
      h(
        'div',
        { className: 'row' },
        h('button', { className: 'chip', onclick: () => done('safety') }, 'Safety'),
        h('button', { className: 'chip', onclick: () => done(null) }, 'Auto from aim'),
        h('button', { className: 'chip', onclick: () => (this.picker.hidden = true) }, 'Cancel'),
      ),
    );
    this.picker.hidden = false;
  }

  onCallClick(handler: () => void): void {
    this.callBtn.addEventListener('click', handler);
  }

  get pushOut(): boolean {
    return this.pushOn && !this.pushBtn.hidden;
  }

  say(text: string, ms = 4500): void {
    this.toast.textContent = text;
    this.toast.hidden = !text;
    window.clearTimeout(this.toastTimer);
    if (text) this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), ms);
  }

  showDecision(prompt: string | null, choices: { id: string; label: string }[] = []): void {
    this.decision.hidden = prompt === null;
    if (prompt === null) return;
    this.decision.replaceChildren(
      h('p', {}, prompt),
      h(
        'div',
        { className: 'row' },
        ...choices.map((c) =>
          h('button', { className: 'chip', onclick: () => this.cb.onDecision(c.id) }, c.label),
        ),
      ),
    );
  }

  showResult(title: string | null, detail = '', matchOver = false): void {
    this.result.hidden = title === null;
    if (title === null) return;
    this.result.replaceChildren(
      h('h2', {}, title),
      h('p', {}, detail),
      h(
        'div',
        { className: 'row' },
        matchOver
          ? h('button', { className: 'chip on', onclick: () => this.openSetup() }, 'New match')
          : h('button', { className: 'chip on', onclick: () => this.cb.onNextRack() }, 'Next rack'),
        h('button', { className: 'chip', onclick: () => this.cb.onPractice() }, 'Practice'),
      ),
    );
  }

  openSetup(): void {
    this.result.hidden = true;
    this.setup.hidden = false;
  }

  private buildSetup(): void {
    const name1 = h('input', {
      type: 'text',
      value: DEFAULT_MATCH.players[0],
      maxLength: 16,
      ariaLabel: 'Player 1 name',
    });
    const name2 = h('input', {
      type: 'text',
      value: DEFAULT_MATCH.players[1],
      maxLength: 16,
      ariaLabel: 'Player 2 name',
    });
    const race = h('select', { ariaLabel: 'Race to' });
    for (const n of [1, 2, 3, 4, 5, 7, 9, 11])
      race.append(h('option', { value: String(n), selected: n === DEFAULT_MATCH.raceTo }, String(n)));
    const breaks = h('select', { ariaLabel: 'Break' });
    breaks.append(
      h('option', { value: 'alternate' }, 'Alternate breaks'),
      h('option', { value: 'winner' }, 'Winner breaks'),
    );
    const threeFoul = h('input', { type: 'checkbox', checked: DEFAULT_MATCH.rules.threeFoulRule });
    const game = h('select', { ariaLabel: 'Game type' });
    game.append(
      h('option', { value: 'nine-ball' }, '9-ball'),
      h('option', { value: 'ten-ball' }, '10-ball (call shot)'),
      h('option', { value: 'snooker' }, 'Snooker'),
      h('option', { value: 'english' }, 'English pool'),
    );
    const preset = h('select', { ariaLabel: 'Rules' });
    preset.append(
      h('option', { value: 'international' }, 'International / Ultimate Pool'),
      h('option', { value: 'wepf' }, 'World Eightball (WEPF / EPA)'),
    );
    const englishOpts = h('div', { hidden: true });
    englishOpts.append(h('div', { className: 'row' }, h('label', {}, 'Rules'), preset));
    const reds = h('select', { ariaLabel: 'Reds' });
    for (const n of [15, 10, 6]) reds.append(h('option', { value: String(n) }, `${n} reds`));
    const missRule = h('input', { type: 'checkbox', checked: true });
    const poolOpts = h('div');
    const snookerOpts = h('div', { hidden: true });
    const start = () => {
      this.setup.hidden = true;
      this.cb.onStart({
        snooker: {
          ...DEFAULT_MATCH.snooker,
          reds: Number(reds.value) as 15 | 10 | 6,
          missRule: missRule.checked,
        },
        english: preset.value as MatchConfig['english'],
        game: game.value as MatchConfig['game'],
        players: [name1.value.trim() || 'Player 1', name2.value.trim() || 'Player 2'],
        raceTo: Number(race.value),
        breaks: breaks.value as MatchConfig['breaks'],
        rules: { ...DEFAULT_MATCH.rules, threeFoulRule: threeFoul.checked },
      });
    };
    poolOpts.append(
      h('div', { className: 'row' }, h('label', {}, 'Break'), breaks),
      h('label', { className: 'check' }, threeFoul, ' Three fouls in a row lose the rack'),
    );
    snookerOpts.append(
      h('div', { className: 'row' }, h('label', {}, 'Reds'), reds),
      h(
        'label',
        { className: 'check' },
        missRule,
        ' Miss rule (pro): always call a miss when the ball on is not hit',
      ),
    );
    const raceLabel = h('label', {}, 'Race to');
    game.addEventListener('change', () => {
      const snooker = game.value === 'snooker';
      poolOpts.hidden = snooker || game.value === 'english';
      snookerOpts.hidden = !snooker;
      englishOpts.hidden = game.value !== 'english';
      raceLabel.textContent = snooker ? 'Frames to win' : 'Race to';
    });
    this.setup.append(
      h('h2', {}, 'New match'),
      h('div', { className: 'row' }, h('label', {}, 'Game'), game),
      h('div', { className: 'row' }, h('label', {}, 'Player 1'), name1),
      h('div', { className: 'row' }, h('label', {}, 'Player 2'), name2),
      h('div', { className: 'row' }, raceLabel, race),
      poolOpts,
      snookerOpts,
      englishOpts,
      h(
        'p',
        { className: 'help' },
        'Rules: WPA (9-ball, 10-ball), WPBSA (snooker), International or WEPF (English pool). Two players on this device: pass it over when the turn changes.',
      ),
      h(
        'div',
        { className: 'row' },
        h('button', { className: 'chip on', onclick: start }, 'Start'),
        h('button', { className: 'chip', onclick: () => (this.setup.hidden = true) }, 'Cancel'),
      ),
    );
  }
}
