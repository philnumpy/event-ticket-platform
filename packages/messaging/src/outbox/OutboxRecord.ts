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
}

export interface NewOutboxRecord {
  id: string;
  type: string;
  payload: unknown;
  occurredAt: Date;
}
