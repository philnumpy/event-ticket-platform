import { NewOutboxRecord, OutboxRecord } from './OutboxRecord';

export interface OutboxRepository {
  save(record: NewOutboxRecord): Promise<void>;
  findUnpublished(limit: number): Promise<OutboxRecord[]>;
  markPublished(id: string): Promise<void>;
  recordFailure(id: string, error: string): Promise<void>;
  markDeadLettered(id: string): Promise<void>;
}
