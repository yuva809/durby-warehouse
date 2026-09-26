import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AllowPasswordChangeRequired } from '../common/decorators/allow-password-change.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { InvitationsService } from './invitations.service';
import { LoginDto } from './dto/login.dto';
import { AcceptInvitationDto, ChangePasswordDto, CompleteResetDto } from './dto/password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private reset: PasswordResetService,
    private invitations: InvitationsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @AllowPasswordChangeRequired()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /** Any signed-in user, including one whose first-login change is still pending. */
  @AllowPasswordChangeRequired()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }

  /** Public by necessity (the user is locked out): protected by the 100-bit single-use code and a strict rate limit. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset-password')
  completeReset(@Body() dto: CompleteResetDto) {
    return this.reset.complete(dto.code, dto.newPassword);
  }

  /**
   * Public by necessity (the invitee has no account access yet): protected by the 100-bit single-use code and a strict
   * rate limit. It takes no email, so it can't be used to discover which addresses have accounts, and every failure
   * gives the same generic message.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('accept-invitation')
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(dto.code, dto.newPassword);
  }
}
