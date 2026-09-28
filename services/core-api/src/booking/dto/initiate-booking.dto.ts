import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class InitiateBookingDto {
  @IsString()
  userId!: string;

  @IsString()
  showId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20) // generous upper bound; MaxSeatsPerBookingHandler enforces the real business limit
  @IsString({ each: true })
  seatIds!: string[];
}
