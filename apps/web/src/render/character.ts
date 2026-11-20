import { CUE_SHAPE, type ShotInput } from '@cuesports/physics';
import {
  BoxGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import {
  buildCross,
  buildCue,
  buildRestShaft,
  buildSpider,
  CROSS_H,
  CROSS_SOCKET,
  SPIDER_H,
  SPIDER_SOCKET,
  tracker,
  DEFAULT_CUE_STYLE,
  type CueStyle,
} from './equipment';
import { buildFigure, type FigureParts, type Look } from './figure';
import {
  add,
  alongPath,
  cross,
  exitDistance,
  len,
  lerp3,
  norm,
  pathLength,
  scale,
  sub,
  twoBone,
  v3,
  walkPath,
  type P2,
  type P3,
} from './ik';

/** Where the table is, for placing a player around it (physics coordinates). */
export interface TableFrame {
  /** Half length and width of the playfield (cushion noses). */
  hl: number;
  hw: number;
  /** Half length and width to the outside of the rails. */
  hx: number;
  hy: number;
  railTop: number;
  floorZ: number;
  /**
   * How far past the outside of the rail a player will stretch to bridge by hand before reaching
   * for the rest (snooker players use it much sooner than pool players). Default 0.75 m.
   */
  restReach?: number;
}

/** What the player is lining up: the cue ball and the shot (elevation already raised to clear). */
export interface StanceInput {
  ball: P2;
  R: number;
  shot: ShotInput;
  /** How far the tip is drawn back from the ball right now (the stroke). */
  gap: number;
  /** Other balls on the table, which may be in the way of the bridge hand. */
  others?: P2[];
}

export type Tool = 'hand' | 'rest' | 'spider';

/** Bridge distance behind the tip for each tool. */
const BRIDGE_HAND = 0.26;
const BRIDGE_REST = 0.32;

/**
 * How the player will bridge: by hand, with the rest when the bridge is out of reach, or with the
 * spider when that is out of reach too and a ball sits where the rest head would go.
 */
export function chooseTool(st: StanceInput, t: TableFrame): { tool: Tool; kb: number } {
  const b = { x: -Math.cos(st.shot.aim), y: -Math.sin(st.shot.aim) };
  const s = { x: Math.sin(st.shot.aim), y: -Math.cos(st.shot.aim) };
  const ce = Math.max(Math.cos(st.shot.elevation), 0.2);
  const edge = exitDistance(st.ball, b, t.hx, t.hy);
  const kbHand = Math.max(0.06, Math.min(BRIDGE_HAND, (edge - 0.04 - st.R) / ce));
  // How far past the outside of the rail the hand would have to reach.
  const stretch = edge - st.R - kbHand * ce;
  if (stretch <= (t.restReach ?? 0.75)) return { tool: 'hand', kb: kbHand };
  // A ball close behind the cue ball, under where the rest head would sit.
  let kb = BRIDGE_REST;
  let blocked = false;
  for (const o of st.others ?? []) {
    const dx = o.x - st.ball.x;
    const dy = o.y - st.ball.y;
    const along = dx * b.x + dy * b.y;
    const lateral = Math.abs(dx * s.x + dy * s.y);
    if (!blocked && along > st.R && along < st.R + (BRIDGE_REST + 0.06) * ce && lateral < st.R * 3) {
      blocked = true;
      // The spider straddles the ball.
      kb = (along - st.R) / ce;
    }
  }
  return { tool: blocked ? 'spider' : 'rest', kb };
}

export type { Look } from './figure';

export type Want = { kind: 'shoot'; stance: StanceInput } | { kind: 'watch'; at?: P2 } | { kind: 'sit' };

// Body measurements (metres), roughly a 1.78 m adult.
const UPPER_ARM = 0.29;
const FOREARM = 0.27;
const THIGH = 0.45;
const SHIN = 0.45;
const TORSO = 0.52;
const NECK = 0.17;
const SHOULDER = 0.18;
const HIP = 0.1;
const PELVIS_Z = 0.97;
const FOOT_Z = 0.06;
/** Clearance kept between the body and the outside of the rail. */
const BODY_CLEAR = 0.14;
const CUE_LEN = CUE_SHAPE.length;

const WALK_SPEED = 1.6;
const DOWN_RATE = 2.4;

interface Pose {
  pelvis: P3;
  neck: P3;
  head: P3;
  lSh: P3;
  rSh: P3;
  lEl: P3;
  rEl: P3;
  lHand: P3;
  rHand: P3;
  lHip: P3;
  rHip: P3;
  lKnee: P3;
  rKnee: P3;
  lFoot: P3;
  rFoot: P3;
  /** Toes direction for the feet (horizontal unit). */
  toes: P3;
  /** The player's own cue: tip and butt. */
  cueTip: P3;
  cueButt: P3;
  /** A mechanical rest (snooker), head and butt, or the same point twice when not used. */
  restHead: P3;
  restButt: P3;
  /** What the rest head is, when on the rest. */
  tool?: Tool;
}

const POSE_KEYS = Object.keys({
  pelvis: 0,
  neck: 0,
  head: 0,
  lSh: 0,
  rSh: 0,
  lEl: 0,
  rEl: 0,
  lHand: 0,
  rHand: 0,
  lHip: 0,
  rHip: 0,
  lKnee: 0,
  rKnee: 0,
  lFoot: 0,
  rFoot: 0,
  toes: 0,
  cueTip: 0,
  cueButt: 0,
  restHead: 0,
  restButt: 0,
} satisfies Record<Exclude<keyof Pose, 'tool'>, number>) as Exclude<keyof Pose, 'tool'>[];

function blend(a: Pose, b: Pose, k: number): Pose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const out = {} as Pose;
  for (const key of POSE_KEYS) out[key] = lerp3(a[key], b[key], k);
  if (b.tool) out.tool = b.tool;
  return out;
}

