import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

/**
 * Procedural player bodies with roughly natural proportions: limbs and torso are lathed from
 * anatomical profiles (shoulders, chest, waist, calves, wrists), heads have a jaw, ears, nose, eyes,
 * brows and mouth, and hair and clothes come from a handful of styles. Parts are built along +y
 * (from one joint to the next) so the character rig can point them between joints.
 */

export type HairStyle = 'short' | 'crop' | 'bald' | 'long' | 'curly' | 'swept';
export type Facial = 'none' | 'beard' | 'moustache' | 'stubble';

export interface Build {
  /** Shoulder and chest width (1 = average). */
  width: number;
  /** Limb thickness. */
  girth: number;
  /** Extra waist (0 = trim). */
  belly: number;
}

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  facial: Facial;
  eyes: string;
  build: Build;
  shirt: string;
  trousers: string;
  shoes: string;
  /** Snooker dress: long white sleeves, a waistcoat and a bow tie. */
  waistcoat?: string;
}

export interface Preset {
  name: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  facial: Facial;
  eyes: string;
  build: Build;
  /** Casual (pool) outfit. */
  shirt: string;
  trousers: string;
  shoes: string;
  /** Formal (snooker) waistcoat. */
  waistcoat: string;
}

/** The players to choose from. All fictional. */
export const PRESETS: readonly Preset[] = [
  {
    name: 'Danny',
    skin: '#e3b593',
    hair: '#3b2819',
    hairStyle: 'short',
    facial: 'none',
    eyes: '#4a6b8a',
    build: { width: 1, girth: 1, belly: 0 },
    shirt: '#2a5bd7',
    trousers: '#2b2f3a',
    shoes: '#e8e8e8',
    waistcoat: '#1d2a44',
  },
  {
    name: 'Marcus',
    skin: '#7a4a30',
    hair: '#141010',
    hairStyle: 'crop',
    facial: 'beard',
    eyes: '#3a2416',
    build: { width: 1.1, girth: 1.08, belly: 0.01 },
    shirt: '#c8382e',
    trousers: '#3a3328',
    shoes: '#1a1a1a',
    waistcoat: '#4a1620',
  },
  {
    name: 'Ray',
    skin: '#f0c8a8',
    hair: '#b8b0a4',
    hairStyle: 'swept',
    facial: 'moustache',
    eyes: '#5b6e5a',
    build: { width: 1.04, girth: 1.05, belly: 0.035 },
    shirt: '#2f7d4f',
    trousers: '#4a4a4a',
    shoes: '#3a2414',
    waistcoat: '#2e3b2a',
  },
  {
    name: 'Kenji',
    skin: '#e6bf92',
    hair: '#0e0c0c',
    hairStyle: 'long',
    facial: 'none',
    eyes: '#2a1c12',
    build: { width: 0.94, girth: 0.93, belly: 0 },
    shirt: '#1f1f24',
    trousers: '#c9c2b0',
    shoes: '#f2f2f2',
    waistcoat: '#2b2b30',
  },
  {
    name: 'Tomasz',
    skin: '#ecc2a0',
    hair: '#c98a3c',
    hairStyle: 'curly',
    facial: 'stubble',
    eyes: '#4c7a9c',
    build: { width: 1.02, girth: 1, belly: 0.01 },
    shirt: '#e0a21e',
    trousers: '#23324a',
    shoes: '#5a3a22',
    waistcoat: '#5c3d12',
  },
  {
    name: 'Andre',
    skin: '#5a3424',
    hair: '#0c0a0a',
    hairStyle: 'bald',
    facial: 'beard',
    eyes: '#2a1810',
    build: { width: 1.14, girth: 1.12, belly: 0.02 },
    shirt: '#6b3fa0',
    trousers: '#1c1c22',
    shoes: '#0e0e0e',
    waistcoat: '#3a1f52',
  },
  {
    name: 'Sanjay',
    skin: '#a56e4a',
    hair: '#1a1410',
    hairStyle: 'swept',
    facial: 'moustache',
    eyes: '#2e1e14',
    build: { width: 0.98, girth: 0.97, belly: 0.015 },
    shirt: '#e8e4da',
    trousers: '#2e3d55',
    shoes: '#2a1a10',
    waistcoat: '#14304a',
  },
  {
    name: 'Liam',
    skin: '#f3d0b6',
    hair: '#7a3b1c',
    hairStyle: 'short',
    facial: 'stubble',
    eyes: '#3f6a4a',
    build: { width: 0.97, girth: 0.95, belly: 0 },
    shirt: '#2a9db0',
    trousers: '#3b3b3b',
    shoes: '#d8d8d8',
    waistcoat: '#22323a',
  },
];

