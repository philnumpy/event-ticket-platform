import request from 'supertest';
import { buildTestApp, TestApp } from './testApp';
import { InMemoryTokenBucketRateLimiter } from '../src/common/rate-limit/InMemoryTokenBucketRateLimiter';

describe('Rate limiting (TokenBucketGuard, applied globally)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    // A tiny, deliberately-isolated bucket -- this test builds its own app
    // instance specifically so a small capacity here can't make unrelated
    // e2e test files flaky (see BuildTestAppOptions in testApp.ts).
    testApp = await buildTestApp({
      rateLimiter: new InMemoryTokenBucketRateLimiter({ capacity: 3, refillTokensPerSecond: 0 }),
    });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('allows requests up to the bucket capacity, then returns 429', async () => {
    const http = testApp.app.getHttpServer();

    for (let i = 0; i < 3; i++) {
      const res = await request(http).get('/shows');
      expect(res.status).toBe(200);
    }

    const limited = await request(http).get('/shows');
    expect(limited.status).toBe(429);
  });

  it('applies the same bucket across different routes for the same client', async () => {
    // The previous test already exhausted this suite's shared bucket (same
    // supertest agent/IP, same app instance) -- every route should be 429
    // now, proving the limiter is keyed per-client, not per-route.
    const res = await request(testApp.app.getHttpServer())
      .post('/admin/venues')
      .send({ name: 'x', city: 'x', address: 'x' });

    expect(res.status).toBe(429);
  });
});
