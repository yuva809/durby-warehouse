import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsPositive, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { MAX_QUANTITY } from '../../common/limits';

export class RequestItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @IsPositive()
  @Max(MAX_QUANTITY)
  requestedQty!: number;
}

export class CreateRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequestItemDto)
  items!: RequestItemDto[];
}

export class UpdateApprovedQtyDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  approvedQty!: number;
}

export class RejectRequestDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
