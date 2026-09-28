import { NewOutboxRecord, OutboxRecord } from './OutboxRecord';
import { OutboxRepository } from './OutboxRepository';

export class InMemoryOutboxRepository implements OutboxRepository {
  private readonly store = new Map<string, OutboxRecord>();

  async save(record: NewOutboxRecord): Promise<void> {
    this.store.set(record.id, {
      ...record,
      correlationId: record.correlationId ?? null,
      publishedAt: null,
      attempts: 0,
      lastError: null,
      deadLetteredAt: null,
    });
  }

  /** Returns copies, not the stored objects: OutboxRelay holds onto its
   * `pending` array across a `recordFailure`/`markDeadLettered` call for
   * the *same* record, and a live reference would make that later call
   * silently mutate the value the relay is still reading (e.g. its retry
   * count check) in the same loop iteration — the identical class of bug
   * ShowSeat.clone() exists to prevent for repository reads. */
  async findUnpublished(limit: number): Promise<OutboxRecord[]> {
    return [...this.store.values()]
      .filter((r) => !r.publishedAt && !r.deadLetteredAt)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async markPublished(id: string): Promise<void> {
    const record = this.store.get(id);
    if (record) {
      record.publishedAt = new Date();
    }
  }

  async recordFailure(id: string, error: string): Promise<void> {
    const record = this.store.get(id);
    if (record) {
      record.attempts += 1;
      record.lastError = error;
    }
  }

  async markDeadLettered(id: string): Promise<void> {
    const record = this.store.get(id);
    if (record) {
      record.deadLetteredAt = new Date();
    }
  }
}
