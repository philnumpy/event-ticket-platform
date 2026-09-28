import { IsString } from 'class-validator';

export class InitializeInventoryDto {
  @IsString()
  venueId!: string;
}
