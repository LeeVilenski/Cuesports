/** Display colours for ball ids (placeholder art for the 2D lab). */

const POOL: Record<number, string> = {
  1: '#f4c430',
  2: '#2459c9',
  3: '#d62f2f',
  4: '#6b3fa0',
  5: '#f07f1d',
  6: '#1f8a4c',
  7: '#7a1f1f',
  8: '#111111',
};

const SNOOKER: Record<string, string> = {
  yellow: '#f4c430',
  green: '#1f8a4c',
  brown: '#7a4a21',
  blue: '#2459c9',
  pink: '#f08bb4',
  black: '#111111',
};

export interface BallLook {
  fill: string;
  stripe: boolean;
  label: string;
}

export function ballLook(id: string): BallLook {
  if (id === 'cue') return { fill: '#f6f3ea', stripe: false, label: '' };
  if (id.startsWith('red')) return { fill: '#c8202a', stripe: false, label: '' };
  if (SNOOKER[id]) return { fill: SNOOKER[id], stripe: false, label: '' };
  if (/^r\d+$/.test(id)) return { fill: '#c8202a', stripe: false, label: '' };
  if (/^y\d+$/.test(id)) return { fill: '#f4c430', stripe: false, label: '' };
  const n = Number(id);
  if (Number.isInteger(n) && n >= 1 && n <= 15) {
    return { fill: POOL[n > 8 ? n - 8 : n] ?? '#999', stripe: n > 8, label: id };
  }
  return { fill: '#999', stripe: false, label: id };
}
