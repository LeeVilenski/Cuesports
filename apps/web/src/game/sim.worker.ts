/// <reference lib="webworker" />
import { simulate, type BallState, type ShotInput, type ShotResult } from '@cuesports/physics';
import type { TableSpec } from '@cuesports/shared';

export interface SimRequest {
  id: number;
  table: TableSpec;
  balls: BallState[];
  shot: ShotInput;
}

export interface SimResponse {
  id: number;
  result: ShotResult;
  ms: number;
}

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { id, table, balls, shot } = e.data;
  const t0 = performance.now();
  const result = simulate(table, balls, shot, { sampleRate: 120 });
  const ms = performance.now() - t0;
  const transfer: Transferable[] = [];
  for (const f of result.frames) transfer.push(f.pos.buffer, f.orient.buffer, f.pocketed.buffer);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(
    { id, result, ms } satisfies SimResponse,
    transfer,
  );
};
