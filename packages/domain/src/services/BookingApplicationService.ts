import { randomUUID } from 'node:crypto';
import { Booking } from '../entities/Booking';
import { Hold } from '../entities/Hold';
import { Payment } from '../entities/Payment';
import { Money } from '../shared/Money';
import { BookingState, BookingTrigger } from '../booking/BookingState';
import {
  HoldExpiredError,
  InvalidBookingStateTransitionError,
  NotFoundError,
} from '../errors/DomainErrors';
import { ShowRepository } from '../repositories/ShowRepository';
import { SeatRepository } from '../repositories/SeatRepository';
import { ShowSeatRepository } from '../repositories/ShowSeatRepository';
import { HoldRepository } from '../repositories/HoldRepository';
import { BookingRepository } from '../repositories/BookingRepository';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { SeatHoldService } from './SeatHoldService';
import { PricingStrategy } from '../pricing/PricingStrategy';
import { RefundPolicySelector } from '../refund/RefundPolicySelector';
import { BookingValidationChain } from '../validation/BookingValidationChain';
import { DomainEventPublisher } from '../events/DomainEventPublisher';
import { createEvent } from '../events/DomainEvent';
import {
  BOOKING_CANCELLED,
  BOOKING_CONFIRMED,
  BOOKING_EXPIRED,
  PAYMENT_FAILED,
  REFUND_PROCESSED,
} from '../events/BookingEvents';

export interface InitiateBookingCommand {
  userId: string;
  showId: string;
  seatIds: string[];
}

export interface InitiateBookingResult {
  booking: Booking;
  hold: Hold;
}

export type PaymentOutcome = 'SUCCESS' | 'FAILED' | 'TIMEOUT';

/**
 * Application service: the one place that knows how to sequence
 * repositories, the validation chain, the seat-hold service, pricing,
 * refund policy and the state machine into the actual booking use cases.
 * Entities stay ignorant of persistence and orchestration; this class stays
 * ignorant of *how* a seat is locked or *how* a notification is sent, only
 * that SeatHoldService and DomainEventPublisher provide those contracts.
 */