/** A preset dressed for a game: waistcoat and white shirt for snooker, casual for pool. */
export function lookFor(preset: Preset, game: string): Look {
  const snooker = game.startsWith('snooker');
  return {
    skin: preset.skin,
    hair: preset.hair,
    hairStyle: preset.hairStyle,
    facial: preset.facial,
    eyes: preset.eyes,
    build: preset.build,
    shirt: snooker ? '#f6f5f0' : preset.shirt,
    trousers: snooker ? '#151518' : preset.trousers,
    shoes: snooker ? '#0b0b0b' : preset.shoes,
    ...(snooker ? { waistcoat: preset.waistcoat } : {}),
  };
}

/** Picks two different presets for the players, steadily from their names. */
export function presetsFor(names: readonly string[]): [number, number] {
  const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const a = hash(names[0] ?? '') % PRESETS.length;
  let b = hash(names[1] ?? 'x') % PRESETS.length;
  if (b === a) b = (b + 1) % PRESETS.length;
  return [a, b];
}

export interface FigureParts {
  torso: Object3D;
  hips: Object3D;
  head: Object3D;
  neck: Object3D;
  /** Per side ('l' / 'r'): shoulder cap, upper arm, elbow, forearm, hand, thigh, knee, shin, shoe. */
  limbs: Record<
    'l' | 'r',
    Record<'shoulder' | 'upper' | 'elbow' | 'fore' | 'hand' | 'thigh' | 'knee' | 'shin' | 'shoe', Object3D>
  >;
}

/** Torso length (pelvis to neck) the profile is built for. */
export const FIG_TORSO = 0.52;

/**
 * A solid of revolution along +y, centred, from a profile of (radius, t) with t from 0 (one joint)
 * to 1 (the next) over `length`.
 */
