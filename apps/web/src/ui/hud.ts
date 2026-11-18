import type { CameraMode } from '../render/cameras';
import { h, iconButton } from './kit';

const CAMERAS: CameraMode[] = ['aim', 'top', 'free'];
const CAMERA_NAMES: Record<CameraMode, string> = { aim: 'Aim view', top: 'Top view', free: 'Free view' };

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
  onMenu(): void;
}

/** The tip can go up to just inside the miscue limit (0.55 R in DEFAULT_CUE). */
const MAX_TIP = 0.52;
const MISCUE_RING = 0.55;
/** Pull-back stroke: forward speed (bar heights per second) for a full-power shot. */
const PULL_FULL_SPEED = 7;

export type StrokeMode = 'bar' | 'pull';

/** Touch-first HUD overlaid on the canvas. Layout adapts to portrait and landscape in CSS. */
export class Hud {
  readonly root = h('div', { className: 'hud' });
  private status = h('div', { className: 'status' });
  private camButton: HTMLButtonElement;
  private camMode: CameraMode = 'aim';
  private powerFill = h('div', { className: 'power-fill' });
  private powerMark = h('div', { className: 'power-mark' });
  private powerLabel = h('div', { className: 'power-label' });
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
  private elevInput = h('input', { type: 'range', min: '0', max: '60', step: '0.5', value: '0' });
  private elevOut = h('output', {}, '0°');
  private placeBtn = iconButton('hand', 'Move cue ball', () => undefined);
  private tip = { a: 0, b: 0 };
  private elevation = 0;
  /** Elevation the cue is forced up to by a cushion or ball in the way (degrees, 0 if none). */
  private forced = 0;
  private placing = false;
  private lastPower = 0.4;
  private powerEl!: HTMLElement;
  /** Power bar (pull down, release) or pull-back stroke (pull down, push back up to strike). */
  strokeMode: StrokeMode = 'bar';

