import type Redis from 'ioredis';
import { TokenBucketConfig } from './TokenBucketMath';
import { RateLimitResult, RateLimiter } from './RateLimiter';

/**
 * Mirrors TokenBucketMath.refillAndConsume exactly — same read-refill-
 * compare-write sequence, same variable names, on purpose, so the two
 * don't quietly drift apart. Runs as a single Lua script because Redis
 * executes scripts atomically (no other command interleaves mid-script);
 * a GET-then-SET pair from application code would have the identical
 * check-then-act race every other naive read-modify-write in this
 * codebase turned out to have.
 *
 * Tokens are stored and returned via `tostring()`: Redis's Lua-to-RESP
 * conversion truncates a returned Lua *number* to an integer, which would
 * silently floor a fractional remaining-token count on every call. Storing
 * and returning it as a string avoids that entirely.
 */
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(bucket[1])
local ts = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  ts = now
end

local elapsedSeconds = math.max(0, (now - ts) / 1000)
tokens = math.min(capacity, tokens + elapsedSeconds * refillRate)

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', key, 60000)

return { allowed, tostring(tokens) }
`;

export class RedisTokenBucketRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly config: TokenBucketConfig,
  ) {}

  async tryConsume(key: string, cost = 1): Promise<RateLimitResult> {
    const now = Date.now();
    const result = (await this.redis.eval(
      TOKEN_BUCKET_SCRIPT,
      1,
      `ratelimit:${key}`,
      this.config.capacity,
      this.config.refillTokensPerSecond,
      now,
      cost,
    )) as [number, string];

    return { allowed: result[0] === 1, remainingTokens: parseFloat(result[1]) };
  }
}

export { TOKEN_BUCKET_SCRIPT };
