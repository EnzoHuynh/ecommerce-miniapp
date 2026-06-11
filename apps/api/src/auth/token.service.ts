import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  /** Session id this token was minted under. */
  sid: string;
}

export interface IssuedTokens {
  accessToken: string;
  /** Raw opaque refresh token — goes into the httpOnly cookie only. */
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

interface RequestContext {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private hash(raw: string): string {
    // SHA-256 is sufficient here: the token is 256 bits of CSPRNG entropy, so it
    // is not brute-forceable — no need for a slow password hash, and a fast hash
    // keeps the unique-index lookup cheap.
    return createHash('sha256').update(raw).digest('hex');
  }

  private generateRawToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.auth.jwtAccessSecret,
      // Seconds (number) — avoids the `ms` StringValue typing constraint.
      expiresIn: this.config.auth.accessTtlSeconds,
    });
  }

  /** Creates a brand-new session (new rotation family) — used at login. */
  async issueNewSession(
    user: { id: string; email: string },
    ctx: RequestContext,
  ): Promise<IssuedTokens> {
    const rawRefresh = this.generateRawToken();
    const expiresAt = new Date(Date.now() + this.config.auth.refreshTtlSeconds * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hash(rawRefresh),
        familyId: randomBytes(16).toString('hex'),
        expiresAt,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
    });

    return {
      accessToken: this.signAccessToken({ sub: user.id, email: user.email, sid: session.id }),
      refreshToken: rawRefresh,
      expiresIn: this.config.auth.accessTtlSeconds,
      sessionId: session.id,
    };
  }

  /**
   * Validates a refresh token and rotates it. Enforces, in order:
   *  1. unknown token            → 401
   *  2. revoked token replayed   → REUSE: revoke the whole family → 401
   *  3. absolute expiry reached  → 401
   *  4. 30-min inactivity window → revoke + 401
   * On success: old token is revoked, a new one is issued in the same family,
   * and the sliding activity window is reset.
   */
  async rotate(
    rawRefresh: string,
    ctx: RequestContext,
  ): Promise<IssuedTokens & { user: { id: string; email: string } }> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: this.hash(rawRefresh) },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    if (session.revokedAt) {
      // A previously-rotated (or logged-out) token is being replayed — likely
      // theft. Nuke every still-active token in the family.
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session reuse detected');
    }

    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
      throw new UnauthorizedException('Session expired');
    }

    if (now - session.lastActivityAt.getTime() > this.config.auth.inactivityTimeoutMs) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session timed out due to inactivity');
    }

    const rawRefreshNew = this.generateRawToken();
    // Rotate atomically: revoke the old row, mint the new one in the same family
    // carrying the original absolute expiry, with the activity window reset.
    const newSession = await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return tx.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: this.hash(rawRefreshNew),
          familyId: session.familyId,
          expiresAt: session.expiresAt,
          lastActivityAt: new Date(),
          userAgent: ctx.userAgent,
          ip: ctx.ip,
        },
      });
    });

    return {
      accessToken: this.signAccessToken({
        sub: session.userId,
        email: session.user.email,
        sid: newSession.id,
      }),
      refreshToken: rawRefreshNew,
      expiresIn: this.config.auth.accessTtlSeconds,
      sessionId: newSession.id,
      user: { id: session.user.id, email: session.user.email },
    };
  }

  /** Revokes the session behind a refresh token (logout). Idempotent. */
  async revokeByRawToken(rawRefresh: string): Promise<void> {
    const hash = this.hash(rawRefresh);
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, {
      secret: this.config.auth.jwtAccessSecret,
    });
  }
}
