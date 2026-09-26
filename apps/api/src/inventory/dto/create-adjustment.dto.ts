import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MAX_QUANTITY } from '../../common/limits';

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
  @Min(-MAX_QUANTITY)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @IsEnum(AdjustmentReason)
  reason!: AdjustmentReason;

  @IsOptional()
  @IsString()
  note?: string;
}
