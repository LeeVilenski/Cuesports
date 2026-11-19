import { h, iconButton } from './kit';

export interface ReplayBarCallbacks {
  onStep(delta: number): void;
  onPlay(): void;
  /** Play the remaining shots one after another (on) or stop after this one (off). */
  onAuto(on: boolean): void;
  onClose(): void;
}

/** Controls for watching saved shots: previous, play, next, play all and close. */
export class ReplayBar {
  readonly root = h('div', { className: 'replay-bar', hidden: true, role: 'toolbar', ariaLabel: 'Replay' });
  private title = h('strong', {});
  private sub = h('small', {});
  private prev: HTMLButtonElement;
  private next: HTMLButtonElement;
  private play: HTMLButtonElement;
  private auto = h('button', { className: 'chip', type: 'button' }, 'Play all');
  private autoOn = false;

  constructor(cb: ReplayBarCallbacks) {
    this.prev = iconButton('back', 'Previous shot', () => cb.onStep(-1));
    this.next = iconButton('back', 'Next shot', () => cb.onStep(1), 'flip');
    this.play = iconButton('play', 'Play this shot', () => cb.onPlay());
    this.auto.onclick = () => {
      this.setAuto(!this.autoOn);
      cb.onAuto(this.autoOn);
    };
    this.root.append(
      h('div', { className: 'replay-text' }, this.title, this.sub),
      h('div', { className: 'replay-buttons' }, this.prev, this.play, this.next, this.auto),
      iconButton('close', 'Close replay', () => cb.onClose()),
    );
  }

  show(title: string | null): void {
    this.root.hidden = title === null;
    this.title.textContent = title ?? '';
    if (title === null) this.setAuto(false);
  }

  setShot(i: number, n: number, detail: string, busy: boolean): void {
    this.sub.textContent = `Shot ${i + 1} of ${n} · ${detail}`;
    this.prev.disabled = busy || i <= 0;
    this.next.disabled = busy || i >= n - 1;
    this.play.disabled = busy;
  }

  setAuto(on: boolean): void {
    this.autoOn = on;
    this.auto.classList.toggle('on', on);
    this.auto.setAttribute('aria-pressed', String(on));
  }
}
