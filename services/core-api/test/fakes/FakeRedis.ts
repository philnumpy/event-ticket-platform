/**
 * A minimal stand-in for the slice of ioredis's API this app actually uses
 * (GET/SET with NX+PX/EX, DEL). Deliberately hand-rolled rather than
 * ioredis-mock: it's a handful of methods, and writing them out makes the
 * NX-lock semantics CatalogCacheService depends on explicit and easy to
 * trust in a test double.
 */
export class FakeRedis {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Real Redis's SET NX is a single atomic server-side command — that
   * atomicity is the entire reason CatalogCacheService uses it as a lock.
   * This must reproduce that: the NX existence check and the write below
   * happen with no `await` between them, so nothing can interleave, exactly
   * like InMemoryShowSeatRepository.tryTransition. An earlier version of
   * this fake called `await this.get(key)` here, which reintroduced a
   * check-then-act race and let every concurrent caller "win" the lock —
   * the same class of bug ADR 0002 exists to document.
   */
  async set(
    key: string,
    value: string,
    ...args: Array<string | number>
  ): Promise<'OK' | null> {
    const upper = args.map((a) => (typeof a === 'string' ? a.toUpperCase() : a));
    const nx = upper.includes('NX');
    const pxIndex = upper.indexOf('PX');
    const exIndex = upper.indexOf('EX');

    if (nx) {
      const existing = this.store.get(key);
      const isLive = existing && (existing.expiresAt === null || existing.expiresAt > Date.now());
      if (isLive) {
        return null;
      }
    }

    let expiresAt: number | null = null;
    if (pxIndex !== -1) {
      expiresAt = Date.now() + Number(args[pxIndex + 1]);
    } else if (exIndex !== -1) {
      expiresAt = Date.now() + Number(args[exIndex + 1]) * 1000;
    }

    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  disconnect(): void {
    this.store.clear();
  }
}
