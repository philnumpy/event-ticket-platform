import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { BookingApplicationService } from '@etp/domain';
import { InitiateBookingDto } from './dto/initiate-booking.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';

/**
 * Thin by design: every business rule (validation chain, pricing, seat
 * holds, state transitions, refund policy) lives in
 * BookingApplicationService. This controller's only job is HTTP shape —
 * cache invalidation, notifications, and everything else downstream of a
 * booking state change happen via the domain events the service already
 * publishes (see CatalogCacheService), not here.
 */
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingApplicationService) {}

  @Post()
  async initiate(@Body() dto: InitiateBookingDto) {
    return this.bookingService.initiateBooking(dto);
  }

  @Post(':id/payment')
  @HttpCode(HttpStatus.OK)
  async confirmPayment(@Param('id') id: string, @Body() dto: ConfirmPaymentDto) {
    return this.bookingService.confirmPayment(id, dto.outcome, dto.idempotencyKey);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string) {
    const refund = await this.bookingService.cancelBooking(id);
    return { refundAmountMinorUnits: refund.amount, currency: refund.currencyCode };
  }
}
