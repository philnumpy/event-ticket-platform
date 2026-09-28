import { Body, Controller, Param, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { CreateSeatsDto } from './dto/create-seats.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateShowDto } from './dto/create-show.dto';
import { InitializeInventoryDto } from './dto/initialize-inventory.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('venues')
  createVenue(@Body() dto: CreateVenueDto) {
    return this.admin.createVenue(dto);
  }

  @Post('venues/:venueId/seats')
  createSeats(@Param('venueId') venueId: string, @Body() dto: CreateSeatsDto) {
    return this.admin.createSeats(venueId, dto.seats);
  }

  @Post('events')
  createEvent(@Body() dto: CreateEventDto) {
    return this.admin.createEvent(dto);
  }

  @Post('shows')
  createShow(@Body() dto: CreateShowDto) {
    return this.admin.createShow(dto);
  }

  @Post('shows/:showId/inventory')
  async initializeInventory(@Param('showId') showId: string, @Body() dto: InitializeInventoryDto) {
    const seatCount = await this.admin.initializeShowInventory(showId, dto.venueId);
    return { showId, seatsProvisioned: seatCount };
  }
}