export class BookingApplicationService {
  constructor(
    private readonly shows: ShowRepository,
    private readonly seats: SeatRepository,
    private readonly showSeats: ShowSeatRepository,
    private readonly holds: HoldRepository,
    private readonly bookings: BookingRepository,
    private readonly payments: PaymentRepository,
    private readonly seatHoldService: SeatHoldService,
    private readonly pricingStrategy: PricingStrategy,
    private readonly refundPolicySelector: RefundPolicySelector,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly holdTtlSeconds = 300,
    private readonly idGenerator: () => string = () => randomUUID(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async initiateBooking(cmd: InitiateBookingCommand): Promise<InitiateBookingResult> {
    const show = await this.shows.findById(cmd.showId);
    if (!show) {
      throw new NotFoundError('Show', cmd.showId);
    }

    const [requestedSeats, requestedShowSeats, allShowSeats, recentBookingCount] = await Promise.all(
      [
        this.seats.findByIds(cmd.seatIds),
        this.showSeats.findByShowAndSeats(cmd.showId, cmd.seatIds),
        this.showSeats.findByShow(cmd.showId),
        this.bookings.countRecentByUserAndShow(cmd.userId, cmd.showId, 10),
      ],
    );

    if (requestedSeats.length !== cmd.seatIds.length) {
      throw new NotFoundError('Seat', cmd.seatIds.join(','));
    }
    if (requestedShowSeats.length !== cmd.seatIds.length) {
      throw new NotFoundError('ShowSeat', `${cmd.showId}:${cmd.seatIds.join(',')}`);
    }

    BookingValidationChain.default().handle({
      userId: cmd.userId,
      showId: cmd.showId,
      seatIds: cmd.seatIds,
      showSeats: requestedShowSeats,
      recentBookingCountForUser: recentBookingCount,
    });

    const occupancyRatio =
      allShowSeats.length > 0
        ? allShowSeats.filter((s) => s.status !== 'AVAILABLE').length / allShowSeats.length
        : 0;
    const hoursUntilShow = show.hoursUntilStart(this.clock());
    const seatsById = new Map(requestedSeats.map((s) => [s.id, s]));

    let total = Money.zero();
    for (const seatId of cmd.seatIds) {
      const seat = seatsById.get(seatId);
      if (!seat) continue;
      const price = this.pricingStrategy.price({
        basePrice: show.basePriceFor(seat.tier),
        tier: seat.tier,
        occupancyRatio,
        hoursUntilShow,
      });
      total = total.add(price);
    }

    const booking = new Booking({
      id: this.idGenerator(),
      userId: cmd.userId,
      showId: cmd.showId,
      seatIds: cmd.seatIds,
      amount: total,
      createdAt: this.clock(),
    });

    const hold = new Hold({
      id: this.idGenerator(),
      showId: cmd.showId,
      seatIds: cmd.seatIds,
      userId: cmd.userId,
      createdAt: this.clock(),
      ttlSeconds: this.holdTtlSeconds,
    });

    const heldSeatIds: string[] = [];
    try {
      for (const seatId of cmd.seatIds) {
        await this.seatHoldService.hold(cmd.showId, seatId, hold.id);
        heldSeatIds.push(seatId);
      }
    } catch (err) {
      // Compensate: release whatever we did manage to hold before hitting a
      // seat someone else won the race for.
      for (const seatId of heldSeatIds) {
        const showSeat = await this.showSeats.findById(cmd.showId, seatId);
        if (showSeat) {
          showSeat.release(hold.id);
          await this.showSeats.save(showSeat);
        }
      }
      booking.rejectBeforeHold();
      await this.bookings.save(booking);
      throw err;
    }

    booking.attachHold(hold.id);
    await Promise.all([this.holds.save(hold), this.bookings.save(booking)]);

    return { booking, hold };
  }

  async confirmPayment(
    bookingId: string,
    outcome: PaymentOutcome,
    idempotencyKey: string,
    provider = 'MOCK_GATEWAY',
  ): Promise<Payment> {
    // Idempotency: a retried or duplicate callback with the same key replays
    // the original result instead of processing the payment twice.
    const existing = await this.payments.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing;
    }

    const booking = await this.bookings.findById(bookingId);
    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    const hold = booking.holdId ? await this.holds.findById(booking.holdId) : null;
    if (!hold) {
      throw new NotFoundError('Hold', booking.holdId ?? 'unknown');
    }

    if (hold.status === 'ACTIVE' && hold.isExpired(this.clock())) {
      await this.expireHold(hold);
      throw new HoldExpiredError(hold.id);
    }

    const payment = new Payment({
      id: this.idGenerator(),
      bookingId,
      amount: booking.amount,
      idempotencyKey,
      provider,
      createdAt: this.clock(),
    });

    if (outcome === 'SUCCESS') {
      payment.markSuccess();
      booking.markPaymentCaptured();

      try {
        for (const seatId of booking.seatIds) {
          const showSeat = await this.showSeats.findById(booking.showId, seatId);
          if (!showSeat) {
            throw new NotFoundError('ShowSeat', `${booking.showId}:${seatId}`);
          }
          showSeat.markBooked(hold.id);
          await this.showSeats.save(showSeat);
        }
        hold.consume();
        await this.holds.save(hold);
        booking.markFinalizationSucceeded();
        await this.eventPublisher.publish(
          createEvent(BOOKING_CONFIRMED, {
            bookingId: booking.id,
            userId: booking.userId,
            showId: booking.showId,
          }),
        );
      } catch (finalizationError) {
        // Compensating transition: money was captured but inventory
        // finalization failed. A real saga would trigger an async refund
        // here (Phase 3); Phase 1 records the compensating state so
        // cancelBooking() can complete the refund.
        booking.markFinalizationFailed();
        await this.eventPublisher.publish(
          createEvent(PAYMENT_FAILED, {
            bookingId: booking.id,
            userId: booking.userId,
            paymentId: payment.id,
            status: 'FAILED' as const,
          }),
        );
      }
    } else {
      if (outcome === 'TIMEOUT') {
        payment.markTimeout();
      } else {
        payment.markFailed();
      }
      booking.cancel();

      for (const seatId of booking.seatIds) {
        const showSeat = await this.showSeats.findById(booking.showId, seatId);
        if (showSeat) {
          showSeat.release(hold.id);
          await this.showSeats.save(showSeat);
        }
      }
      hold.release();
      await this.holds.save(hold);

      await this.eventPublisher.publish(
        createEvent(PAYMENT_FAILED, {
          bookingId: booking.id,
          userId: booking.userId,
          paymentId: payment.id,
          status: outcome,
        }),
      );
    }

    await Promise.all([this.payments.save(payment), this.bookings.save(booking)]);
    return payment;
  }

  async cancelBooking(bookingId: string): Promise<Money> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    if (booking.state === BookingState.HELD) {
      const hold = booking.holdId ? await this.holds.findById(booking.holdId) : null;
      if (hold) {
        hold.release();
        await this.holds.save(hold);
        for (const seatId of booking.seatIds) {
          const showSeat = await this.showSeats.findById(booking.showId, seatId);
          if (showSeat) {
            showSeat.release(hold.id);
            await this.showSeats.save(showSeat);
          }
        }
      }
      booking.cancel();
      await this.bookings.save(booking);
      await this.eventPublisher.publish(
        createEvent(BOOKING_CANCELLED, {
          bookingId,
          userId: booking.userId,
          reason: 'USER_CANCELLED_BEFORE_PAYMENT',
        }),
      );
      return Money.zero(booking.amount.currencyCode);
    }

    if (booking.state === BookingState.CONFIRMED) {
      const show = await this.shows.findById(booking.showId);
      if (!show) {
        throw new NotFoundError('Show', booking.showId);
      }
      const hoursUntilShow = show.hoursUntilStart(this.clock());
      const policy = this.refundPolicySelector.select(hoursUntilShow);
      const refund = policy.calculateRefund({ amountPaid: booking.amount, hoursUntilShow });

      booking.cancel();
      booking.markRefunded();
      await this.bookings.save(booking);

      await this.eventPublisher.publish(
        createEvent(BOOKING_CANCELLED, {
          bookingId,
          userId: booking.userId,
          reason: `REFUND_POLICY_${policy.name}`,
        }),
      );
      await this.eventPublisher.publish(
        createEvent(REFUND_PROCESSED, {
          bookingId,
          userId: booking.userId,
          amountMinorUnits: refund.amount,
          currency: refund.currencyCode,
        }),
      );

      return refund;
    }

    throw new InvalidBookingStateTransitionError(booking.state, BookingTrigger.CANCEL_REQUESTED);
  }

  /** Called by a hold-expiry sweep (a scheduled job in later phases). Safe
   * to call more than once for the same hold. */
  async expireHold(hold: Hold): Promise<void> {
    hold.expire();
    await this.holds.save(hold);

    for (const seatId of hold.seatIds) {
      const showSeat = await this.showSeats.findById(hold.showId, seatId);
      if (showSeat) {
        showSeat.release(hold.id);
        await this.showSeats.save(showSeat);
      }
    }

    const booking = await this.bookings.findByHoldId(hold.id);
    if (booking && booking.state === BookingState.HELD) {
      booking.markExpired();
      await this.bookings.save(booking);
      await this.eventPublisher.publish(
        createEvent(BOOKING_EXPIRED, {
          bookingId: booking.id,
          userId: booking.userId,
          holdId: hold.id,
        }),
      );
    }
  }
}
