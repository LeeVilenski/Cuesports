import type { CameraMode } from '../render/cameras';

export interface HudCallbacks {
  onCamera(mode: CameraMode): void;
  /** Power while pulling the bar (0–1), or null when released without shooting. */
  onPull(p: number | null): void;
  onShoot(p: number): void;
  onFineAim(dxPx: number): void;
  onTip(a: number, b: number): void;
  onElevation(deg: number): void;
  onPlaceToggle(on: boolean): void;
  onReplay(): void;
  onUndo(): void;
  onGame(id: string): void;
  onRerack(): void;
  onClothSpeed(speed: 'fast' | 'medium' | 'slow'): void;
  onOption(name: 'guide' | 'overview', on: boolean): void;
}

export interface GameOption {
  id: string;
  label: string;
}

/** The tip can go up to just inside the miscue limit (0.55 R in DEFAULT_CUE). */
const MAX_TIP = 0.52;
const MISCUE_RING = 0.55;

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

/** Touch-first HUD overlaid on the canvas. Layout adapts to portrait and landscape in CSS. */
export class Hud {
  readonly root = h('div', { className: 'hud' });
  private status = h('div', { className: 'status' });
  private camButtons = new Map<CameraMode, HTMLButtonElement>();
  private powerFill = h('div', { className: 'power-fill' });
  private powerMark = h('div', { className: 'power-mark' });
  private powerLabel = h('div', { className: 'power-label' }, 'Pull down');
  private spinMini = h('canvas', {
    className: 'spin-mini',
    width: 120,
    height: 120,
    ariaLabel: 'Spin and elevation',
  });
  private spinBig = h('canvas', {
    className: 'spin-big',
    width: 360,
    height: 360,
    ariaLabel: 'Tip position',
  });
  private spinPanel = h('div', { className: 'sheet spin-sheet', hidden: true });
  private menu = h('div', { className: 'sheet menu-sheet', hidden: true });
  private elevInput = h('input', { type: 'range', min: '0', max: '60', step: '0.5', value: '0' });
  private elevOut = h('output', {}, '0°');
  private placeBtn = h('button', { className: 'chip' }, 'Move cue ball');
  private gameSelect = h('select', { ariaLabel: 'Game' });
  private clothSelect = h('select', { ariaLabel: 'Cloth speed' });
  private tip = { a: 0, b: 0 };
  private elevation = 0;
  private placing = false;
  private lastPower = 0.4;

