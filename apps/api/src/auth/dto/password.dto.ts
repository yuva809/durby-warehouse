import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MaxLength(200)
  newPassword!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(200)
  newPassword!: string;
}

export class CompleteResetDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(200)
  newPassword!: string;
}
