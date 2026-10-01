import { BOOKING_CANCELLED, CatalogQueryService, createEvent, DomainEventPublisher } from '@etp/domain';
import { CatalogCacheService } from '../src/catalog/catalog-cache.service';
import { FakeRedis } from './fakes/FakeRedis';

function buildCatalogStub(seatMap: jest.Mock, browse: jest.Mock = jest.fn()): CatalogQueryService {
  return { seatMap, browse } as unknown as CatalogQueryService;
}

describe('CatalogCacheService CACHE_ENABLED toggle (for the Phase 5 with/without-cache load test comparison)', () => {
  const originalEnv = process.env.CACHE_ENABLED;

  afterEach(() => {
    process.env.CACHE_ENABLED = originalEnv;
  });

  it('bypasses Redis entirely and recomputes every call when CACHE_ENABLED=false', async () => {
    process.env.CACHE_ENABLED = 'false';
    const seatMapSpy = jest.fn().mockResolvedValue(['fresh']);
    const cache = new CatalogCacheService(buildCatalogStub(seatMapSpy), new FakeRedis() as never, new DomainEventPublisher());

    await cache.seatMap('show-1');
    await cache.seatMap('show-1');

    expect(seatMapSpy).toHaveBeenCalledTimes(2);
  });

  it('caches normally when CACHE_ENABLED is unset (the default)', async () => {
    delete process.env.CACHE_ENABLED;
    const seatMapSpy = jest.fn().mockResolvedValue(['cached']);
    const cache = new CatalogCacheService(buildCatalogStub(seatMapSpy), new FakeRedis() as never, new DomainEventPublisher());

    await cache.seatMap('show-1');
    await cache.seatMap('show-1');

    expect(seatMapSpy).toHaveBeenCalledTimes(1);
  });
});

describe('CatalogCacheService', () => {
  it('serves a cached value on the second call without recomputing', async () => {
    const seatMapSpy = jest.fn().mockResolvedValue([{ seatId: 'seat-1', status: 'AVAILABLE' }]);
    const cache = new CatalogCacheService(buildCatalogStub(seatMapSpy), new FakeRedis() as never, new DomainEventPublisher());

    await cache.seatMap('show-1');
    await cache.seatMap('show-1');

    expect(seatMapSpy).toHaveBeenCalledTimes(1);
  });

  it('protects against a cache stampede: N concurrent misses compute exactly once', async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const seatMapSpy = jest.fn().mockImplementation(async () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight--;
      return [{ seatId: 'seat-1', status: 'AVAILABLE' }];
    });
    const cache = new CatalogCacheService(buildCatalogStub(seatMapSpy), new FakeRedis() as never, new DomainEventPublisher());

    await Promise.all(Array.from({ length: 20 }, () => cache.seatMap('show-1')));

    expect(seatMapSpy).toHaveBeenCalledTimes(1);
    expect(maxConcurrent).toBe(1);
  });

  it('invalidates the seat-map cache when a subscribed domain event fires', async () => {
    const seatMapSpy = jest.fn().mockResolvedValue([]);
    const publisher = new DomainEventPublisher();
    const cache = new CatalogCacheService(buildCatalogStub(seatMapSpy), new FakeRedis() as never, publisher);
    cache.onModuleInit();

    await cache.seatMap('show-1');
    expect(seatMapSpy).toHaveBeenCalledTimes(1);

    await publisher.publish(
      createEvent(BOOKING_CANCELLED, { bookingId: 'b1', userId: 'u1', showId: 'show-1', reason: 'x' }),
    );

    await cache.seatMap('show-1');
    expect(seatMapSpy).toHaveBeenCalledTimes(2); // recomputed after invalidation
  });

  it('does not invalidate a different show\'s cache entry', async () => {
    const seatMapSpy = jest.fn().mockResolvedValue([]);
    const publisher = new DomainEventPublisher();
    const cache = new CatalogCacheService(buildCatalogStub(seatMapSpy), new FakeRedis() as never, publisher);
    cache.onModuleInit();

    await cache.seatMap('show-1');
    await publisher.publish(
      createEvent(BOOKING_CANCELLED, { bookingId: 'b1', userId: 'u1', showId: 'show-2', reason: 'x' }),
    );
    await cache.seatMap('show-1');

    expect(seatMapSpy).toHaveBeenCalledTimes(1); // show-1's entry untouched
  });

  it('gives up waiting on a stuck lock holder and computes the value itself', async () => {
    const redis = new FakeRedis();
    await redis.set('lock:catalog:seatmap:show-1', '1', 'PX', 100_000, 'NX'); // simulates a crashed holder
    const seatMapSpy = jest.fn().mockResolvedValue(['fallback']);
    const cache = new CatalogCacheService(buildCatalogStub(seatMapSpy), redis as never, new DomainEventPublisher());

    const result = await cache.seatMap('show-1');

    expect(result).toEqual(['fallback']);
    expect(seatMapSpy).toHaveBeenCalledTimes(1);
  }, 10_000);
});

/** Always throws, standing in for Redis being completely unreachable
 * (connection refused, DNS failure, whatever) rather than just slow. */
class UnavailableRedis {
  async get(): Promise<never> {
    throw new Error('ECONNREFUSED (simulated)');
  }
  async set(): Promise<never> {
    throw new Error('ECONNREFUSED (simulated)');
  }
  async del(): Promise<never> {
    throw new Error('ECONNREFUSED (simulated)');
  }
}

describe('CatalogCacheService graceful degradation when Redis is unavailable', () => {
  it('still returns data by computing directly, on a browse() call', async () => {
    const browseSpy = jest.fn().mockResolvedValue([{ showId: 's1' }]);
    const cache = new CatalogCacheService(
      buildCatalogStub(jest.fn(), browseSpy),
      new UnavailableRedis() as never,
      new DomainEventPublisher(),
    );

    const result = await cache.browse({});

    expect(result).toEqual([{ showId: 's1' }]);
    expect(browseSpy).toHaveBeenCalledTimes(1);
  });

  it('still returns data by computing directly, on a seatMap() call', async () => {
    const seatMapSpy = jest.fn().mockResolvedValue(['seat-data']);
    const cache = new CatalogCacheService(
      buildCatalogStub(seatMapSpy),
      new UnavailableRedis() as never,
      new DomainEventPublisher(),
    );

    const result = await cache.seatMap('show-1');

    expect(result).toEqual(['seat-data']);
    expect(seatMapSpy).toHaveBeenCalledTimes(1);
  });

  it('invalidateSeatMap swallows the error instead of failing the caller', async () => {
    const cache = new CatalogCacheService(
      buildCatalogStub(jest.fn()),
      new UnavailableRedis() as never,
      new DomainEventPublisher(),
    );

    await expect(cache.invalidateSeatMap('show-1')).resolves.toBeUndefined();
  });

  it('every call still computes fresh (no caching happens) while Redis stays down', async () => {
    const seatMapSpy = jest.fn().mockResolvedValue(['fresh']);
    const cache = new CatalogCacheService(
      buildCatalogStub(seatMapSpy),
      new UnavailableRedis() as never,
      new DomainEventPublisher(),
    );

    await cache.seatMap('show-1');
    await cache.seatMap('show-1');

    expect(seatMapSpy).toHaveBeenCalledTimes(2); // never got to cache anything
  });
});