  constructor(
    private cb: HudCallbacks,
    games: GameOption[],
    clothSpeeds: GameOption[],
  ) {
    for (const g of games) this.gameSelect.append(h('option', { value: g.id }, g.label));
    for (const c of clothSpeeds) this.clothSelect.append(h('option', { value: c.id }, c.label));
    this.clothSelect.addEventListener('change', () =>
      cb.onClothSpeed(this.clothSelect.value as 'fast' | 'medium' | 'slow'),
    );

    const cams = h('div', { className: 'cams', role: 'group', ariaLabel: 'Camera' });
    for (const [mode, label] of [
      ['aim', 'Aim'],
      ['top', 'Top'],
      ['free', 'Free'],
    ] as const) {
      const b = h('button', { onclick: () => cb.onCamera(mode) }, label);
      this.camButtons.set(mode, b);
      cams.append(b);
    }

    const top = h(
      'div',
      { className: 'top' },
      h('button', { className: 'icon', ariaLabel: 'Menu', onclick: () => this.toggle(this.menu) }, '☰'),
      this.status,
      cams,
    );

    // Power bar: pull down from anywhere on it, release to strike; drag back to the top to cancel.
    const power = h(
      'div',
      { className: 'power', ariaLabel: 'Power: pull down and release to shoot' },
      this.powerMark,
      this.powerFill,
      this.powerLabel,
    );
    let startY = 0;
    let pulling = false;
    let p = 0;
    power.addEventListener('pointerdown', (e) => {
      power.setPointerCapture(e.pointerId);
      startY = e.clientY;
      pulling = true;
      p = 0;
      this.showPower(0);
      cb.onPull(0);
    });
    power.addEventListener('pointermove', (e) => {
      if (!pulling) return;
      const range = power.getBoundingClientRect().height * 0.9;
      p = Math.max(0, Math.min(1, (e.clientY - startY) / range));
      this.showPower(p);
      cb.onPull(p);
    });
    const release = (cancel: boolean) => {
      if (!pulling) return;
      pulling = false;
      this.showPower(0);
      if (!cancel && p > 0.02) {
        this.lastPower = p;
        this.powerMark.style.setProperty('--p', String(p));
        cb.onShoot(p);
      } else cb.onPull(null);
    };
    power.addEventListener('pointerup', () => release(false));
    power.addEventListener('pointercancel', () => release(true));

    // Fine aim strip: drags here turn the aim 15× more slowly.
    const fine = h(
      'div',
      { className: 'fine', ariaLabel: 'Fine aim: drag sideways' },
      h('span', {}, '◀  fine aim  ▶'),
    );
    let fx = 0;
    let fineDown = false;
    fine.addEventListener('pointerdown', (e) => {
      fine.setPointerCapture(e.pointerId);
      fx = e.clientX;
      fineDown = true;
    });
    fine.addEventListener('pointermove', (e) => {
      if (!fineDown) return;
      cb.onFineAim(e.clientX - fx);
      fx = e.clientX;
    });
    fine.addEventListener('pointerup', () => (fineDown = false));
    fine.addEventListener('pointercancel', () => (fineDown = false));

    // Spin: mini ball opens a sheet with a big ball and the elevation slider.
    this.spinMini.addEventListener('click', () => this.toggle(this.spinPanel));
    const setTip = (e: PointerEvent) => {
      const r = this.spinBig.getBoundingClientRect();
      let a = ((e.clientX - r.left) / r.width) * 2 - 1;
      let b = -(((e.clientY - r.top) / r.height) * 2 - 1);
      // Keep the tip just inside the miscue limit (the dashed ring).
      const l = Math.hypot(a, b);
      if (l > MAX_TIP) {
        a = (a / l) * MAX_TIP;
        b = (b / l) * MAX_TIP;
      }
      this.tip = { a: Math.round(a * 50) / 50, b: Math.round(b * 50) / 50 };
      cb.onTip(this.tip.a, this.tip.b);
      this.drawSpin();
    };
    this.spinBig.addEventListener('pointerdown', (e) => {
      this.spinBig.setPointerCapture(e.pointerId);
      setTip(e);
    });
    this.spinBig.addEventListener('pointermove', (e) => e.buttons && setTip(e));
    this.elevInput.addEventListener('input', () => {
      this.elevation = Number(this.elevInput.value);
      this.elevOut.textContent = `${this.elevation}°`;
      cb.onElevation(this.elevation);
      this.drawSpin();
    });
    this.spinPanel.append(
      this.spinBig,
      h('div', { className: 'row' }, h('label', {}, 'Cue elevation'), this.elevInput, this.elevOut),
      h(
        'div',
        { className: 'row' },
        h(
          'button',
          {
            className: 'chip',
            onclick: () => {
              this.tip = { a: 0, b: 0 };
              this.elevation = 0;
              this.elevInput.value = '0';
              this.elevOut.textContent = '0°';
              cb.onTip(0, 0);
              cb.onElevation(0);
              this.drawSpin();
            },
          },
          'Reset',
        ),
        h('button', { className: 'chip', onclick: () => this.toggle(this.spinPanel) }, 'Done'),
      ),
    );

    this.placeBtn.addEventListener('click', () => {
      this.placing = !this.placing;
      this.placeBtn.classList.toggle('on', this.placing);
      cb.onPlaceToggle(this.placing);
    });
    const actions = h(
      'div',
      { className: 'actions' },
      this.placeBtn,
      h('button', { className: 'chip', onclick: () => cb.onReplay() }, 'Replay'),
      h('button', { className: 'chip', onclick: () => cb.onUndo() }, 'Undo'),
    );

    const check = (name: 'guide' | 'overview', label: string, on: boolean) => {
      const input = h('input', { type: 'checkbox', checked: on });
      input.addEventListener('change', () => cb.onOption(name, input.checked));
      return h('label', { className: 'check' }, input, ' ', label);
    };
    this.gameSelect.addEventListener('change', () => cb.onGame(this.gameSelect.value));
    this.menu.append(
      h('h2', {}, 'Cuesports prototype'),
      h('div', { className: 'row' }, h('label', {}, 'Game'), this.gameSelect),
      h('div', { className: 'row' }, h('label', {}, 'Cloth speed'), this.clothSelect),
      h('button', { className: 'chip', onclick: () => cb.onRerack() }, 'Re-rack'),
      check('guide', 'Aiming guide', true),
      check('overview', 'Rise to an overview during the shot', true),
      h(
        'p',
        { className: 'help' },
        'Drag on the table to aim (slow drags are finer). Use the strip at the bottom for fine aim. ',
        'Pull the power bar down and let go to shoot. Pinch or scroll to zoom; drag two fingers up or down to tilt. ',
        'Keys: ← → aim (Shift for bigger steps), ↑ ↓ tilt, Space shoots at the last power.',
      ),
      h('p', {}, h('a', { href: '/lab/' }, 'Open the 2D physics lab')),
      h('button', { className: 'chip', onclick: () => this.toggle(this.menu) }, 'Close'),
    );

    this.root.append(top, power, fine, this.spinMini, actions, this.spinPanel, this.menu);
    this.powerMark.style.setProperty('--p', String(this.lastPower));
    this.drawSpin();
  }

