import { z } from 'zod';

/**
 * Login request contract.
 *
 * `website` is a HONEYPOT field: it is rendered hidden in the UI and must stay
 * empty. Bots that auto-fill every input will populate it, letting the server
 * reject obvious spam without bothering a human with a captcha.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  // Honeypot — must be empty/absent for a legitimate human submission.
  website: z.string().max(0).optional().or(z.literal('')),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Shape returned on a successful login / refresh. */
export const authResultSchema = z.object({
  accessToken: z.string(),
  /** Access-token lifetime in seconds, so the client can schedule refreshes. */
  expiresIn: z.number().int().positive(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
  }),
});

export type AuthResult = z.infer<typeof authResultSchema>;
