import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export enum AdjustmentReason {
  DAMAGE = 'DAMAGE',
  EXPIRED = 'EXPIRED',
  RECOUNT = 'RECOUNT',
  MISSING = 'MISSING',
  MANUAL_CORRECTION = 'MANUAL_CORRECTION',
}

export class CreateAdjustmentDto {
  @IsString()
  locationId!: string;

  @IsString()
  productId!: string;

  /** Signed delta to apply to onHand (negative for damage/loss, positive for a found-stock recount). */
  @IsInt()
  quantity!: number;

  @IsEnum(AdjustmentReason)
  reason!: AdjustmentReason;

  @IsOptional()
  @IsString()
  note?: string;
}
