import { Kafka, logLevel } from 'kafkajs';

export function createKafkaClient(clientId: string, brokers?: string[]): Kafka {
  return new Kafka({
    clientId,
    brokers: brokers ?? (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
    retry: { retries: 5 },
  });
}
