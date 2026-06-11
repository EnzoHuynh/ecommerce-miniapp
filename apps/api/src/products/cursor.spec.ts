import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './cursor';

describe('keyset cursor', () => {
  it('round-trips (createdAt, id)', () => {
    const cursor = { createdAt: '2024-01-01T00:00:00.000Z', id: 'abc-123' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('rejects a malformed cursor with 400', () => {
    expect(() => decodeCursor('not-base64-$$$')).toThrow(BadRequestException);
  });

  it('rejects a structurally-invalid cursor with 400', () => {
    const bad = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64url');
    expect(() => decodeCursor(bad)).toThrow(BadRequestException);
  });

  it('rejects a cursor carrying an invalid date', () => {
    const bad = Buffer.from(JSON.stringify({ createdAt: 'nope', id: 'x' }), 'utf8').toString(
      'base64url',
    );
    expect(() => decodeCursor(bad)).toThrow(BadRequestException);
  });
});
