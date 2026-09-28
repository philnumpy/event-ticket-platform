import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class SeatSpecDto {
  @IsString()
  section!: string;

  @IsString()
  row!: string;

  @IsInt()
  @Min(1)
  seatNumber!: number;

  @IsIn(['PLATINUM', 'GOLD', 'SILVER'])
  tier!: 'PLATINUM' | 'GOLD' | 'SILVER';
}

export class CreateSeatsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SeatSpecDto)
  seats!: SeatSpecDto[];
}
