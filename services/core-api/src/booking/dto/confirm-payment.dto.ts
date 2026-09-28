import { IsIn, IsString } from 'class-validator';

export class ConfirmPaymentDto {
  @IsIn(['SUCCESS', 'FAILED', 'TIMEOUT'])
  outcome!: 'SUCCESS' | 'FAILED' | 'TIMEOUT';

  @IsString()
  idempotencyKey!: string;
}
