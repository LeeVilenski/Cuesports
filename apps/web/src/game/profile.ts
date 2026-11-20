import { DEFAULT_CUE_STYLE, type CueStyle } from '../render/equipment';
import { PRESETS, type Build, type Facial, type HairStyle, type Preset } from '../render/figure';

/**
 * The player's own profile: their name, how they look (the same fields as a preset), their cue
 * and their cloth colours. Kept on this device. Every option is data, so final art can replace
 * the placeholder colours and styles later without touching the screens.
 */
export interface Profile {
  name: string;
  look: Omit<Preset, 'name'>;
  cue: CueStyle;
  /** Cloth colours: American pool tables, UK pool tables, snooker tables. */
  cloth: { pool: string; english: string; snooker: string };
}

export const POOL_CLOTH = '#1b5c8e';
export const SNOOKER_CLOTH = '#1d6b3f';

export const DEFAULT_PROFILE: Profile = {
  name: 'Player 1',
  look: (({ name: _, ...look }) => look)(PRESETS[0]!),
  cue: DEFAULT_CUE_STYLE,
  cloth: { pool: POOL_CLOTH, english: SNOOKER_CLOTH, snooker: SNOOKER_CLOTH },
};

/** A swatch: a colour and its name (for screen readers and tooltips). */
export interface Swatch {
  value: string;
  label: string;
}

export const SKINS: Swatch[] = [
  { value: '#f3d0b6', label: 'Very light' },
  { value: '#f0c8a8', label: 'Light' },
  { value: '#e3b593', label: 'Light medium' },
  { value: '#e6bf92', label: 'Warm light' },
  { value: '#c68e65', label: 'Medium' },
  { value: '#a56e4a', label: 'Medium brown' },
  { value: '#7a4a30', label: 'Brown' },
  { value: '#5a3424', label: 'Dark brown' },
];

export const HAIR_COLOURS: Swatch[] = [
  { value: '#0e0c0c', label: 'Black' },
  { value: '#3b2819', label: 'Dark brown' },
  { value: '#7a3b1c', label: 'Auburn' },
  { value: '#c98a3c', label: 'Ginger' },
  { value: '#d9b56a', label: 'Blond' },
  { value: '#b8b0a4', label: 'Grey' },
  { value: '#ece8e0', label: 'White' },
];

export const HAIR_STYLES: { value: HairStyle; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'crop', label: 'Crop' },
  { value: 'swept', label: 'Swept' },
  { value: 'curly', label: 'Curly' },
  { value: 'long', label: 'Long' },
  { value: 'bald', label: 'Bald' },
];

export const FACIAL: { value: Facial; label: string }[] = [
  { value: 'none', label: 'Clean' },
  { value: 'stubble', label: 'Stubble' },
  { value: 'moustache', label: 'Moustache' },
  { value: 'beard', label: 'Beard' },
];

export const EYES: Swatch[] = [
  { value: '#2a1810', label: 'Dark brown' },
  { value: '#5a3a22', label: 'Brown' },
  { value: '#5b6e5a', label: 'Hazel' },
  { value: '#3f6a4a', label: 'Green' },
  { value: '#4a6b8a', label: 'Blue' },
  { value: '#6b7884', label: 'Grey' },
];

export const BUILDS: { value: string; label: string; build: Build }[] = [
  { value: 'slim', label: 'Slim', build: { width: 0.94, girth: 0.93, belly: 0 } },
  { value: 'average', label: 'Average', build: { width: 1, girth: 1, belly: 0 } },
  { value: 'broad', label: 'Broad', build: { width: 1.1, girth: 1.08, belly: 0.01 } },
  { value: 'heavy', label: 'Heavy', build: { width: 1.12, girth: 1.12, belly: 0.035 } },
];

