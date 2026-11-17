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
    } | null,
  ): void {
    this.board.hidden = info === null;
    if (!info) return;
    const { players, score, raceTo, turn } = info;
    const side = (i: number) =>
      h(
        'div',
        { className: `side${turn.player === i ? ' active' : ''}` },
        h('span', { className: 'name' }, players[i]!),
        h('span', { className: 'score' }, String(score[i])),
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
    this.board.replaceChildren(
      side(0),
      h('div', { className: 'mid' }, h('small', {}, `race to ${raceTo}`), on),
      side(1),
    );
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
    );
    const start = () => {
      this.setup.hidden = true;
      this.cb.onStart({
        game: game.value as MatchConfig['game'],
        players: [name1.value.trim() || 'Player 1', name2.value.trim() || 'Player 2'],
        raceTo: Number(race.value),
        breaks: breaks.value as MatchConfig['breaks'],
        rules: { ...DEFAULT_MATCH.rules, threeFoulRule: threeFoul.checked },
      });
    };
    this.setup.append(
      h('h2', {}, 'New match'),
      h('div', { className: 'row' }, h('label', {}, 'Game'), game),
      h('div', { className: 'row' }, h('label', {}, 'Player 1'), name1),
      h('div', { className: 'row' }, h('label', {}, 'Player 2'), name2),
      h('div', { className: 'row' }, h('label', {}, 'Race to'), race),
      h('div', { className: 'row' }, h('label', {}, 'Break'), breaks),
      h('label', { className: 'check' }, threeFoul, ' Three fouls in a row lose the rack'),
      h(
        'p',
        { className: 'help' },
        'WPA rules. Two players on this device: pass it over when the turn changes.',
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
