import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  locationId?: string;

  /**
   * Defaults to true: the new user must choose their own password at first
   * login, so the initial one (which an admin or a script knew) is only
   * temporary. Only a SUPER_ADMIN may pass false.
   */
  @IsOptional()
  @IsBoolean()
  requirePasswordChange?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
