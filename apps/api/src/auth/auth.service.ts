import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { LoginInput } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService, IssuedTokens } from './token.service';

/** Per-account brute-force policy. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/**
 * A precomputed Argon2id hash of a random string. Verifying against it when the
 * email is unknown keeps the response time indistinguishable from the
 * wrong-password path, preventing user-enumeration via timing.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaQzwbVlEjHQABV4Q0';

interface RequestContext {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  private async recentFailures(email: string): Promise<number> {
    return this.prisma.loginAttempt.count({
      where: {
        email,
        success: false,
        createdAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
      },
    });
  }

  private async record(email: string, ip: string | undefined, success: boolean): Promise<void> {
    await this.prisma.loginAttempt.create({ data: { email, ip, success } });
  }

  async login(
    input: LoginInput,
    ctx: RequestContext,
  ): Promise<IssuedTokens & { user: { id: string; email: string } }> {
    const email = input.email; // already normalized (trim+lowercase) by the schema

    // 1. Account lockout: too many recent failures → refuse before touching the
    //    password, with HTTP 423 Locked.
    if ((await this.recentFailures(email)) >= MAX_FAILED_ATTEMPTS) {
      throw new HttpException(
        'Account temporarily locked due to too many failed attempts. Try again later.',
        HttpStatus.LOCKED,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    // 2. Verify password. Always run a hash verification (dummy if user missing)
    //    so timing does not leak whether the account exists.
    const passwordValid = user
      ? await argon2.verify(user.passwordHash, input.password)
      : await argon2.verify(DUMMY_HASH, input.password).catch(() => false);

    if (!user || !passwordValid) {
      await this.record(email, ctx.ip, false);
      // Generic message — never reveal which of email/password was wrong.
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.record(email, ctx.ip, true);
    const issued = await this.tokens.issueNewSession({ id: user.id, email: user.email }, ctx);
    return { ...issued, user: { id: user.id, email: user.email } };
  }
}
