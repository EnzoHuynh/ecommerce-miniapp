import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

jest.mock('argon2');

function makeService() {
  const prisma = {
    loginAttempt: { count: jest.fn(), create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn() },
  };
  const tokens = { issueNewSession: jest.fn() };
  const service = new AuthService(prisma as never, tokens as never);
  return { service, prisma, tokens };
}

const credentials = { email: 'demo@example.com', password: 'pw' };

describe('AuthService.login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('locks the account (423) after 5 recent failures, without checking the password', async () => {
    const { service, prisma } = makeService();
    prisma.loginAttempt.count.mockResolvedValue(5);

    try {
      await service.login(credentials, {});
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.LOCKED);
    }
    // Locked out before any password verification happened.
    expect(argon2.verify).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 and records a failed attempt for a wrong password', async () => {
    const { service, prisma } = makeService();
    prisma.loginAttempt.count.mockResolvedValue(0);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: credentials.email,
      passwordHash: 'hash',
    });
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(service.login(credentials, { ip: '1.1.1.1' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
      data: { email: credentials.email, ip: '1.1.1.1', success: false },
    });
  });

  it('returns 401 for an unknown email (still runs a dummy verify to avoid timing leaks)', async () => {
    const { service, prisma } = makeService();
    prisma.loginAttempt.count.mockResolvedValue(0);
    prisma.user.findUnique.mockResolvedValue(null);
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(service.login(credentials, {})).rejects.toThrow(UnauthorizedException);
    // Verified against the dummy hash even though no user exists.
    expect(argon2.verify).toHaveBeenCalled();
  });

  it('issues a session and records success on valid credentials', async () => {
    const { service, prisma, tokens } = makeService();
    prisma.loginAttempt.count.mockResolvedValue(0);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: credentials.email,
      passwordHash: 'hash',
    });
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    tokens.issueNewSession.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      sessionId: 's1',
    });

    const result = await service.login(credentials, {});
    expect(result.user).toEqual({ id: 'u1', email: credentials.email });
    expect(result.accessToken).toBe('a');
    expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
      data: { email: credentials.email, ip: undefined, success: true },
    });
  });
});
