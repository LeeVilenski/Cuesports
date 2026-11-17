import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AMERICAN_POOL_9FT, ENGLISH_POOL_7FT, SNOOKER_12FT, type TableSpec } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { layout, type LayoutId } from './layouts';
import { simulate } from './simulate';
import type { ShotInput } from './types';

/**
 * Golden-file tests: a fixed set of shots must keep producing bit-identical end states and
 * event timelines. A failure means the physics changed. If that was intended, regenerate with
 * `pnpm golden:update` and review the diff.
 */

interface GoldenCase {
  name: string;
  table: TableSpec;
  layout: LayoutId;
  seed: number;
  shot: ShotInput;
}

const CASES: GoldenCase[] = [
  {
    name: 'nine-ball break',
    table: AMERICAN_POOL_9FT,
    layout: 'nine-ball',
    seed: 1,
    shot: { ball: 'cue', aim: -0.0787, elevation: 0, tip: { a: 0, b: 0.1 }, speed: 9 },
  },
  {
    name: 'eight-ball break with side',
    table: AMERICAN_POOL_9FT,
    layout: 'eight-ball',
    seed: 2,
    shot: { ball: 'cue', aim: -0.04, elevation: 0.05, tip: { a: 0.2, b: -0.1 }, speed: 8 },
  },
  {
    name: 'blackball break',
    table: ENGLISH_POOL_7FT,
    layout: 'blackball',
    seed: 3,
    shot: { ball: 'cue', aim: -0.06, elevation: 0, tip: { a: -0.1, b: 0 }, speed: 7 },
  },
  {
    name: 'snooker break-off',
    table: SNOOKER_12FT,
    layout: 'snooker',
    seed: 4,
    shot: { ball: 'cue', aim: 0.033, elevation: 0, tip: { a: 0.3, b: 0.1 }, speed: 4 },
  },
  {
    name: 'masse',
    table: AMERICAN_POOL_9FT,
    layout: 'two-balls',
    seed: 1,
    shot: { ball: 'cue', aim: 0.05, elevation: 0.6, tip: { a: -0.4, b: -0.2 }, speed: 2 },
  },
  {
    name: 'draw shot',
    table: SNOOKER_12FT,
    layout: 'two-balls',
    seed: 1,
    shot: { ball: 'cue', aim: 0.01, elevation: 0.03, tip: { a: 0, b: -0.45 }, speed: 3 },
  },
];

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '__golden__', 'shots.json');

function run(c: GoldenCase) {
  const r = simulate(c.table, layout(c.table, c.layout, c.seed), c.shot, { sampleRate: 0 });
  return {
    duration: r.duration,
    final: r.final.map((b) => ({
      id: b.id,
      state: b.state,
      pocket: b.pocket ?? null,
      x: b.pos.x,
      y: b.pos.y,
      q: b.orient,
    })),
    events: r.events.filter((e) => e.type !== 'state'),
  };
}

describe('determinism', () => {
  it('the same shot twice gives identical results', () => {
    for (const c of CASES.slice(0, 2)) expect(run(c)).toEqual(run(c));
  });

  it('matches the golden files', () => {
    const actual = Object.fromEntries(CASES.map((c) => [c.name, run(c)]));
    if (!existsSync(file) && process.env.CI) throw new Error(`Missing golden file ${file}`);
    if (process.env.UPDATE_GOLDEN || !existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(actual, null, 1) + '\n');
    }
    const expected = JSON.parse(readFileSync(file, 'utf8')) as typeof actual;
    for (const c of CASES)
      expect(JSON.parse(JSON.stringify(actual[c.name])), c.name).toEqual(expected[c.name]);
  });
});
