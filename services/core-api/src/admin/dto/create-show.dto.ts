import { IsISO8601, IsObject, IsString } from 'class-validator';

export class CreateShowDto {
  @IsString()
  eventId!: string;

  @IsString()
  venueId!: string;

  @IsISO8601()
  startTime!: string;

  @IsISO8601()
  endTime!: string;

  /** Minor-unit price per tier, e.g. { "GOLD": 50000, "SILVER": 30000 }. */
  @IsObject()
  basePriceByTier!: Record<string, number>;
}
