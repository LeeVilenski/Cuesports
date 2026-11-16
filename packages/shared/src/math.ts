/**
 * Small vector/quaternion helpers and deterministic transcendental functions.
 *
 * The simulation must give bit-identical results in every JS engine. Basic IEEE arithmetic and
 * `Math.sqrt` are exactly specified, but `Math.sin`, `Math.cos` and `Math.exp` are not, so the
 * simulation uses the polynomial versions below instead.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Unit quaternion (x, y, z, w). */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const quatIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

export const add2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale2 = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot2 = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross2 = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len2 = (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y);
export const perp2 = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const norm2 = (a: Vec2): Vec2 => {
  const l = len2(a);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const dist2 = (a: Vec2, b: Vec2): number => len2(sub2(a, b));

export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len3 = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

/** Quaternion product a * b. */
export const quatMul = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});

export const quatNormalize = (q: Quat): Quat => {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
};

/** Rotates q by angular velocity w (rad/s, world frame) applied for time h. */
export const quatIntegrate = (q: Quat, w: Vec3, h: number): Quat => {
  const speed = len3(w);
  const angle = speed * h;
  if (angle < 1e-12) return q;
  const s = detSin(angle / 2) / speed;
  const dq: Quat = { x: w.x * s, y: w.y * s, z: w.z * s, w: detCos(angle / 2) };
  return quatNormalize(quatMul(dq, q));
};

// ---------------------------------------------------------------------------------------------
// Deterministic transcendental functions (only +, -, *, / and exactly-rounded operations).

const HALF_PI = Math.PI / 2;
// Cody–Waite split of pi/2 for accurate range reduction.
const HALF_PI_HI = 1.5707963267341256;
const HALF_PI_LO = 6.077100506506192e-11;

function sinPoly(r: number): number {
  const r2 = r * r;
  return (
    r *
    (1 +
      r2 *
        (-1 / 6 +
          r2 *
            (1 / 120 +
              r2 *
                (-1 / 5040 +
                  r2 *
                    (1 / 362880 +
                      r2 * (-1 / 39916800 + r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000))))))))
  );
}

function cosPoly(r: number): number {
  const r2 = r * r;
  return (
    1 +
    r2 *
      (-1 / 2 +
        r2 *
          (1 / 24 +
            r2 *
              (-1 / 720 +
                r2 * (1 / 40320 + r2 * (-1 / 3628800 + r2 * (1 / 479001600 + r2 * (-1 / 87178291200)))))))
  );
}

function reduce(x: number): { r: number; q: number } {
  const k = Math.round(x / HALF_PI);
  const r = x - k * HALF_PI_HI - k * HALF_PI_LO;
  return { r, q: ((k % 4) + 4) % 4 };
}

/** Deterministic sine, accurate to ~1e-15 for |x| < 1e6. */
export function detSin(x: number): number {
  const { r, q } = reduce(x);
  switch (q) {
    case 0:
      return sinPoly(r);
    case 1:
      return cosPoly(r);
    case 2:
      return -sinPoly(r);
    default:
      return -cosPoly(r);
  }
}

/** Deterministic cosine, accurate to ~1e-15 for |x| < 1e6. */
export function detCos(x: number): number {
  const { r, q } = reduce(x);
  switch (q) {
    case 0:
      return cosPoly(r);
    case 1:
      return -sinPoly(r);
    case 2:
      return -cosPoly(r);
    default:
      return sinPoly(r);
  }
}

const LN2 = 0.6931471805599453;
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** Exactly 2^k for integer k in the normal range. */
function pow2(k: number): number {
  if (k > 1023) return Infinity;
  if (k < -1022) return 0;
  f64[0] = 0;
  u32[LITTLE_ENDIAN ? 1 : 0] = (k + 1023) << 20;
  return f64[0];
}

/** Deterministic e^x, relative accuracy ~1e-15. */
export function detExp(x: number): number {
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2;
  let term = 1;
  let sum = 1;
  for (let i = 1; i <= 16; i++) {
    term = (term * r) / i;
    sum += term;
  }
  return sum * pow2(k);
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const DEG = Math.PI / 180;
