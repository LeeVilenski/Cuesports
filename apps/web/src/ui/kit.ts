/** Small DOM toolkit shared by the menus and the in-game HUD. */

export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
};

// Stroke icons on a 24px grid (Lucide-style: 2px round strokes, no fills unless noted).
const PATHS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  cue: '<path d="M3 21 17 7"/><circle cx="19" cy="5" r="2.5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  trophy:
    '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8M9.5 17h5"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  replay: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M10 9v6l5-3z" fill="currentColor"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3 14.5a1.6 1.6 0 0 1 2.4-2L8 15"/>',
  camera:
    '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  restart: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/><rect x="10" y="10" width="4" height="4"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, className = 'ico'): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

/** A round icon-only button; the label is for screen readers and tooltips. */
export function iconButton(name: IconName, label: string, onclick: () => void, extra = ''): HTMLButtonElement {
  return h('button', { className: `ibtn ${extra}`.trim(), ariaLabel: label, title: label, onclick }, icon(name));
}

/**
 * A segmented control: one choice of several. Buttons carry aria-pressed so tests and screen
 * readers see which one is on.
 */
export function segmented<T extends string>(
  label: string,
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): { el: HTMLElement; set(v: T): void } {
  const el = h('div', { className: 'seg', role: 'group', ariaLabel: label });
  const buttons = options.map((o) =>
    h('button', { type: 'button', onclick: () => pick(o.value) }, o.label),
  );
  const set = (v: T) =>
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i]!.value === v)));
  const pick = (v: T) => {
    set(v);
    onChange(v);
  };
  el.append(...buttons);
  set(value);
  return { el, set };
}

/** A − n + stepper over a fixed list of values. */
export function stepper(
  label: string,
  values: number[],
  value: number,
  onChange: (v: number) => void,
): { el: HTMLElement; set(v: number): void } {
  let i = Math.max(0, values.indexOf(value));
  const out = h('output', { ariaLabel: label });
  const show = () => (out.textContent = String(values[i]));
  const move = (d: number) => {
    i = Math.max(0, Math.min(values.length - 1, i + d));
    show();
    onChange(values[i]!);
  };
  const el = h(
    'div',
    { className: 'stepper' },
    iconButton('minus', `Fewer ${label.toLowerCase()}`, () => move(-1)),
    out,
    iconButton('plus', `More ${label.toLowerCase()}`, () => move(1)),
  );
  show();
  return {
    el,
    set(v) {
      i = Math.max(0, values.indexOf(v));
      show();
    },
  };
}

/** An on/off switch with a text label. */
export function toggle(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: on, role: 'switch' });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { className: 'switch' }, h('span', {}, label), input);
}

/** Reads JSON from localStorage, falling back when it is missing, blocked or broken. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not persisted; fine for this session.
  }
}
