export interface OutboxRecord {
  id: string;
  type: string;
  payload: unknown;
  occurredAt: Date;
  publishedAt: Date | null;
  attempts: number;
  lastError: string | null;
  /** Set once attempts exhausts the relay's retry budget. A dead-lettered
   * record is excluded from further relay attempts but stays in the table
   * for operator inspection/replay, rather than being deleted. */
  deadLetteredAt: Date | null;
  /** The correlation ID of the request that caused this event, if the
   * caller supplied one (core-api's CorrelationIdMiddleware does). Carried
   * through to Kafka as a message header by KafkaEventPublisher, so a
   * trace can be followed from the original HTTP request through to
   * notification-service's log line for the resulting notification. */
  correlationId: string | null;
}

export interface NewOutboxRecord {
  id: string;
  type: string;
  payload: unknown;
  occurredAt: Date;
  correlationId?: string | null;
}
