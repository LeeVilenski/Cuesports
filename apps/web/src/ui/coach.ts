import { h } from './kit';
import { STEPS, type Step } from '../game/tutorial';

/** The tutorial's card at the top of the table: the step, what to do, and a way out. */
export class Coach {
  readonly root = h('div', { className: 'coach', hidden: true, role: 'status', ariaLive: 'polite' });

  constructor(private cb: { onSkip(): void; onPractice(): void; onHome(): void }) {}

  show(step: Step, index: number): void {
    this.root.hidden = false;
    const last = step.id === 'done';
    const dots = h(
      'div',
      { className: 'coach-dots', ariaHidden: 'true' },
      ...STEPS.slice(0, -1).map((_, i) =>
        h('span', { className: i < index ? 'on' : i === index ? 'now' : '' }),
      ),
    );
    const actions = last
      ? h(
          'div',
          { className: 'coach-actions' },
          h('button', { className: 'coach-btn', onclick: () => this.cb.onPractice() }, 'Free practice'),
          h('button', { className: 'coach-btn primary', onclick: () => this.cb.onHome() }, 'Home'),
        )
      : h('button', { className: 'coach-skip', onclick: () => this.cb.onSkip() }, 'Skip tutorial');
    this.root.replaceChildren(
      h('div', { className: 'coach-head' }, h('strong', {}, step.title), last ? '' : dots),
      h('p', {}, step.text),
      actions,
    );
    this.root.classList.remove('pop');
    void this.root.offsetWidth;
    this.root.classList.add('pop');
  }

  hide(): void {
    this.root.hidden = true;
  }
}
