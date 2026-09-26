import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { InvitationsService } from './invitations.service';
import { ActivityModule } from '../activity/activity.module';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { requireJwtSecret } from '../common/require-jwt-secret';

@Module({
  imports: [
    ActivityModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: requireJwtSecret(),
        signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '12h') as `${number}${'s' | 'm' | 'h' | 'd'}` },
      }),
    }),
  ],
  providers: [AuthService, PasswordResetService, InvitationsService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, PasswordResetService, InvitationsService],
})
export class AuthModule {}
