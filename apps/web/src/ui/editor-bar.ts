import { h } from './kit';

export interface EditorBarCallbacks {
  /** Tap balls to take them off the table (on), or drag them (off). */
  onRemove(on: boolean): void;
  /** Put every potted ball back on the table. */
  onSpot(): void;
  /** Take every ball but the cue ball off. */
  onClear(): void;
  onDone(): void;
}

/** Practice: arrange the balls. Drag any ball; these do the rest. */
export class EditorBar {
  readonly root = h('div', {
    className: 'editor-bar',
    hidden: true,
    role: 'toolbar',
    ariaLabel: 'Arrange balls',
  });
  private remove = h('button', { className: 'chip', type: 'button' }, 'Remove');
  private removing = false;

  constructor(cb: EditorBarCallbacks) {
    this.remove.onclick = () => {
      this.setRemoving(!this.removing);
      cb.onRemove(this.removing);
    };
    this.root.append(
      h('span', { className: 'editor-hint' }, 'Drag any ball'),
      this.remove,
      h('button', { className: 'chip', type: 'button', onclick: () => cb.onSpot() }, 'Spot potted'),
      h('button', { className: 'chip', type: 'button', onclick: () => cb.onClear() }, 'Clear'),
      h('button', { className: 'chip on', type: 'button', onclick: () => cb.onDone() }, 'Done'),
    );
  }

  show(on: boolean): void {
    if (this.root.hidden === !on) return;
    this.root.hidden = !on;
    if (!on) this.setRemoving(false);
  }

  setRemoving(on: boolean): void {
    this.removing = on;
    this.remove.classList.toggle('on', on);
    this.remove.setAttribute('aria-pressed', String(on));
  }
}
