import { PaymentOutcome } from '@etp/domain';

export interface MockGatewayConfig {
  /** Probability [0,1] the gateway reports a hard failure (e.g. card declined). */
  failureRate: number;
  /** Probability [0,1] the gateway reports a timeout, evaluated after failureRate. */
  timeoutRate: number;
  /** Probability [0,1] the gateway sends its response callback twice — the
   * exact "duplicate callbacks" behavior the platform is required to
   * tolerate, generated here rather than simulated by the consumer. */
  duplicateCallbackRate: number;
  minDelayMs: number;
  maxDelayMs: number;
}

export interface GatewayDecision {
  outcome: PaymentOutcome;
  duplicateCallback: boolean;
  delayMs: number;
}

export const DEFAULT_MOCK_GATEWAY_CONFIG: MockGatewayConfig = {
  failureRate: 0.1,
  timeoutRate: 0.05,
  duplicateCallbackRate: 0.05,
  minDelayMs: 50,
  maxDelayMs: 300,
};

export function loadMockGatewayConfigFromEnv(): MockGatewayConfig {
  return {
    failureRate: Number(process.env.PAYMENT_FAILURE_RATE ?? DEFAULT_MOCK_GATEWAY_CONFIG.failureRate),
    timeoutRate: Number(process.env.PAYMENT_TIMEOUT_RATE ?? DEFAULT_MOCK_GATEWAY_CONFIG.timeoutRate),
    duplicateCallbackRate: Number(
      process.env.PAYMENT_DUPLICATE_CALLBACK_RATE ?? DEFAULT_MOCK_GATEWAY_CONFIG.duplicateCallbackRate,
    ),
    minDelayMs: Number(process.env.PAYMENT_MIN_DELAY_MS ?? DEFAULT_MOCK_GATEWAY_CONFIG.minDelayMs),
    maxDelayMs: Number(process.env.PAYMENT_MAX_DELAY_MS ?? DEFAULT_MOCK_GATEWAY_CONFIG.maxDelayMs),
  };
}

/**
 * Pure decision function — no Kafka, no I/O, no Date.now() — so every rate
 * boundary is deterministically testable by passing a fixed `random`. main.ts
 * is the only place this gets wired to a real clock/Math.random/Kafka.
 */
export function decideOutcome(
  config: MockGatewayConfig,
  random: () => number = Math.random,
): GatewayDecision {
  const outcomeRoll = random();
  let outcome: PaymentOutcome;
  if (outcomeRoll < config.failureRate) {
    outcome = 'FAILED';
  } else if (outcomeRoll < config.failureRate + config.timeoutRate) {
    outcome = 'TIMEOUT';
  } else {
    outcome = 'SUCCESS';
  }

  const duplicateCallback = random() < config.duplicateCallbackRate;
  const delaySpread = Math.max(1, config.maxDelayMs - config.minDelayMs);
  const delayMs = config.minDelayMs + Math.floor(random() * delaySpread);

  return { outcome, duplicateCallback, delayMs };
}
