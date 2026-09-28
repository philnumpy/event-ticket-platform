import request from 'supertest';
import { buildTestApp, TestApp } from './testApp';

describe('GET /metrics', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('exposes Prometheus text format with the default process metrics', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('process_cpu_user_seconds_total');
  });

  it('records a request made just before the scrape', async () => {
    await request(testApp.app.getHttpServer()).get('/shows');

    const res = await request(testApp.app.getHttpServer()).get('/metrics');

    expect(res.text).toContain('http_requests_total');
    expect(res.text).toMatch(/http_requests_total\{[^}]*route="\/shows"[^}]*}\s+\d+/);
  });

  it('records HTTP request duration histogram buckets', async () => {
    await request(testApp.app.getHttpServer()).get('/shows');

    const res = await request(testApp.app.getHttpServer()).get('/metrics');

    expect(res.text).toContain('http_request_duration_seconds_bucket');
  });
});
