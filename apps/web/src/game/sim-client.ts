import { simulate, type BallState, type ShotInput, type ShotResult } from '@cuesports/physics';
import type { TableSpec } from '@cuesports/shared';
import type { SimRequest, SimResponse } from './sim.worker';

/** Runs shots in a Web Worker so a long break never stalls rendering. Falls back to the main thread. */
export class SimClient {
  private worker: Worker | null = null;
  private next = 1;
  private pending = new Map<number, (r: SimResponse) => void>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<SimResponse>) => {
        this.pending.get(e.data.id)?.(e.data);
        this.pending.delete(e.data.id);
      };
      this.worker.onerror = () => {
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  run(table: TableSpec, balls: BallState[], shot: ShotInput): Promise<{ result: ShotResult; ms: number }> {
    if (!this.worker) {
      const t0 = performance.now();
      const result = simulate(table, balls, shot, { sampleRate: 120 });
      return Promise.resolve({ result, ms: performance.now() - t0 });
    }
    const id = this.next++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ id, table, balls, shot } satisfies SimRequest);
    });
  }
}