const smooth = (k: number): number => k * k * (3 - 2 * k);
const flat = (p: P2, z = 0): P3 => v3(p.x, p.y, z);

/** The cue's tip position and its axis (unit, from the tip towards the butt) for a shot. */
export function cueLine(st: StanceInput): { tip: P3; u: P3 } {
  const { shot, R, ball } = st;
  const ce = Math.cos(shot.elevation);
  const d = v3(ce * Math.cos(shot.aim), ce * Math.sin(shot.aim), -Math.sin(shot.elevation));
  const tip = add(v3(ball.x, ball.y, R), scale(d, -(R + st.gap)));
  return { tip, u: scale(d, -1) };
}

/** Legs by IK from the hips to planted feet, knees bending forward. */
function legs(pose: Omit<Pose, 'lKnee' | 'rKnee'>, forward: P3): Pose {
  const l = twoBone(
    pose.lHip,
    pose.lFoot,
    THIGH,
    SHIN,
    add(pose.lHip, add(scale(forward, 0.6), v3(0, 0, -0.3))),
  );
  const r = twoBone(
    pose.rHip,
    pose.rFoot,
    THIGH,
    SHIN,
    add(pose.rHip, add(scale(forward, 0.6), v3(0, 0, -0.3))),
  );
  return { ...pose, lKnee: l.mid, rKnee: r.mid, lFoot: l.end, rFoot: r.end };
}

/** Pushes a floor point out of the table's footprint (plus clearance). */
function outsideTable(p: P2, t: TableFrame, clear: number): P2 {
  const ex = t.hx + clear;
  const ey = t.hy + clear;
  if (Math.abs(p.x) >= ex || Math.abs(p.y) >= ey) return p;
  // Out through the nearest side.
  return ex - Math.abs(p.x) < ey - Math.abs(p.y)
    ? { x: Math.sign(p.x || 1) * ex, y: p.y }
    : { x: p.x, y: Math.sign(p.y || 1) * ey };
}

