import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { requireJwtSecret } from '../common/require-jwt-secret';

interface JwtPayload {
  sub: string;
  /** Token version at issue time; absent on tokens issued before revocation existed (treated as 0). */
  tv?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Account not found or deactivated');
    }
    // A password change/reset bumps tokenVersion, ending every other session.
    if ((payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Your session is no longer valid. Please sign in again.');
    }
    return { userId: user.id, email: user.email, role: user.role, locationId: user.locationId, passwordChangeRequired: user.passwordChangeRequired };
  }
}
