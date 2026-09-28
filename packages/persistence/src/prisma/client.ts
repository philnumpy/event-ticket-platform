import { PrismaClient } from '@prisma/client';

export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();
}