/** Upright, facing `heading`, cue held upright at the right side. `stride` animates walking. */
export function standPose(at: P2, heading: number, floorZ: number, stride = 0, walking = 0): Pose {
  const f = v3(Math.cos(heading), Math.sin(heading), 0);
  const s = v3(Math.sin(heading), -Math.cos(heading), 0);
  const swing = Math.sin(stride) * walking;
  const bob = Math.abs(Math.cos(stride)) * 0.025 * walking;
  const pelvis = v3(at.x, at.y, floorZ + PELVIS_Z - 0.02 * walking + bob);
  const neck = add(pelvis, v3(f.x * 0.03 * walking, f.y * 0.03 * walking, TORSO));
  const head = add(neck, v3(0, 0, NECK));
  const lSh = add(neck, add(scale(s, -SHOULDER), v3(0, 0, -0.04)));
  const rSh = add(neck, add(scale(s, SHOULDER), v3(0, 0, -0.04)));
  // Right hand holds the cue upright beside the body; the left arm hangs and swings.
  const rHand = add(rSh, add(add(scale(s, 0.1), scale(f, 0.2)), v3(0, 0, -0.42)));
  const lHand = add(lSh, add(add(scale(s, -0.06), scale(f, 0.18 * swing)), v3(0, 0, -0.54)));
  const lArm = twoBone(lSh, lHand, UPPER_ARM, FOREARM, add(lSh, add(scale(f, -0.3), v3(0, 0, -0.2))));
  const rArm = twoBone(
    rSh,
    rHand,
    UPPER_ARM,
    FOREARM,
    add(rSh, add(scale(f, -0.3), add(scale(s, 0.1), v3(0, 0, -0.2)))),
  );
  const lift = (k: number) => Math.max(0, k) * 0.07 * walking;
  const lFoot = add(
    flat(at, floorZ + FOOT_Z + lift(Math.sin(stride + Math.PI / 2))),
    add(scale(s, -HIP), scale(f, -0.22 * swing)),
  );
  const rFoot = add(
    flat(at, floorZ + FOOT_Z + lift(-Math.sin(stride + Math.PI / 2))),
    add(scale(s, HIP), scale(f, 0.22 * swing)),
  );
  const cueButt = v3(rArm.end.x + f.x * 0.03, rArm.end.y + f.y * 0.03, floorZ + 0.03 + 0.12 * walking);
  const cueTip = add(cueButt, scale(norm(v3(f.x * 0.06, f.y * 0.06, 1)), CUE_LEN));
  return legs(
    {
      pelvis,
      neck,
      head,
      lSh,
      rSh,
      lEl: lArm.mid,
      rEl: rArm.mid,
      lHand: lArm.end,
      rHand: rArm.end,
      lHip: add(pelvis, add(scale(s, -HIP), v3(0, 0, -0.04))),
      rHip: add(pelvis, add(scale(s, HIP), v3(0, 0, -0.04))),
      lFoot,
      rFoot,
      toes: f,
      cueTip,
      cueButt,
      restHead: rArm.end,
      restButt: rArm.end,
    },
    f,
  );
}

/** Sitting on a chair at `at`, facing `heading`, the cue leaning against the shoulder. */
export function sitPose(at: P2, heading: number, floorZ: number): Pose {
  const f = v3(Math.cos(heading), Math.sin(heading), 0);
  const s = v3(Math.sin(heading), -Math.cos(heading), 0);
  const pelvis = v3(at.x, at.y, floorZ + 0.5);
  const neck = add(pelvis, add(scale(f, 0.04), v3(0, 0, TORSO)));
  const head = add(neck, add(scale(f, 0.02), v3(0, 0, NECK)));
  const lSh = add(neck, add(scale(s, -SHOULDER), v3(0, 0, -0.04)));
  const rSh = add(neck, add(scale(s, SHOULDER), v3(0, 0, -0.04)));
  const lHip = add(pelvis, scale(s, -HIP));
  const rHip = add(pelvis, scale(s, HIP));
  const knee = (hip: P3) => add(hip, add(scale(f, THIGH), v3(0, 0, 0.02)));
  const lKnee = knee(lHip);
  const rKnee = knee(rHip);
  const foot = (k: P3) => v3(k.x + f.x * 0.06, k.y + f.y * 0.06, floorZ + FOOT_Z);
  const lHand = add(lKnee, add(scale(f, -0.12), v3(0, 0, 0.06)));
  const rHand = add(rSh, add(add(scale(f, 0.25), scale(s, 0.02)), v3(0, 0, -0.18)));
  const lArm = twoBone(lSh, lHand, UPPER_ARM, FOREARM, add(lSh, add(scale(f, -0.2), v3(0, 0, -0.3))));
  const rArm = twoBone(rSh, rHand, UPPER_ARM, FOREARM, add(rSh, add(scale(s, 0.3), v3(0, 0, -0.3))));
  const cueButt = v3(at.x + f.x * 0.5 + s.x * 0.2, at.y + f.y * 0.5 + s.y * 0.2, floorZ + 0.02);
  const cueTip = add(cueButt, scale(norm(sub(add(rArm.end, v3(0, 0, 0.2)), cueButt)), CUE_LEN));
  return {
    pelvis,
    neck,
    head,
    lSh,
    rSh,
    lEl: lArm.mid,
    rEl: rArm.mid,
    lHand: lArm.end,
    rHand: rArm.end,
    lHip,
    rHip,
    lKnee,
    rKnee,
    lFoot: foot(lKnee),
    rFoot: foot(rKnee),
    toes: f,
    cueTip,
    cueButt,
    restHead: rArm.end,
    restButt: rArm.end,
  };
}

