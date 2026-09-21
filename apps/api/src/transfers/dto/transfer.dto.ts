import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

export class AssignDriverDto {
  @IsString()
  driverId!: string;
}

export class SetPickedQtyDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(0)
  pickedQty!: number;
}

export class DeliveredItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(0)
  deliveredQty!: number;
}

export class MarkDeliveredDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveredItemDto)
  items?: DeliveredItemDto[];
}

export class FailDeliveryDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class RetryDeliveryDto {
  @IsOptional()
  @IsString()
  driverId?: string;
}

export class SetEtaDto {
  @IsOptional()
  @IsDateString()
  etaDate?: string;

  @IsOptional()
  @IsString()
  etaWindowStart?: string;

  @IsOptional()
  @IsString()
  etaWindowEnd?: string;
}

export class CreateAssignedItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  items!: SetPickedQtyDto[];
}
