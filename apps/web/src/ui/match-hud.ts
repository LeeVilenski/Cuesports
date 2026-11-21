import type { Turn } from '@cuesports/rules';
import { ballArt } from '../render/textures';
import { h } from './kit';

export type CallChoice = { ball: string; pocket: string } | 'safety' | null;

export interface MatchHudCallbacks {
  onPushOut(on: boolean): void;
  /** The player picked a call by hand (null = go back to calling automatically from the aim). */
  onCall(call: CallChoice): void;
  onDecision(choice: string): void;
  onNextRack(): void;
  /** Match over: set up another. */
  onNewMatch(): void;
  onHome(): void;
  /** Watch the rack or frame just finished, shot by shot. */
  onWatch(): void;
  /** The result sheet's second choice, when it has one (a challenge's Retry). */
  onAlt(): void;
}

/** What a snooker player is on, in words. */
function onLabel(turn: Turn): string {
  if (turn.mustNominate) return 'a colour';
  if (turn.targets.length > 1 && turn.targets.every((t) => t.startsWith('red'))) return 'red';
  return turn.targets[0] ?? '';
}

/** Scoreboard, shot messages and the match sheets (setup, push-out decision, rack result). */
export class MatchHud {
  readonly root = h('div', { className: 'match-hud' });
  /** The scoreboard; the game places it in the top bar. */
  readonly board = h('div', { className: 'scoreboard', hidden: true });
  private toast = h('div', { className: 'toast', role: 'status', hidden: true, title: 'Tap to hide' });
  private pushBtn = h('button', { className: 'chip push', hidden: true }, 'Push out');
  private callBtn = h('button', { className: 'chip call', hidden: true, ariaLabel: 'Called shot' });
  private picker = h('div', { className: 'pick-bar', hidden: true });
  private decision = h('div', { className: 'sheet decision-sheet', hidden: true });
  private result = h('div', { className: 'sheet result-sheet', hidden: true });
  private toastTimer = 0;
  private pushOn = false;

  constructor(private cb: MatchHudCallbacks) {
    this.pushBtn.addEventListener('click', () => {
      this.pushOn = !this.pushOn;
      this.pushBtn.classList.toggle('on', this.pushOn);
      cb.onPushOut(this.pushOn);
    });
    this.toast.addEventListener('click', () => (this.toast.hidden = true));
    this.root.append(this.toast, this.pushBtn, this.callBtn, this.decision, this.result, this.picker);
  }

  /** Shows the scoreboard for the current turn, or hides it (practice). */
  showBoard(
    info: {
      players: [string, string];
      score: [number, number];
      raceTo: number;
      turn: Turn;
      /** Snooker: points in the frame, current break, points remaining. */
      frame?: { points: [number, number]; break: number; remaining: number | null } | null;
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
          h('small', {}, frame.remaining === null ? `race to ${raceTo}` : `best of ${raceTo * 2 - 1}`),
          h(
            'small',
            {},
            frame.break > 0
              ? `break ${frame.break}`
              : frame.remaining === null
                ? (
                    { spot: 'spot white', yellow: 'yellow', cue: 'white', pcue: 'first to 8' } as Record<
                      string,
                      string
                    >
                  )[turn.cueBall ?? 'cue']!
                : turn.freeBall
                  ? 'free ball'
                  : `on: ${onLabel(turn)}`,
          ),
          frame.remaining === null ? '' : h('small', {}, `${frame.remaining} left`),
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

  /**
   * Shows the slim bar used while picking a ball/pocket on the table (top-down view), or hides it
   * when `text` is null. The table itself stays visible and clickable.
   */
  showPickBar(text: string | null, actions: { label: string; run: () => void }[] = []): void {
    this.picker.hidden = text === null;
    if (text === null) return;
    this.picker.replaceChildren(
      h('p', { className: 'help' }, text),
      h(
        'div',
        { className: 'row wrap' },
        ...actions.map((a) => h('button', { className: 'chip', onclick: a.run }, a.label)),
      ),
    );
  }

  onCallClick(handler: () => void): void {
    this.callBtn.addEventListener('click', handler);
  }

  get pushOut(): boolean {
    return this.pushOn && !this.pushBtn.hidden;
  }

  say(text: string, ms = 3500): void {
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

  /** `again` labels the main button once the match is over (a drill says "Go again"). */
  showResult(
    title: string | null,
    detail = '',
    matchOver = false,
    again = 'New match',
    alt: string | null = null,
  ): void {
    this.result.hidden = title === null;
    if (title === null) return;
    this.result.replaceChildren(
      h('h2', {}, title),
      h('p', {}, detail),
      h(
        'div',
        { className: 'row wrap result-actions' },
        matchOver
          ? h('button', { className: 'chip on', onclick: () => this.cb.onNewMatch() }, again)
          : h('button', { className: 'chip on', onclick: () => this.cb.onNextRack() }, 'Next rack'),
        alt ? h('button', { className: 'chip', onclick: () => this.cb.onAlt() }, alt) : '',
        h('button', { className: 'chip watch', onclick: () => this.cb.onWatch() }, 'Watch again'),
        h('button', { className: 'chip', onclick: () => this.cb.onHome() }, 'Home'),
      ),
    );
  }
}