/** Where the player stands (pelvis, on the floor plan) to play a shot. */
export function stanceSpot(st: StanceInput, t: TableFrame): P2 {
  const back = { x: -Math.cos(st.shot.aim), y: -Math.sin(st.shot.aim) };
  const side = { x: Math.sin(st.shot.aim), y: -Math.cos(st.shot.aim) };
  const edge = exitDistance(st.ball, back, t.hx, t.hy);
  // With the rest the player stands back by the butt of the cue, the cue past the right hip.
  const onRest = chooseTool(st, t).tool !== 'hand';
  const ce = Math.cos(st.shot.elevation);
  const D = Math.max(edge + BODY_CLEAR, onRest ? st.R + (CUE_LEN - 0.3) * ce : 0.95);
  const off = onRest ? 0.2 : 0.1;
  const p = { x: st.ball.x + back.x * D - side.x * off, y: st.ball.y + back.y * D - side.y * off };
  return outsideTable(p, t, BODY_CLEAR * 0.7);
}

/**
 * The stance for a shot, right-handed: bridge hand planted on the cloth (or the rail, or a rest when
 * it is out of reach) under the cue line, chin over the cue, grip hand on the butt following the
 * stroke, feet outside the table.
 */
export function stancePose(st: StanceInput, t: TableFrame): Pose {
  const aim = st.shot.aim;
  const h = v3(Math.cos(aim), Math.sin(aim), 0);
  const b = scale(h, -1);
  const s = v3(Math.sin(aim), -Math.cos(aim), 0);
  // The cue as it lies before the stroke (the bridge and grip stay where they are on it).
  const rest = cueLine({ ...st, gap: 0.015 });
  const live = cueLine(st);
  const at = (k: number, line = rest) => add(line.tip, scale(line.u, k));

  const { tool, kb } = chooseTool(st, t);
  const onRest = tool !== 'hand';
  const cb = at(kb);
  const onCloth = Math.abs(cb.x) <= t.hl && Math.abs(cb.y) <= t.hw;
  const surface = onCloth ? 0 : t.railTop;
  // Bridge hand under the cue (raised as high as the cue is, e.g. over a ball in the way).
  const bridge = v3(cb.x - s.x * 0.01, cb.y - s.y * 0.01, Math.max(cb.z - 0.03, surface + 0.02));

  // Pelvis outside the table, torso leaning so the chin is just over the cue: near the bridge
  // normally, back near the butt on the rest.
  const spot = stanceSpot(st, t);
  let pelvis = flat(spot, t.floorZ + PELVIS_Z - (onRest ? 0.05 : 0.11));
  const chin = add(
    at(onRest ? CUE_LEN - 0.42 : kb + 0.24),
    add(v3(0, 0, onRest ? 0.14 : 0.1), scale(s, -0.02)),
  );
  const neckGoal = add(chin, add(scale(b, 0.12), v3(0, 0, -0.04)));
  const short = TORSO - len(sub(neckGoal, pelvis));
  if (short > 0) pelvis = add(pelvis, scale(b, short));
  let dir = norm(sub(neckGoal, pelvis));
  // Never lean further than about 75° from upright.
  const maxLean = Math.cos((75 * Math.PI) / 180);
  if (dir.z < maxLean) {
    const hz = Math.hypot(dir.x, dir.y);
    const k = Math.sqrt(1 - maxLean * maxLean) / hz;
    dir = v3(dir.x * k, dir.y * k, maxLean);
  }
  const neck = add(pelvis, scale(dir, TORSO));
  const head = add(neck, scale(norm(sub(add(chin, v3(0, 0, 0.06)), neck)), NECK));
  const lSh = add(neck, add(scale(s, -SHOULDER), scale(dir, -0.04)));
  const rSh = add(neck, add(scale(s, SHOULDER * 0.8), scale(dir, -0.04)));

  // Bridge hand, or the rest: its head under the cue on the cloth (z is the height of the cue on
  // it), its shaft back to the left hand holding it down on the table.
  let lHand = bridge;
  let restHead = bridge;
  let restButt = bridge;
  if (onRest) {
    restHead = v3(
      cb.x,
      cb.y,
      tool === 'spider' ? Math.max(cb.z - 0.006, 2 * st.R + 0.012) : Math.min(cb.z - 0.006, SPIDER_H - 0.03),
    );
    const toward = norm(sub(flat(lSh), flat(cb)));
    const reachBack = Math.min(1.35, Math.hypot(lSh.x - cb.x, lSh.y - cb.y) - 0.2);
    restButt = v3(cb.x + toward.x * reachBack, cb.y + toward.y * reachBack, 0);
    const butt = flat(restButt);
    const z = Math.abs(butt.x) <= t.hl && Math.abs(butt.y) <= t.hw ? 0.03 : t.railTop + 0.03;
    restButt = v3(butt.x, butt.y, z);
    lHand = add(lerp3(restHead, restButt, 0.9), v3(0, 0, 0.03));
  }
  const lArm = twoBone(lSh, lHand, UPPER_ARM, FOREARM, add(lSh, add(scale(s, -0.4), v3(0, 0, -0.25))));

  // Grip hand: on the cue a little behind the right shoulder (right at the butt on the rest),
  // moving with the stroke.
  const kg = onRest
    ? CUE_LEN - 0.1
    : Math.min(
        CUE_LEN - 0.05,
        Math.max(
          kb + 0.4,
          (rSh.x - rest.tip.x) * rest.u.x +
            (rSh.y - rest.tip.y) * rest.u.y +
            (rSh.z - rest.tip.z) * rest.u.z +
            0.14,
        ),
      );
  const grip = at(kg, live);
  const rArm = twoBone(
    rSh,
    grip,
    UPPER_ARM,
    FOREARM,
    onRest
      ? add(rSh, add(scale(s, 0.45), v3(0, 0, 0.05)))
      : add(rSh, add(scale(b, 0.25), add(scale(s, 0.12), v3(0, 0, 0.35)))),
  );

  // Feet: right foot behind on the cue line, left foot forward and to the left.
  const floor = t.floorZ + FOOT_Z;
  const rF = outsideTable(
    { x: spot.x + b.x * 0.18 + s.x * 0.16, y: spot.y + b.y * 0.18 + s.y * 0.16 },
    t,
    0.06,
  );
  const lF = outsideTable(
    { x: spot.x + h.x * 0.22 - s.x * 0.22, y: spot.y + h.y * 0.22 - s.y * 0.22 },
    t,
    0.06,
  );
  const toes = norm(add(h, scale(s, -0.5)));
  return legs(
    {
      pelvis,
      neck,
      head,
      lSh,
      rSh,
      lEl: lArm.mid,
      rEl: rArm.mid,
      lHand: lArm.end,
      rHand: rArm.end,
      lHip: add(pelvis, scale(s, -HIP)),
      rHip: add(pelvis, scale(s, HIP)),
      lFoot: flat(lF, floor),
      rFoot: flat(rF, floor),
      toes,
      cueTip: live.tip,
      cueButt: at(CUE_LEN, live),
      restHead,
      restButt,
      tool,
    },
    h,
  );
}

