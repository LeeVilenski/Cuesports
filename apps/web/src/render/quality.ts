/**
 * Graphics quality tiers. Auto picks one from what the device says about itself (cores, memory,
 * GPU name, screen); the frame loop then trims the resolution further if frames run slow.
 */

export type Tier = 'low' | 'medium' | 'high';
export type TierChoice = Tier | 'auto';

export interface TierParams {
  /** Highest device-pixel ratio to render at. */
  maxRatio: number;
  /** MSAA (only takes effect on the next load: WebGL fixes it when the context is made). */
  antialias: boolean;
  /** Sphere segments for the balls. */
  ballSegments: [number, number];
  /** Strength of the environment reflections on balls and wood. */
  reflections: number;
}

export const TIERS: Record<Tier, TierParams> = {
  low: { maxRatio: 1, antialias: false, ballSegments: [24, 16], reflections: 0.12 },
  medium: { maxRatio: 1.5, antialias: true, ballSegments: [32, 24], reflections: 0.18 },
  high: { maxRatio: 2, antialias: true, ballSegments: [48, 32], reflections: 0.22 },
};

export interface DeviceHints {
  cores?: number;
  /** GB, from navigator.deviceMemory (Chrome only). */
  memory?: number;
  gpu?: string;
  mobile?: boolean;
}

/** Known weak GPUs (old Mali/Adreno/PowerVR, software renderers). */
const WEAK = /swiftshader|llvmpipe|software|mali-[4t]|mali-g(31|51|52|57)|adreno \(tm\) [1-5]\d\d|powervr|intel.*hd graphics [2-5]/i;
const STRONG = /apple (m\d|gpu)|nvidia|geforce|radeon (rx|pro)|adreno \(tm\) (7\d\d|8\d\d)|mali-g7\d\d|immortalis/i;

export function detectTier(d: DeviceHints): Tier {
  if (d.gpu && WEAK.test(d.gpu)) return 'low';
  if ((d.memory !== undefined && d.memory <= 2) || (d.cores !== undefined && d.cores <= 2)) return 'low';
  if (d.gpu && STRONG.test(d.gpu) && (d.memory ?? 8) >= 4) return 'high';
  if (d.mobile) return 'medium';
  return (d.cores ?? 4) >= 8 ? 'high' : 'medium';
}

/** Reads the hints from the browser. */
export function deviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const hints: DeviceHints = {
    mobile: /Android|iPhone|iPad|Mobile/i.test(nav.userAgent) || matchMedia('(pointer: coarse)').matches,
  };
  if (nav.hardwareConcurrency) hints.cores = nav.hardwareConcurrency;
  if (nav.deviceMemory) hints.memory = nav.deviceMemory;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) hints.gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* no GPU name: decide from the rest */
  }
  return hints;
}

export function resolveTier(choice: TierChoice): Tier {
  return choice === 'auto' ? detectTier(deviceHints()) : choice;
}