  constructor(private cb: HudCallbacks) {
    // One camera button: tap cycles Aim → Top → Free.
    this.camButton = iconButton('camera', 'Camera', () => {
      const next = CAMERAS[(CAMERAS.indexOf(this.camMode) + 1) % CAMERAS.length]!;
      cb.onCamera(next);
    });
    this.camButton.append(h('span', { className: 'cam-mode' }));

    const top = h(
      'div',
      { className: 'top' },
      iconButton('menu', 'Menu', () => cb.onMenu()),
      this.status,
      this.camButton,
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
    // Pull-back stroke: the furthest the cue was drawn back, and the smoothed forward speed.
    let back = 0;
    let lastY = 0;
    let lastT = 0;
    let fwd = 0;
    power.addEventListener('pointerdown', (e) => {
      power.setPointerCapture(e.pointerId);
      startY = lastY = e.clientY;
      lastT = e.timeStamp;
      pulling = true;
      p = back = fwd = 0;
      this.showPower(0);
      cb.onPull(0);
    });
    power.addEventListener('pointermove', (e) => {
      if (!pulling) return;
      const range = power.getBoundingClientRect().height * 0.9;
      p = Math.max(0, Math.min(1, (e.clientY - startY) / range));
      if (this.strokeMode === 'pull') {
        // Forward speed in bar-heights per second, smoothed over the last few moves.
        const dt = Math.max(1, e.timeStamp - lastT);
        const v = ((lastY - e.clientY) / range) * (1000 / dt);
        fwd = fwd * 0.5 + v * 0.5;
        lastY = e.clientY;
        lastT = e.timeStamp;
        back = Math.max(back, p);
        if (back > 0.05 && e.clientY <= startY) {
          // Pushed through to where the stroke started: strike with the forward speed, never much
          // more than the backswing allows (so a twitch can't become a full-power shot).
          pulling = false;
          const shotPower = Math.max(0.03, Math.min(1, fwd / PULL_FULL_SPEED, back * 1.5 + 0.1));
          this.showPower(0);
          this.lastPower = shotPower;
          this.powerMark.style.setProperty('--p', String(shotPower));
          cb.onShoot(shotPower);
          return;
        }
        this.showPower(p);
        cb.onPull(p);
        return;
      }
      this.showPower(p);
      cb.onPull(p);
    });
    const release = (cancel: boolean) => {
      if (!pulling) return;
      pulling = false;
      this.showPower(0);
      // In pull-back mode, letting go without pushing through cancels the stroke.
      if (!cancel && p > 0.02 && this.strokeMode === 'bar') {
        this.lastPower = p;
        this.powerMark.style.setProperty('--p', String(p));
        cb.onShoot(p);
      } else cb.onPull(null);
    };
    power.addEventListener('pointerup', () => release(false));
    power.addEventListener('pointercancel', () => release(true));
    this.powerEl = power;

    // Fine aim strip: drags here turn the aim 15× more slowly.
    const fine = h(
      'div',
      { className: 'fine', ariaLabel: 'Fine aim: drag sideways' },
      h('span', { className: 'fine-grip' }),
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

    this.placeBtn.onclick = null;
    this.placeBtn.addEventListener('click', () => {
      this.placing = !this.placing;
      this.placeBtn.classList.toggle('on', this.placing);
      this.placeBtn.setAttribute('aria-pressed', String(this.placing));
      cb.onPlaceToggle(this.placing);
    });
    const actions = h(
      'div',
      { className: 'actions' },
      this.placeBtn,
      iconButton('undo', 'Undo', () => cb.onUndo()),
      iconButton('replay', 'Replay', () => cb.onReplay()),
    );

    this.root.append(top, power, fine, this.spinMini, actions, this.spinPanel);
    this.powerMark.style.setProperty('--p', String(this.lastPower));
    this.drawSpin();
  }

  setStrokeMode(mode: StrokeMode): void {
    this.strokeMode = mode;
    this.powerEl.classList.toggle('stroke', mode === 'pull');
    this.powerEl.ariaLabel =
      mode === 'pull'
        ? 'Stroke: pull down to draw the cue back, then push up to strike'
        : 'Power: pull down and release to shoot';
  }

  get power(): number {
    return this.lastPower;
  }

  setCamera(mode: CameraMode): void {
    this.camMode = mode;
    this.camButton.dataset.mode = mode;
    this.camButton.ariaLabel = `Camera: ${CAMERA_NAMES[mode]}`;
    this.camButton.title = CAMERA_NAMES[mode];
    this.camButton.querySelector('.cam-mode')!.textContent = mode[0]!.toUpperCase();
  }

  /** Closes the spin sheet (e.g. when the pause menu opens). */
  closeSheets(): void {
    this.spinPanel.hidden = true;
  }

  /** Puts an element (the match scoreboard) into the top bar, after the menu button. */
  placeInTop(el: HTMLElement): void {
    this.status.before(el);
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  setPlacing(on: boolean): void {
    this.placing = on;
    this.placeBtn.classList.toggle('on', on);
    this.placeBtn.setAttribute('aria-pressed', String(on));
  }

  /** Enables or disables the Move cue ball button (in a match, only with ball in hand). */
  setPlacingAllowed(allowed: boolean): void {
    this.placeBtn.disabled = !allowed;
  }

  setBusy(busy: boolean): void {
    this.root.classList.toggle('busy', busy);
  }

  private toggle(sheet: HTMLElement): void {
    const open = sheet.hidden;
    this.spinPanel.hidden = true;
    sheet.hidden = !open;
  }

  private showPower(p: number): void {
    this.powerFill.style.setProperty('--p', String(p));
    this.powerLabel.textContent = p > 0 ? `${Math.round(p * 100)}` : '';
    this.powerLabel.parentElement?.classList.toggle('pulling', p > 0);
  }

  /** Shows a tip position and elevation on the spin widget (e.g. back to centre, or the AI's choice). */
  showSpin(tip: { a: number; b: number }, elevationDeg: number): void {
    this.tip = { ...tip };
    this.elevation = Math.round(elevationDeg * 2) / 2;
    this.elevInput.value = String(this.elevation);
    this.elevOut.textContent = `${this.elevation}°`;
    this.drawSpin();
  }

  /** Shows the elevation the cue is raised to when the rail or a ball is in the way. */
  setForcedElevation(deg: number): void {
    const f = deg > this.elevation + 0.25 ? Math.round(deg * 2) / 2 : 0;
    const text = f ? `${f}° (raised to clear)` : `${this.elevation}°`;
    if (this.elevOut.textContent !== text) this.elevOut.textContent = text;
    if (f === this.forced) return;
    this.forced = f;
    this.drawSpin();
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
      const shown = Math.max(this.elevation, this.forced);
      if (shown > 0 && c === this.spinMini) {
        g.fillStyle = this.forced ? '#b3261e' : '#111';
        g.font = `600 ${s / 5}px system-ui`;
        g.textAlign = 'center';
        g.fillText(`${Math.round(shown)}°`, s / 2, s - s / 10);
      }
    }
  }
}
