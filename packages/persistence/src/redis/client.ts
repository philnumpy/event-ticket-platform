import Redis from 'ioredis';

export function createRedisClient(url?: string): Redis {
  return new Redis(url ?? process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
  });
}
