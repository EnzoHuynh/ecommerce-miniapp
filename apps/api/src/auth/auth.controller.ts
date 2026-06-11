import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthResult, loginSchema, type LoginInput } from '@app/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from './cookies';
import { APP_CONFIG, AppConfig } from '../config/app-config';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private requestContext(req: Request) {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }

  /**
   * Defense-in-depth CSRF check for cookie-authenticated, state-changing routes.
   * A cross-origin page cannot set a custom header on a fetch without triggering
   * a CORS preflight that our server will reject, so requiring this header blocks
   * forged requests on top of the SameSite=Lax cookie.
   */
  private assertSameOrigin(req: Request): void {
    if (req.headers['x-requested-with'] !== 'fetch') {
      throw new ForbiddenException('Missing CSRF header');
    }
  }

  @Post('login')
  // Stricter rate limit on the credential endpoint (10 attempts / minute / IP),
  // layered under the per-account lockout enforced in AuthService.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const { accessToken, refreshToken, expiresIn, user } = await this.authService.login(
      body,
      this.requestContext(req),
    );
    setRefreshCookie(res, refreshToken, this.config);
    return { accessToken, expiresIn, user };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    this.assertSameOrigin(req);
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!raw) {
      throw new UnauthorizedException('No session');
    }
    try {
      const { accessToken, refreshToken, expiresIn, user } = await this.tokens.rotate(
        raw,
        this.requestContext(req),
      );
      setRefreshCookie(res, refreshToken, this.config);
      return { accessToken, expiresIn, user };
    } catch (err) {
      // Any failure (expired, inactive, reuse) invalidates the cookie.
      clearRefreshCookie(res, this.config);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.assertSameOrigin(req);
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (raw) {
      await this.tokens.revokeByRawToken(raw);
    }
    clearRefreshCookie(res, this.config);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): { id: string; email: string } {
    return { id: user.id, email: user.email };
  }
}
