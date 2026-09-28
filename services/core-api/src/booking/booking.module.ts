import { Module } from '@nestjs/common';
import { DomainModule } from '../persistence/domain.module';
import { BookingController } from './booking.controller';

@Module({
  imports: [DomainModule],
  controllers: [BookingController],
})
export class BookingModule {}