// ---------------------------------------------------------------------------------------------
// Meshes

const UP = new Vector3(0, 1, 0);
const tmpA = new Vector3();
const tmpB = new Vector3();
const basis = new Matrix4();

/** Points a mesh built along +y (centred) from a to b, stretching it to fit. */
function span(m: Object3D, a: P3, b: P3, baseLen: number): void {
  tmpA.set(a.x, a.y, a.z);
  tmpB.set(b.x, b.y, b.z);
  const d = tmpB.clone().sub(tmpA);
  const l = d.length();
  m.position.copy(tmpA).addScaledVector(d, 0.5);
  if (l > 1e-6) m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l));
  m.scale.set(1, l / baseLen, 1);
}

/**
 * A placeholder player: a low-poly mannequin posed procedurally every frame. It walks round the table
 * to each shot, gets down into a stance solved for that shot (bridge, chin, grip, feet) and strokes
 * with the cue, and sits in its chair while the opponent plays.
 */
export class Character {
  readonly group = new Group();
  /** The chair, placed in the scene separately from the body. */
  readonly chair = new Group();
  private readonly fig: FigureParts;
  private readonly cue = new Group();
  private readonly restMesh: Mesh;
  private readonly kit = tracker();
  private readonly restHead = new Group();
  private readonly cross = new Group();
  private readonly spider = new Group();
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: Material[] = [];

