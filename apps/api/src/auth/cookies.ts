import { CookieOptions, Response } from 'express';
import { AppConfig } from '../config/app-config';

export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Cookie carrying the opaque refresh token.
 * - httpOnly: invisible to JS → not stealable via XSS.
 * - secure: HTTPS-only in production.
 * - sameSite=lax: not sent on cross-site POST (fetch) → blocks CSRF on refresh.
 * - path=/auth: only transmitted to the auth endpoints that need it.
 * - maxAge set (persistent): survives tab close / browser restart → "persistent
 *   sessions". (A session cookie without maxAge would be cleared on restart.)
 */
function baseCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/auth',
    domain: config.cookieDomain,
  };
}

export function setRefreshCookie(res: Response, token: string, config: AppConfig): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseCookieOptions(config),
    maxAge: config.auth.refreshTtlSeconds * 1000,
  });
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions(config));
}
