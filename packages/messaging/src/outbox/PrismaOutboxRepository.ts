import type { PrismaClient } from '@prisma/client';
import { NewOutboxRecord, OutboxRecord } from './OutboxRecord';
import { OutboxRepository } from './OutboxRepository';

interface OutboxEventRecord {
  id: string;
  type: string;
  payload: unknown;
  occurredAt: Date;
  publishedAt: Date | null;
  attempts: number;
  lastError: string | null;
  deadLetteredAt: Date | null;
  correlationId: string | null;
}

export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(record: NewOutboxRecord): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        id: record.id,
        type: record.type,
        payload: record.payload as object,
        occurredAt: record.occurredAt,
        correlationId: record.correlationId ?? null,
      },
    });
  }

  async findUnpublished(limit: number): Promise<OutboxRecord[]> {
    const records = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null, deadLetteredAt: null },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });
    return records.map((record: OutboxEventRecord) => this.toDomain(record));
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { publishedAt: new Date() },
    });
  }

  async recordFailure(id: string, error: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { attempts: { increment: 1 }, lastError: error },
    });
  }

  async markDeadLettered(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { deadLetteredAt: new Date() },
    });
  }

  private toDomain(record: OutboxEventRecord): OutboxRecord {
    return {
      id: record.id,
      type: record.type,
      payload: record.payload,
      occurredAt: record.occurredAt,
      publishedAt: record.publishedAt,
      attempts: record.attempts,
      lastError: record.lastError,
      deadLetteredAt: record.deadLetteredAt,
      correlationId: record.correlationId,
    };
  }
}