  /** Floor-plan position and facing of the body when standing or walking. */
  private pos: P2 = { x: 0, y: 0 };
  private heading = 0;
  private down = 0;
  private seated = 0;
  private path: P2[] | null = null;
  private walked = 0;
  private stride = 0;
  private chairAt: P2 = { x: 0, y: 0 };
  private chairHeading = 0;
  private table: TableFrame | null = null;
  /** The pose last shown (for tests and the camera). */
  pose: Pose | null = null;
  private placed = false;
  private lastStance: StanceInput | null = null;

  constructor(look: Look, cue: CueStyle = DEFAULT_CUE_STYLE) {
    const mat = (color: string, rough = 0.75) => {
      const m = new MeshStandardMaterial({ color, roughness: rough });
      this.mats.push(m);
      return m;
    };
    const geo = <G extends BufferGeometry>(g: G) => (this.geos.push(g), g);
    this.fig = buildFigure(
      look,
      { upperArm: UPPER_ARM, forearm: FOREARM, thigh: THIGH, shin: SHIN, neck: NECK },
      { geo, mat: (m) => (this.mats.push(m), m) },
    );
    const f = this.fig;
    this.group.add(f.torso, f.hips, f.head, f.neck);
    for (const side of ['l', 'r'] as const) this.group.add(...Object.values(f.limbs[side]));

    // The player's own cue (shown while standing, walking and sitting), the rest and the spider.
    this.cue.add(buildCue(this.kit, cue));
    this.group.add(this.cue);
    this.restMesh = buildRestShaft(this.kit);
    this.group.add(this.restMesh, this.restHead);
    this.cross.add(buildCross(this.kit));
    this.spider.add(buildSpider(this.kit));
    this.restHead.add(this.cross, this.spider);

    // Chair: seat, back and four legs.
    const wood = mat('#3a2416', 0.6);
    const seat = new Mesh(geo(new BoxGeometry(0.46, 0.46, 0.05)), mat('#5a1f1f', 0.8));
    seat.position.z = 0.46;
    const back = new Mesh(geo(new BoxGeometry(0.46, 0.05, 0.5)), wood);
    back.position.set(0, -0.22, 0.73);
    this.chair.add(seat, back);
    const legGeo = geo(new BoxGeometry(0.04, 0.04, 0.44));
    for (const [x, y] of [
      [-0.2, -0.2],
      [0.2, -0.2],
      [-0.2, 0.2],
      [0.2, 0.2],
    ] as const) {
      const l = new Mesh(legGeo, wood);
      l.position.set(x, y, 0.22);
      this.chair.add(l);
    }
  }

  setTable(t: TableFrame, chairAt: P2, chairHeading: number): void {
    this.table = t;
    this.chairAt = chairAt;
    this.chairHeading = chairHeading;
    // The chair is modelled facing +y.
    this.chair.position.set(chairAt.x, chairAt.y, t.floorZ);
    this.chair.rotation.set(0, 0, chairHeading - Math.PI / 2);
    this.placed = false;
  }

  /** True while walking or getting down/up: the player isn't ready to strike yet. */
  get busy(): boolean {
    return this.path !== null || (this.down > 0 && this.down < 1) || (this.seated > 0 && this.seated < 1);
  }

  get isDown(): boolean {
    return this.down >= 1;
  }

  /** Snaps straight to what is wanted (new rack, new table). */
  place(want: Want): void {
    this.placed = false;
    this.update(0, want);
  }

