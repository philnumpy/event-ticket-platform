import { Module } from '@nestjs/common';
import { PersistenceModule } from './persistence/persistence.module';
import { DomainModule } from './persistence/domain.module';
import { CatalogModule } from './catalog/catalog.module';
import { BookingModule } from './booking/booking.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [PersistenceModule, DomainModule, CatalogModule, BookingModule, AdminModule],
})
export class AppModule {}
