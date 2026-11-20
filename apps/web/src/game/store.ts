import type { Highlight, MatchRecord } from './record';

/**
 * Saved matches and highlights, in IndexedDB. Where IndexedDB is missing or refuses (a private
 * window, blocked site data) everything still works for the session, kept in memory.
 */

type StoreName = 'matches' | 'highlights';

/** Matches kept; the oldest go first. Highlights are kept until deleted. */
export const MAX_MATCHES = 100;

export interface Store {
  putMatch(m: MatchRecord): Promise<void>;
  /** Newest first. */
  matches(): Promise<MatchRecord[]>;
  putHighlight(h: Highlight): Promise<void>;
  /** Newest first. */
  highlights(): Promise<Highlight[]>;
  deleteHighlight(id: string): Promise<void>;
  clear(): Promise<void>;
}

const newestFirst = <T extends { date: number }>(xs: T[]): T[] => xs.sort((a, b) => b.date - a.date);

export class MemoryStore implements Store {
  private data: Record<StoreName, Map<string, unknown>> = { matches: new Map(), highlights: new Map() };

  putMatch(m: MatchRecord): Promise<void> {
    this.data.matches.set(m.id, structuredClone(m));
    const all = newestFirst([...this.data.matches.values()] as MatchRecord[]);
    for (const old of all.slice(MAX_MATCHES)) this.data.matches.delete(old.id);
    return Promise.resolve();
  }

  matches(): Promise<MatchRecord[]> {
    return Promise.resolve(newestFirst(structuredClone([...this.data.matches.values()] as MatchRecord[])));
  }

  putHighlight(h: Highlight): Promise<void> {
    this.data.highlights.set(h.id, structuredClone(h));
    return Promise.resolve();
  }

  highlights(): Promise<Highlight[]> {
    return Promise.resolve(newestFirst(structuredClone([...this.data.highlights.values()] as Highlight[])));
  }

  deleteHighlight(id: string): Promise<void> {
    this.data.highlights.delete(id);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.data.matches.clear();
    this.data.highlights.clear();
    return Promise.resolve();
  }
}

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });

class IdbStore implements Store {
  constructor(private db: IDBDatabase) {}

  private tx(name: StoreName, mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(name, mode).objectStore(name);
  }

  async putMatch(m: MatchRecord): Promise<void> {
    await req(this.tx('matches', 'readwrite').put(m));
    const keys = (await req(this.tx('matches', 'readonly').index('date').getAllKeys())) as string[];
    // Keys come oldest first.
    const extra = keys.length - MAX_MATCHES;
    if (extra > 0) {
      const s = this.tx('matches', 'readwrite');
      await Promise.all(keys.slice(0, extra).map((k) => req(s.delete(k))));
    }
  }

  async matches(): Promise<MatchRecord[]> {
    return newestFirst(await req(this.tx('matches', 'readonly').getAll()));
  }

  async putHighlight(h: Highlight): Promise<void> {
    await req(this.tx('highlights', 'readwrite').put(h));
  }

  async highlights(): Promise<Highlight[]> {
    return newestFirst(await req(this.tx('highlights', 'readonly').getAll()));
  }

  async deleteHighlight(id: string): Promise<void> {
    await req(this.tx('highlights', 'readwrite').delete(id));
  }

  async clear(): Promise<void> {
    await req(this.tx('matches', 'readwrite').clear());
    await req(this.tx('highlights', 'readwrite').clear());
  }
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('cuesports', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('matches', { keyPath: 'id' }).createIndex('date', 'date');
      db.createObjectStore('highlights', { keyPath: 'id' }).createIndex('date', 'date');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB unavailable'));
    r.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

/** Opens the saved data, falling back to memory. */
export async function openStore(): Promise<Store> {
  try {
    if (typeof indexedDB === 'undefined') return new MemoryStore();
    return new IdbStore(await openIdb());
  } catch {
    return new MemoryStore();
  }
}