  /** Advances the player towards what is wanted and poses the meshes. Returns true while animating. */
  update(dt: number, want: Want): boolean {
    const t = this.table;
    if (!t) return false;
    const target: P2 =
      want.kind === 'shoot'
        ? stanceSpot(want.stance, t)
        : want.kind === 'sit'
          ? this.chairAt
          : // Watching: stand back from the table, never on it.
            outsideTable(want.at ?? this.pos, t, BODY_CLEAR + 0.35);
    const before = {
      down: this.down,
      seated: this.seated,
      pos: { ...this.pos },
      walking: this.path !== null,
    };

    if (!this.placed) {
      this.placed = true;
      this.pos = { ...target };
      this.path = null;
      this.down = want.kind === 'shoot' ? 1 : 0;
      this.seated = want.kind === 'sit' ? 1 : 0;
      this.heading =
        want.kind === 'sit'
          ? this.chairHeading
          : want.kind === 'shoot'
            ? want.stance.shot.aim
            : this.facingTable(this.pos);
    }

    const far = Math.hypot(target.x - this.pos.x, target.y - this.pos.y);
    if (!this.path && far > 0.3 && this.down < 0.5) {
      // Too far to shuffle: stand up and walk round the table.
      const m = BODY_CLEAR + 0.25;
      this.path = walkPath(this.pos, target, t.hx + m, t.hy + m);
      this.walked = 0;
    }
    if (this.path) {
      // Stand (or get up from the chair) before walking.
      if (this.down > 0) this.down = Math.max(0, this.down - dt * DOWN_RATE);
      else if (this.seated > 0) this.seated = Math.max(0, this.seated - dt * DOWN_RATE);
      else {
        // The path may have to change if the target moved a lot while walking.
        const end = this.path[this.path.length - 1]!;
        if (Math.hypot(end.x - target.x, end.y - target.y) > 0.3) {
          const m = BODY_CLEAR + 0.25;
          this.path = walkPath(this.pos, target, t.hx + m, t.hy + m);
          this.walked = 0;
        }
        this.walked += dt * WALK_SPEED;
        this.stride += dt * WALK_SPEED * 5.2;
        const total = pathLength(this.path);
        const p = alongPath(this.path, Math.min(this.walked, total));
        this.pos = p.p;
        this.heading = turnToward(this.heading, p.heading, dt * 8);
        if (this.walked >= total) this.path = null;
      }
    } else {
      // Close enough: shuffle into place and turn to face the shot.
      const k = 1 - Math.exp(-dt * 8);
      this.pos = { x: this.pos.x + (target.x - this.pos.x) * k, y: this.pos.y + (target.y - this.pos.y) * k };
      const face =
        want.kind === 'shoot'
          ? want.stance.shot.aim
          : want.kind === 'sit'
            ? this.chairHeading
            : this.facingTable(this.pos);
      this.heading = turnToward(this.heading, face, dt * 6);
      if (want.kind === 'shoot') {
        this.seated = Math.max(0, this.seated - dt * DOWN_RATE);
        if (this.seated === 0) this.down = Math.min(1, this.down + dt * DOWN_RATE);
      } else if (want.kind === 'sit') {
        this.down = Math.max(0, this.down - dt * DOWN_RATE);
        if (this.down === 0) this.seated = Math.min(1, this.seated + dt * DOWN_RATE);
      } else {
        this.down = Math.max(0, this.down - dt * DOWN_RATE);
        this.seated = Math.max(0, this.seated - dt * DOWN_RATE);
      }
    }

    const walking = this.path && this.down === 0 && this.seated === 0 ? 1 : 0;
    let pose = standPose(this.pos, this.heading, t.floorZ, this.stride, walking);
    if (this.seated > 0)
      pose = blend(pose, sitPose(this.chairAt, this.chairHeading, t.floorZ), smooth(this.seated));
    if (this.down > 0 && want.kind === 'shoot')
      pose = blend(pose, stancePose(want.stance, t), smooth(this.down));
    else if (this.down > 0 && this.lastStance)
      pose = blend(pose, stancePose(this.lastStance, t), smooth(this.down));
    if (want.kind === 'shoot') this.lastStance = want.stance;
    this.pose = pose;
    this.apply(pose);
    return (
      walking === 1 ||
      before.down !== this.down ||
      before.seated !== this.seated ||
      Math.hypot(before.pos.x - this.pos.x, before.pos.y - this.pos.y) > 1e-5 ||
      before.walking !== (this.path !== null)
    );
  }

  /** Shows or hides the player's own cue (the shot cue takes over in the stance). */
  set ownCue(on: boolean) {
    this.cue.visible = on;
  }

  private facingTable(p: P2): number {
    const t = this.table!;
    // Face the nearest point on the table.
    const q = { x: Math.max(-t.hx, Math.min(t.hx, p.x)), y: Math.max(-t.hy, Math.min(t.hy, p.y)) };
    return Math.atan2(q.y - p.y, q.x - p.x);
  }

