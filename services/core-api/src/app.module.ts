import { Module } from '@nestjs/common';
import { PersistenceModule } from './persistence/persistence.module';
import { DomainModule } from './persistence/domain.module';
import { MessagingModule } from './messaging/messaging.module';
import { CommonModule } from './common/common.module';
import { CatalogModule } from './catalog/catalog.module';
import { BookingModule } from './booking/booking.module';
import { AdminModule } from './admin/admin.module';
import { BookingSagaModule } from './saga/booking-saga.module';

@Module({
  imports: [
    PersistenceModule,
    DomainModule,
    MessagingModule,
    CommonModule,
    CatalogModule,
    BookingModule,
    AdminModule,
    BookingSagaModule,
  ],
})
export class AppModule {}