function lathe(profile: [number, number][], length: number, segments = 14): LatheGeometry {
  const pts = profile.map(([r, t]) => new Vector2(Math.max(r, 1e-4), (t - 0.5) * length));
  // Close the ends.
  pts.unshift(new Vector2(1e-4, pts[0]!.y));
  pts.push(new Vector2(1e-4, pts[pts.length - 1]!.y));
  const g = new LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

const scaleR = (p: [number, number][], k: number): [number, number][] => p.map(([r, t]) => [r * k, t]);

export function buildFigure(
  look: Look,
  lengths: { upperArm: number; forearm: number; thigh: number; shin: number; neck: number },
  track: { geo<G extends BufferGeometry>(g: G): G; mat(m: Material): Material },
): FigureParts {
  const { geo } = track;
  const mat = (color: string, roughness = 0.7, metalness = 0) =>
    track.mat(new MeshStandardMaterial({ color, roughness, metalness })) as MeshStandardMaterial;
  const skin = mat(look.skin, 0.55);
  const shirt = mat(look.shirt, 0.8);
  const trousers = mat(look.trousers, 0.85);
  const shoes = mat(look.shoes, 0.35);
  const hair = mat(look.hair, 0.85);
  const formal = !!look.waistcoat;
  const g = look.build.girth;
  const mesh = (geom: BufferGeometry, m: Material) => new Mesh(geo(geom), m);

  // Torso: hips → waist → chest → shoulders → neck base. Wider across (x) than deep (z).
  const torso = new Group();
  const belly = look.build.belly;
  const torsoProfile: [number, number][] = [
    [0.13, 0],
    [0.128 + belly * 0.6, 0.12],
    [0.12 + belly, 0.3],
    [0.13 + belly * 0.5, 0.48],
    [0.145, 0.64],
    [0.148, 0.76],
    [0.14, 0.86],
    [0.115, 0.95],
    [0.065, 1],
  ];
  const body = mesh(lathe(torsoProfile, FIG_TORSO, 18), formal ? mat(look.waistcoat!, 0.5) : shirt);
  body.scale.set(1.18 * look.build.width, 1, 0.72);
  torso.add(body);
  const FRONT = 0.72 * 0.145 * (1 + belly * 3);
  if (formal) {
    // White shirt front in the waistcoat's V, a collar and a bow tie; waistcoat buttons.
    const bib = mesh(new SphereGeometry(0.06, 12, 8), shirt);
    bib.scale.set(0.5, 1.05, 0.3);
    bib.position.set(0, 0.2, FRONT - 0.004);
    const bow = new Group();
    const black = mat('#0c0c0c', 0.45);
    for (const s of [-1, 1]) {
      const wing = mesh(new ConeGeometry(0.018, 0.04, 8), black);
      wing.rotation.z = (s * Math.PI) / 2;
      wing.position.x = s * 0.02;
      bow.add(wing);
    }
    bow.position.set(0, 0.235, 0.075);
    torso.add(bib, bow);
    const button = mat('#c8b27a', 0.3, 0.6);
    for (let i = 0; i < 4; i++) {
      const b = mesh(new SphereGeometry(0.006, 6, 4), button);
      b.position.set(0, 0.08 - i * 0.055, FRONT + 0.006 + belly * 0.3);
      torso.add(b);
    }
  } else {
    // Polo collar and placket.
    const collar = mesh(new TorusGeometry(0.05, 0.012, 6, 16), shirt);
    collar.rotation.x = Math.PI / 2 - 0.25;
    collar.position.set(0, 0.245, 0.01);
    const placket = mesh(new BoxGeometry(0.022, 0.08, 0.006), mat(look.shirt, 0.6));
    placket.position.set(0, 0.19, FRONT + 0.004);
    torso.add(collar, placket);
  }
  // Belt at the waistband.
  const belt = mesh(new TorusGeometry(0.128 + belly * 0.6, 0.014, 6, 20), mat('#1a120c', 0.4));
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.18 * look.build.width, 0.72, 1);
  belt.position.y = -FIG_TORSO / 2 + 0.06;
  if (!formal) torso.add(belt);

  const hips = mesh(new SphereGeometry(0.14, 16, 10), trousers);
  hips.scale.set(1.15 * look.build.width, 0.7, 0.85);

  const neck = mesh(new CylinderGeometry(0.056, 0.064, lengths.neck, 12), skin);

  // Head: skull, jaw, ears, nose, eyes, brows, mouth and hair. Local +z is the face, +y up.
  const head = new Group();
  const skull = mesh(new SphereGeometry(0.093, 24, 18), skin);
  skull.scale.set(0.88, 1.08, 1);
  const jaw = mesh(new SphereGeometry(0.068, 18, 12), skin);
  jaw.scale.set(0.95, 0.85, 1);
  jaw.position.set(0, -0.045, 0.022);
  head.add(skull, jaw);
  for (const s of [-1, 1]) {
    const ear = mesh(new SphereGeometry(0.022, 10, 8), skin);
    ear.scale.set(0.45, 1.1, 0.75);
    ear.position.set(s * 0.083, -0.005, -0.005);
    const white = mesh(new SphereGeometry(0.0125, 10, 8), mat('#f4f1ea', 0.3));
    white.position.set(s * 0.031, 0.008, 0.077);
    const iris = mesh(new SphereGeometry(0.0072, 8, 6), mat(look.eyes, 0.25));
    iris.position.set(s * 0.031, 0.008, 0.088);
    const brow = mesh(new BoxGeometry(0.032, 0.0065, 0.01), hair);
    brow.position.set(s * 0.032, 0.03, 0.084);
    brow.rotation.z = s * -0.12;
    head.add(ear, white, iris, brow);
  }
  const nose = mesh(new ConeGeometry(0.013, 0.038, 8), skin);
  nose.rotation.x = Math.PI / 2 + 0.5;
  nose.position.set(0, -0.012, 0.094);
  const mouth = mesh(new BoxGeometry(0.028, 0.004, 0.005), mat('#a8605a', 0.6));
  mouth.position.set(0, -0.05, 0.083);
  head.add(nose, mouth);
  addHair(head, look, hair, mesh);
  head.scale.setScalar(1.12);
  addFacialHair(head, look, hair, mesh);

  const sleeveMat = shirt;
  const limbs = {} as FigureParts['limbs'];
  for (const side of ['l', 'r'] as const) {
    const upperProfile: [number, number][] = [
      [0.046, 0],
      [0.047, 0.2],
      [0.044, 0.45],
      [0.038, 0.8],
      [0.034, 1],
    ];
    const foreProfile: [number, number][] = [
      [0.034, 0],
      [0.038, 0.18],
      [0.033, 0.55],
      [0.025, 0.95],
      [0.024, 1],
    ];
    const upper = new Group();
    if (formal) upper.add(mesh(lathe(scaleR(upperProfile, g * 1.12), lengths.upperArm), sleeveMat));
    else {
      upper.add(mesh(lathe(scaleR(upperProfile, g), lengths.upperArm), skin));
      // Short sleeve over the top half.
      upper.add(
        mesh(
          lathe(
            [
              [0.054 * g, 0],
              [0.056 * g, 0.3],
              [0.052 * g, 0.5],
            ],
            lengths.upperArm,
          ),
          sleeveMat,
        ),
      );
    }
    const fore = new Group();
    fore.add(
      mesh(lathe(scaleR(foreProfile, g * (formal ? 1.12 : 1)), lengths.forearm), formal ? sleeveMat : skin),
    );
    if (formal) {
      // White cuff and a bit of wrist.
      const cuff = mesh(new CylinderGeometry(0.03 * g, 0.03 * g, 0.03, 12), sleeveMat);
      cuff.position.y = lengths.forearm / 2 - 0.03;
      fore.add(cuff);
    }
    const shoulder = mesh(
      new SphereGeometry(0.052 * g * (formal ? 1.1 : 1), 14, 10),
      formal ? mat(look.waistcoat!, 0.5) : shirt,
    );
    if (formal) shoulder.material = sleeveMat;
    const elbow = mesh(new SphereGeometry(0.035 * g * (formal ? 1.12 : 1), 10, 8), formal ? sleeveMat : skin);

    // Hand: palm, four fingers as one curled block, thumb. Built along +y from the wrist.
    const hand = new Group();
    const palm = mesh(new BoxGeometry(0.075, 0.08, 0.028), skin);
    palm.position.y = 0.04;
    const fingers = mesh(new CylinderGeometry(0.014, 0.012, 0.075, 8), skin);
    fingers.rotation.z = Math.PI / 2;
    fingers.scale.set(1, 1, 1);
    fingers.position.set(0, 0.088, 0.01);
    const thumb = mesh(new CylinderGeometry(0.011, 0.009, 0.05, 8), skin);
    thumb.position.set(side === 'l' ? 0.042 : -0.042, 0.04, 0.01);
    thumb.rotation.z = side === 'l' ? -0.6 : 0.6;
    hand.add(palm, fingers, thumb);
    hand.scale.setScalar(0.95 + (g - 1) * 0.5);

    const thighProfile: [number, number][] = [
      [0.085, 0],
      [0.083, 0.3],
      [0.072, 0.75],
      [0.06, 1],
    ];
    const shinProfile: [number, number][] = [
      [0.058, 0],
      [0.056, 0.4],
      [0.05, 0.8],
      [0.048, 1],
    ];
    const thigh = mesh(lathe(scaleR(thighProfile, g), lengths.thigh), trousers);
    const shin = mesh(lathe(scaleR(shinProfile, g), lengths.shin), trousers);
    const knee = mesh(new SphereGeometry(0.06 * g, 12, 8), trousers);

    // Shoe: in physics axes (length along +y, height up +z), the ankle at the origin.
    const shoe = new Group();
    const upperShoe = mesh(new SphereGeometry(0.05, 14, 10), shoes);
    upperShoe.scale.set(0.95, 2.4, 0.75);
    upperShoe.position.set(0, 0.06, -0.01);
    const sole = mesh(new BoxGeometry(0.095, 0.27, 0.018), mat(formal ? '#0a0a0a' : '#d8d2c4', 0.9));
    sole.position.set(0, 0.06, -0.045);
    shoe.add(upperShoe, sole);

    limbs[side] = { shoulder, upper, elbow, fore, hand, thigh, knee, shin, shoe };
  }
  return { torso, hips, head, neck, limbs };
}

