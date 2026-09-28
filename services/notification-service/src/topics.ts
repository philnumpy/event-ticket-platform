import { BOOKING_CANCELLED, BOOKING_CONFIRMED, BOOKING_EXPIRED, PAYMENT_FAILED, REFUND_PROCESSED } from '@etp/domain';

/** Matches KafkaEventPublisher's `${prefix}.${event.type}` topic naming —
 * kept as a constant derived from @etp/domain's own event-type constants
 * so the two can't silently drift apart. */
const PREFIX = 'etp';

export const NOTIFICATION_TOPICS = [
  `${PREFIX}.${BOOKING_CONFIRMED}`,
  `${PREFIX}.${BOOKING_CANCELLED}`,
  `${PREFIX}.${BOOKING_EXPIRED}`,
  `${PREFIX}.${PAYMENT_FAILED}`,
  `${PREFIX}.${REFUND_PROCESSED}`,
];

export function topicToEventType(topic: string): string {
  return topic.startsWith(`${PREFIX}.`) ? topic.slice(PREFIX.length + 1) : topic;
}
