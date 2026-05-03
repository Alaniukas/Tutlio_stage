const DEFAULT_TTL = 300_000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  ts: number;
  ttl: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  store.set(key, { data, ts: Date.now(), ttl });
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function isCached(key: string): boolean {
  return getCached(key) !== null;
}

const inflightRequests = new Map<string, Promise<unknown>>();

export function dedupeAsync<T>(key: string, fn: () => PromiseLike<T> | T): Promise<T> {
  const existing = inflightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = Promise.resolve(fn()).finally(() => inflightRequests.delete(key)) as Promise<T>;
  inflightRequests.set(key, promise);
  return promise;
}
