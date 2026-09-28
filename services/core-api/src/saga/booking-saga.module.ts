import { Module } from '@nestjs/common';
import { createKafkaClient, KafkaConsumerRunner, PAYMENT_GATEWAY_RESPONDED_TOPIC } from '@etp/messaging';
import { DomainModule } from '../persistence/domain.module';
import { BookingSagaService } from './booking-saga.service';
import { KafkaPaymentCommandPublisher } from './PaymentCommandPublisher';
import { PAYMENT_COMMAND_PUBLISHER, PAYMENT_RESPONSE_CONSUMER } from './tokens';

@Module({
  imports: [DomainModule],
  providers: [
    {
      provide: PAYMENT_COMMAND_PUBLISHER,
      useFactory: () => {
        const kafka = createKafkaClient('core-api-saga-producer');
        return new KafkaPaymentCommandPublisher(kafka.producer());
      },
    },
    {
      provide: PAYMENT_RESPONSE_CONSUMER,
      useFactory: () =>
        new KafkaConsumerRunner(createKafkaClient('core-api-saga-consumer'), {
          groupId: 'core-api-booking-saga',
          topics: [PAYMENT_GATEWAY_RESPONDED_TOPIC],
        }),
    },
    BookingSagaService,
  ],
})
export class BookingSagaModule {}
