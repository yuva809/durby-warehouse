import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsPositive, IsString, MinLength, ValidateNested } from 'class-validator';

export class RequestItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @IsPositive()
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
  approvedQty!: number;
}

export class RejectRequestDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
