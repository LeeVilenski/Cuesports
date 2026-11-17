import type { AiShot } from '@cuesports/ai';
import type { AiRequest, AiResponse } from './ai.worker';

/** Runs the AI's shot search in a Web Worker so the game keeps rendering while it thinks. */
export class AiClient {
  private worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
  private next = 1;
  private pending = new Map<number, (r: AiResponse) => void>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<AiResponse>) => {
      this.pending.get(e.data.id)?.(e.data);
      this.pending.delete(e.data.id);
    };
  }

  choose(request: Omit<AiRequest, 'id'>): Promise<{ ai: AiShot; ms: number }> {
    const id = this.next++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ ...request, id });
    });
  }
}
