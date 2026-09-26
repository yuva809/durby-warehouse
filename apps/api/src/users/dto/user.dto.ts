import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

/** Invite: the invitee chooses their own password through the one-time link, so none is accepted here. */
export class InviteUserDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(Role)
  role!: Role;

  /** Required for BRANCH_USER (an existing, active branch); refused for every other role. */
  @IsOptional()
  @IsString()
  locationId?: string;
}

/**
 * Legacy/scripted path: an account with an initial password an admin (or script) supplied.
 * Always forces the user to choose their own at first sign-in. The app itself uses invitations.
 */
export class CreateUserDto extends InviteUserDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  /** Defaults to true. Only a SUPER_ADMIN may pass false (e.g. an account whose owner already chose the password). */
  @IsOptional()
  @IsBoolean()
  requirePasswordChange?: boolean;
}

/**
 * The only editable fields. Role is deliberately NOT editable (no promotion or demotion path,
 * so nobody can be silently elevated), and neither is the active flag: use the explicit
 * deactivate/reactivate actions, which also end sessions and enforce the last-admin rule.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  /** Only for BRANCH_USER accounts; must be an existing, active branch. */
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class ListUsersQuery {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  locationId?: string;
}
