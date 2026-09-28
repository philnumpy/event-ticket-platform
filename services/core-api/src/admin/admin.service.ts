import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  Event,
  EventCatalogRepository,
  Money,
  Seat,
  SeatRepository,
  SeatTier,
  Show,
  ShowRepository,
  ShowSeat,
  ShowSeatRepository,
  Venue,
  VenueRepository,
} from '@etp/domain';
import {
  EVENT_CATALOG_REPOSITORY,
  SEAT_REPOSITORY,
  SHOW_REPOSITORY,
  SHOW_SEAT_REPOSITORY,
  VENUE_REPOSITORY,
} from '../persistence/tokens';
import { CreateVenueDto } from './dto/create-venue.dto';
import { SeatSpecDto } from './dto/create-seats.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateShowDto } from './dto/create-show.dto';

@Injectable()
export class AdminService {
  constructor(
    @Inject(VENUE_REPOSITORY) private readonly venues: VenueRepository,
    @Inject(SEAT_REPOSITORY) private readonly seats: SeatRepository,
    @Inject(EVENT_CATALOG_REPOSITORY) private readonly events: EventCatalogRepository,
    @Inject(SHOW_REPOSITORY) private readonly shows: ShowRepository,
    @Inject(SHOW_SEAT_REPOSITORY) private readonly showSeats: ShowSeatRepository,
  ) {}

  async createVenue(dto: CreateVenueDto): Promise<Venue> {
    const venue = new Venue({ id: randomUUID(), name: dto.name, city: dto.city, address: dto.address });
    await this.venues.save(venue);
    return venue;
  }

  async createSeats(venueId: string, specs: SeatSpecDto[]): Promise<Seat[]> {
    const seats = specs.map(
      (spec) =>
        new Seat({
          id: randomUUID(),
          venueId,
          section: spec.section,
          row: spec.row,
          seatNumber: spec.seatNumber,
          tier: spec.tier as SeatTier,
        }),
    );
    await this.seats.saveMany(seats);
    return seats;
  }

  async createEvent(dto: CreateEventDto): Promise<Event> {
    const event = new Event({
      id: randomUUID(),
      title: dto.title,
      genre: dto.genre,
      description: dto.description,
      durationMinutes: dto.durationMinutes,
    });
    await this.events.save(event);
    return event;
  }

  async createShow(dto: CreateShowDto): Promise<Show> {
    const basePriceByTier: Partial<Record<SeatTier, Money>> = {};
    for (const [tier, minorUnits] of Object.entries(dto.basePriceByTier)) {
      basePriceByTier[tier as SeatTier] = Money.of(minorUnits);
    }

    const show = new Show({
      id: randomUUID(),
      eventId: dto.eventId,
      venueId: dto.venueId,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      basePriceByTier,
    });
    await this.shows.save(show);
    return show;
  }

  /** The realistic admin workflow: a venue's seats are created once; every
   * new show at that venue gets its own AVAILABLE inventory row per seat. */
  async initializeShowInventory(showId: string, venueId: string): Promise<number> {
    const seats = await this.seats.findByVenue(venueId);
    const showSeats = seats.map((seat) => new ShowSeat({ showId, seatId: seat.id }));
    await this.showSeats.saveMany(showSeats);
    return showSeats.length;
  }
}
