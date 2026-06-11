import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from './token.service';

/**
 * Stateless bearer-token guard. Verifies the short-lived (15 min) access token
 * and attaches the user to the request. We intentionally do NOT hit the DB on
 * every request: session revocation is enforced at refresh time, and the access
 * token's short TTL bounds the window after a logout. This keeps hot read
 * endpoints (the product feed) fast.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = this.tokens.verifyAccessToken(token);
      (request as Request & { user: unknown }).user = {
        id: payload.sub,
        email: payload.email,
        sessionId: payload.sid,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
