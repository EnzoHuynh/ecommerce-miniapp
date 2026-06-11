import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';
import type { AppConfig } from '../config/app-config';

const config = {
  auth: {
    jwtAccessSecret: 'test-secret-test-secret',
    accessTtl: '15m',
    accessTtlSeconds: 900,
    refreshTtlDays: 7,
    refreshTtlSeconds: 7 * 86400,
    inactivityTimeoutMs: 30 * 60 * 1000,
  },
} as AppConfig;

function makeService() {
  const prisma = {
    session: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwt = { sign: jest.fn().mockReturnValue('signed-access-token') };
  const service = new TokenService(prisma as never, jwt as never, config);
  return { service, prisma, jwt };
}

const future = () => new Date(Date.now() + 60 * 60 * 1000);

describe('TokenService.rotate', () => {
  it('revokes the whole family when a revoked (already-rotated) token is replayed', async () => {
    const { service, prisma } = makeService();
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      familyId: 'fam-1',
      revokedAt: new Date(), // already revoked → replay
      expiresAt: future(),
      lastActivityAt: new Date(),
      user: { id: 'u1', email: 'a@b.c' },
    });

    await expect(service.rotate('raw', {})).rejects.toThrow(UnauthorizedException);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects and revokes when the inactivity window has elapsed', async () => {
    const { service, prisma } = makeService();
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      familyId: 'fam-1',
      revokedAt: null,
      expiresAt: future(),
      // last activity 31 minutes ago → past the 30-min window
      lastActivityAt: new Date(Date.now() - 31 * 60 * 1000),
      user: { id: 'u1', email: 'a@b.c' },
    });

    await expect(service.rotate('raw', {})).rejects.toThrow(/inactivity/i);
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects an expired session', async () => {
    const { service, prisma } = makeService();
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      familyId: 'fam-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000), // already expired
      lastActivityAt: new Date(),
      user: { id: 'u1', email: 'a@b.c' },
    });
    await expect(service.rotate('raw', {})).rejects.toThrow(/expired/i);
  });

  it('rejects an unknown token', async () => {
    const { service, prisma } = makeService();
    prisma.session.findUnique.mockResolvedValue(null);
    await expect(service.rotate('raw', {})).rejects.toThrow(UnauthorizedException);
  });

  it('rotates a valid token: revokes old, issues new in same family, resets activity', async () => {
    const { service, prisma, jwt } = makeService();
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      familyId: 'fam-1',
      revokedAt: null,
      expiresAt: future(),
      lastActivityAt: new Date(),
      user: { id: 'u1', email: 'a@b.c' },
    });
    const txUpdate = jest.fn();
    const txCreate = jest.fn().mockResolvedValue({ id: 's2' });
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ session: { update: txUpdate, create: txCreate } }),
    );

    const result = await service.rotate('raw', { ip: '1.2.3.4' });

    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { revokedAt: expect.any(Date) },
    });
    // New row carries the SAME family + the original absolute expiry.
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ familyId: 'fam-1' }) }),
    );
    expect(result.accessToken).toBe('signed-access-token');
    expect(result.sessionId).toBe('s2');
    expect(result.user).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(jwt.sign).toHaveBeenCalled();
  });
});
