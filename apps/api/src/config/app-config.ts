import { z } from 'zod';

/**
 * Parse a short duration string (e.g. "15m", "7d", "30s", "2h") into seconds.
 * Falls back to treating a bare number as seconds.
 */
export function parseDurationToSeconds(input: string): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(input.trim());
  if (!match) throw new Error(`Invalid duration: "${input}"`);
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit];
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  INACTIVITY_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  COOKIE_DOMAIN: z.string().optional(),
});

export type AppConfig = {
  databaseUrl: string;
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  corsOrigins: string[];
  cookieDomain?: string;
  auth: {
    jwtAccessSecret: string;
    accessTtl: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
    refreshTtlSeconds: number;
    inactivityTimeoutMs: number;
  };
};

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    databaseUrl: parsed.DATABASE_URL,
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    port: parsed.PORT,
    corsOrigins: parsed.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
    cookieDomain: parsed.COOKIE_DOMAIN || undefined,
    auth: {
      jwtAccessSecret: parsed.JWT_ACCESS_SECRET,
      accessTtl: parsed.ACCESS_TOKEN_TTL,
      accessTtlSeconds: parseDurationToSeconds(parsed.ACCESS_TOKEN_TTL),
      refreshTtlDays: parsed.REFRESH_TOKEN_TTL_DAYS,
      refreshTtlSeconds: parsed.REFRESH_TOKEN_TTL_DAYS * 86400,
      inactivityTimeoutMs: parsed.INACTIVITY_TIMEOUT_MINUTES * 60_000,
    },
  };
}
