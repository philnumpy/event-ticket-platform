export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
}

export interface RateLimiter {
  tryConsume(key: string, cost?: number): Promise<RateLimitResult>;
}