  private apply(p: Pose): void {
    const F = this.fig;
    // Torso: centred between pelvis and neck, its width across the shoulders.
    const up = norm(sub(p.neck, p.pelvis));
    const across = norm(sub(p.rSh, p.lSh));
    const fwd = norm(cross(up, across));
    const x = norm(cross(up, fwd));
    basis.makeBasis(
      new Vector3(x.x, x.y, x.z),
      new Vector3(up.x, up.y, up.z),
      new Vector3(fwd.x, fwd.y, fwd.z),
    );
    F.torso.quaternion.setFromRotationMatrix(basis);
    const mid = lerp3(p.pelvis, p.neck, 0.5);
    F.torso.position.set(mid.x, mid.y, mid.z);
    F.torso.scale.set(1, len(sub(p.neck, p.pelvis)) / TORSO, 1);
    F.hips.position.set(p.pelvis.x, p.pelvis.y, p.pelvis.z);
    F.hips.quaternion.copy(F.torso.quaternion);
    span(F.neck, p.neck, p.head, NECK);
    // Head: upright, facing where the body faces (along the cue when down on a shot).
    const face = norm(v3(fwd.x + up.x, fwd.y + up.y, 0.15 * (fwd.z + up.z)));
    const hx = norm(cross(v3(0, 0, 1), face));
    const hy = norm(cross(face, hx));
    basis.makeBasis(
      new Vector3(hx.x, hx.y, hx.z),
      new Vector3(hy.x, hy.y, hy.z),
      new Vector3(face.x, face.y, face.z),
    );
    F.head.quaternion.setFromRotationMatrix(basis);
    const hc = add(p.head, scale(hy, -0.035));
    F.head.position.set(hc.x, hc.y, hc.z);
    for (const [s, sh, el, hand, hip, knee, foot] of [
      ['l', p.lSh, p.lEl, p.lHand, p.lHip, p.lKnee, p.lFoot],
      ['r', p.rSh, p.rEl, p.rHand, p.rHip, p.rKnee, p.rFoot],
    ] as const) {
      const L = F.limbs[s];
      L.shoulder.position.set(sh.x, sh.y, sh.z);
      span(L.upper, sh, el, UPPER_ARM);
      L.elbow.position.set(el.x, el.y, el.z);
      span(L.fore, el, hand, FOREARM);
      // Hand continues the forearm from the wrist.
      const wrist = norm(sub(hand, el));
      L.hand.position.set(hand.x, hand.y, hand.z);
      L.hand.quaternion.setFromUnitVectors(UP, new Vector3(wrist.x, wrist.y, wrist.z));
      span(L.thigh, hip, knee, THIGH);
      L.knee.position.set(knee.x, knee.y, knee.z);
      span(L.shin, knee, foot, SHIN);
      L.shoe.position.set(foot.x, foot.y, foot.z - 0.005);
      L.shoe.rotation.set(0, 0, Math.atan2(p.toes.y, p.toes.x) - Math.PI / 2);
    }
    // Own cue from butt to tip.
    tmpA.set(p.cueTip.x, p.cueTip.y, p.cueTip.z);
    tmpB.set(p.cueButt.x - p.cueTip.x, p.cueButt.y - p.cueTip.y, p.cueButt.z - p.cueTip.z).normalize();
    // Built from the tip (origin) along +y to the butt.
    this.cue.position.copy(tmpA);
    this.cue.quaternion.setFromUnitVectors(UP, tmpB);
    // Rest.
    const restLen = len(sub(p.restButt, p.restHead));
    const using = restLen > 0.2;
    this.restMesh.visible = this.restHead.visible = using;
    if (using) {
      // The head stands on the cloth (or rail) under the cue; the pose's head z is the cue height.
      const h = p.restHead.z;
      const spider = p.tool === 'spider';
      const foot = v3(p.restHead.x, p.restHead.y, spider ? 0 : Math.max(0, h - CROSS_H));
      // A spider's shaft meets it at the back of the arch, clear of the ball underneath.
      const toHead = norm(v3(p.restHead.x - p.restButt.x, p.restHead.y - p.restButt.y, 0));
      const sock = spider ? SPIDER_SOCKET : CROSS_SOCKET;
      const zs = spider ? h / SPIDER_H : 1;
      const end = v3(foot.x + toHead.x * sock.y, foot.y + toHead.y * sock.y, foot.z + sock.z * zs);
      span(this.restMesh, p.restButt, end, 1);
      this.restHead.position.set(foot.x, foot.y, foot.z);
      this.restHead.rotation.set(
        0,
        0,
        Math.atan2(p.restHead.y - p.restButt.y, p.restHead.x - p.restButt.x) - Math.PI / 2,
      );
      // The spider goes over a ball; the cross for an ordinary rest shot.
      // A tall spider (for a steep cue) stretches up to the cue.
      this.restHead.scale.set(1, 1, spider ? h / SPIDER_H : 1);
      this.cross.visible = !spider;
      this.spider.visible = spider;
    }
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.kit.dispose();
  }
}

function turnToward(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * Math.min(1, k);
}