/** The build option closest to a build (presets have builds between the options). */
export function buildId(b: Build): string {
  let best = BUILDS[1]!;
  let d = Infinity;
  for (const o of BUILDS) {
    const e =
      Math.abs(o.build.width - b.width) +
      Math.abs(o.build.girth - b.girth) +
      4 * Math.abs(o.build.belly - b.belly);
    if (e < d) [best, d] = [o, e];
  }
  return best.value;
}

export const SHIRTS: Swatch[] = [
  { value: '#2a5bd7', label: 'Blue' },
  { value: '#c8382e', label: 'Red' },
  { value: '#2f7d4f', label: 'Green' },
  { value: '#e0a21e', label: 'Yellow' },
  { value: '#6b3fa0', label: 'Purple' },
  { value: '#2a9db0', label: 'Teal' },
  { value: '#1f1f24', label: 'Black' },
  { value: '#e8e4da', label: 'White' },
];

export const TROUSERS: Swatch[] = [
  { value: '#2b2f3a', label: 'Charcoal' },
  { value: '#1c1c22', label: 'Black' },
  { value: '#23324a', label: 'Navy' },
  { value: '#4a4a4a', label: 'Grey' },
  { value: '#3a3328', label: 'Brown' },
  { value: '#c9c2b0', label: 'Stone' },
];

export const SHOES: Swatch[] = [
  { value: '#0e0e0e', label: 'Black' },
  { value: '#3a2414', label: 'Brown' },
  { value: '#e8e8e8', label: 'White' },
];

export const WAISTCOATS: Swatch[] = [
  { value: '#1d2a44', label: 'Navy' },
  { value: '#4a1620', label: 'Burgundy' },
  { value: '#2e3b2a', label: 'Bottle green' },
  { value: '#2b2b30', label: 'Charcoal' },
  { value: '#5c3d12', label: 'Tan' },
  { value: '#3a1f52', label: 'Plum' },
];

export const WRAPS: (Swatch | { value: null; label: string })[] = [
  { value: null, label: 'No wrap' },
  { value: '#141414', label: 'Black' },
  { value: '#5a3a22', label: 'Leather' },
  { value: '#a3201c', label: 'Red' },
  { value: '#1f3f8a', label: 'Blue' },
];

export const POOL_CLOTHS: Swatch[] = [
  { value: POOL_CLOTH, label: 'Tournament blue' },
  { value: '#1d6b3f', label: 'Green' },
  { value: '#7a1f2b', label: 'Burgundy' },
  { value: '#3c3f46', label: 'Steel grey' },
  { value: '#5a2f7a', label: 'Purple' },
  { value: '#a8561c', label: 'Orange' },
];

export const SNOOKER_CLOTHS: Swatch[] = [
  { value: SNOOKER_CLOTH, label: 'Championship green' },
  { value: '#24573a', label: 'Dark green' },
  { value: '#1b5c8e', label: 'Blue' },
  { value: '#6a1e28', label: 'Red' },
];

const KEY = 'cuesports.profile';

/** The saved profile, with anything missing (an older save, a new option) from the default. */
export function loadProfile(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Profile {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      name: typeof p.name === 'string' && p.name.trim() ? p.name : DEFAULT_PROFILE.name,
      look: {
        ...DEFAULT_PROFILE.look,
        ...p.look,
        build: { ...DEFAULT_PROFILE.look.build, ...p.look?.build },
      },
      cue: { ...DEFAULT_PROFILE.cue, ...p.cue },
      cloth: { ...DEFAULT_PROFILE.cloth, ...p.cloth },
    };
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function saveProfile(p: Profile, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(p));
  } catch {
    // Not kept; fine for this session.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The player as a preset (for the figure builder). */
export const profilePreset = (p: Profile): Preset => ({ name: p.name, ...p.look });

/** Starts the look from a preset (the "Start from" row), keeping the name, cue and cloth. */
export function fromPreset(p: Profile, preset: Preset): Profile {
  const { name: _, ...look } = preset;
  return { ...p, look: structuredClone(look) };
}