  get power(): number {
    return this.lastPower;
  }

  setGame(id: string): void {
    this.gameSelect.value = id;
  }

  setClothSpeed(id: string): void {
    this.clothSelect.value = id;
  }

  setCamera(mode: CameraMode): void {
    for (const [m, b] of this.camButtons) b.classList.toggle('on', m === mode);
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  setPlacing(on: boolean): void {
    this.placing = on;
    this.placeBtn.classList.toggle('on', on);
  }

  setBusy(busy: boolean): void {
    this.root.classList.toggle('busy', busy);
  }

  private toggle(sheet: HTMLElement): void {
    const open = sheet.hidden;
    this.spinPanel.hidden = true;
    this.menu.hidden = true;
    sheet.hidden = !open;
  }

  private showPower(p: number): void {
    this.powerFill.style.setProperty('--p', String(p));
    this.powerLabel.textContent = p > 0 ? `${Math.round(p * 100)}%` : 'Pull down';
  }

  private drawSpin(): void {
    for (const c of [this.spinMini, this.spinBig]) {
      const g = c.getContext('2d')!;
      const s = c.width;
      const r = s / 2 - 4;
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#f6f3ea';
      g.beginPath();
      g.arc(s / 2, s / 2, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = s / 120;
      g.beginPath();
      g.moveTo(s / 2, s / 2 - r);
      g.lineTo(s / 2, s / 2 + r);
      g.moveTo(s / 2 - r, s / 2);
      g.lineTo(s / 2 + r, s / 2);
      g.stroke();
      g.strokeStyle = 'rgba(198,32,38,0.4)';
      g.setLineDash([s / 40, s / 40]);
      g.beginPath();
      g.arc(s / 2, s / 2, r * MISCUE_RING, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#2459c9';
      g.beginPath();
      g.arc(s / 2 + this.tip.a * r, s / 2 - this.tip.b * r, s / 11, 0, Math.PI * 2);
      g.fill();
      if (this.elevation > 0 && c === this.spinMini) {
        g.fillStyle = '#111';
        g.font = `600 ${s / 5}px system-ui`;
        g.textAlign = 'center';
        g.fillText(`${Math.round(this.elevation)}°`, s / 2, s - s / 10);
      }
    }
  }
}
