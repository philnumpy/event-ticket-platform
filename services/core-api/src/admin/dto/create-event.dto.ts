import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateEventDto {
  @IsString()
  title!: string;

  @IsString()
  genre!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  durationMinutes!: number;
}
