import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { passwordPolicyProblems } from '../common/password-policy';
import { BCRYPT_COST, hashPassword } from '../common/password-hash';

// Compared against when the email is unknown, so a failed login costs the same bcrypt work
// whether or not the account exists (no timing signal for enumerating valid emails).
const DUMMY_HASH = bcrypt.hashSync('timing-equalisation-only', BCRYPT_COST);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private activity: ActivityService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.active || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueSession(user);
  }

  /** A signed token tied to the user's current tokenVersion, plus what the client needs to route the user. */
  private async issueSession(user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'locationId' | 'tokenVersion' | 'passwordChangeRequired'>) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, tv: user.tokenVersion });
    return {
      accessToken,
      mustChangePassword: user.passwordChangeRequired,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, locationId: user.locationId },
    };
  }

  /**
   * Self-service change. Requires the current password, applies the password
   * policy, and ends every OTHER session (tokenVersion bump); the caller gets a
   * fresh token. A wrong current password is a 400, deliberately not a 401: the
   * web app treats any 401 as "session expired" and would log the user out.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Your current password is incorrect.');
    }
    const problems = passwordPolicyProblems(newPassword, user.email);
    if (newPassword === currentPassword) problems.push('Your new password must be different from the current one.');
    if (problems.length) throw new BadRequestException(problems);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await AuthService.hashPassword(newPassword),
        passwordChangeRequired: false,
        tokenVersion: { increment: 1 },
      },
    });
    // Any admin-issued reset code becomes meaningless once the user has set their own password.
    await this.prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
    await this.activity.log(`${updated.name} changed their password`, 'security', userId);
    return this.issueSession(updated);
  }

  static hashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }
}