function addHair(
  head: Group,
  look: Look,
  hair: Material,
  mesh: (g: BufferGeometry, m: Material) => Mesh,
): void {
  const cap = (thetaLength: number, scale: [number, number, number], tilt = -0.35) => {
    const m = mesh(new SphereGeometry(0.098, 22, 12, 0, Math.PI * 2, 0, thetaLength), hair);
    m.scale.set(...scale);
    // Pull the hairline up at the front and down at the back.
    m.rotation.x = tilt;
    return m;
  };
  switch (look.hairStyle) {
    case 'bald': {
      // Close-shaved patches round the back and above the ears.
      for (const [x, z, sx] of [
        [-0.07, -0.035, 0.5],
        [0.07, -0.035, 0.5],
        [0, -0.075, 1.2],
      ] as const) {
        const patch = mesh(new SphereGeometry(0.04, 10, 8), hair);
        patch.scale.set(sx, 0.7, 0.45);
        patch.position.set(x, 0.0, z);
        head.add(patch);
      }
      return;
    }
    case 'crop':
      head.add(cap(Math.PI * 0.5, [0.9, 1.1, 1.02], -0.3));
      return;
    case 'short':
      head.add(cap(Math.PI * 0.52, [0.93, 1.12, 1.05]));
      return;
    case 'swept': {
      head.add(cap(Math.PI * 0.5, [0.93, 1.12, 1.05], -0.25));
      const quiff = mesh(new SphereGeometry(0.05, 12, 8), hair);
      quiff.scale.set(1.4, 0.55, 0.9);
      quiff.position.set(0.01, 0.085, 0.045);
      quiff.rotation.z = -0.25;
      head.add(quiff);
      return;
    }
    case 'long': {
      head.add(cap(Math.PI * 0.56, [0.95, 1.13, 1.06], -0.2));
      // Hair down the back to the shoulders.
      const back = mesh(
        new CylinderGeometry(0.075, 0.07, 0.15, 14, 1, true, Math.PI * 0.6, Math.PI * 0.8),
        hair,
      );
      back.position.set(0, -0.05, -0.01);
      back.rotation.y = Math.PI;
      head.add(back);
      return;
    }
    case 'curly': {
      head.add(cap(Math.PI * 0.5, [0.95, 1.1, 1.04], -0.3));
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const ring = i % 2 ? 0.55 : 0.85;
        const c = mesh(new SphereGeometry(0.028, 8, 6), hair);
        c.position.set(
          Math.cos(a) * 0.075 * ring,
          0.07 + (1 - ring) * 0.06,
          Math.sin(a) * 0.08 * ring - 0.01,
        );
        head.add(c);
      }
    }
  }
}

function addFacialHair(
  head: Group,
  look: Look,
  hair: Material,
  mesh: (g: BufferGeometry, m: Material) => Mesh,
): void {
  if (look.facial === 'none') return;
  if (look.facial === 'moustache' || look.facial === 'beard') {
    const m = mesh(new BoxGeometry(0.045, 0.011, 0.012), hair);
    m.position.set(0, -0.037, 0.09);
    head.add(m);
  }
  if (look.facial === 'beard' || look.facial === 'stubble') {
    const stubble = look.facial === 'stubble';
    const mat = stubble
      ? new MeshStandardMaterial({ color: look.hair, roughness: 1, transparent: true, opacity: 0.35 })
      : hair;
    const b = mesh(new SphereGeometry(0.071, 18, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), mat);
    b.scale.set(0.97, 0.9, 1.03);
    b.position.set(0, -0.045, 0.022);
    // Keep the mouth clear: rotate the open top towards the face a little.
    b.rotation.x = 0.35;
    head.add(b);
  }
}
