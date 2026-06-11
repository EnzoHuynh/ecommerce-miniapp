import { productQuerySchema } from '@app/shared';
import { ProductsService } from './products.service';
import { decodeCursor } from './cursor';

describe('productQuerySchema (limit bounds 5..50)', () => {
  it('accepts the inclusive bounds', () => {
    expect(productQuerySchema.parse({ limit: '5' }).limit).toBe(5);
    expect(productQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  it('defaults the limit when omitted', () => {
    expect(productQuerySchema.parse({}).limit).toBe(20);
  });

  it('rejects out-of-range limits (drives the HTTP 400)', () => {
    expect(productQuerySchema.safeParse({ limit: '4' }).success).toBe(false);
    expect(productQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
    expect(productQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(productQuerySchema.safeParse({ limit: 'abc' }).success).toBe(false);
  });
});

describe('ProductsService.findPage', () => {
  const row = (i: number) => ({
    id: `id-${i}`,
    name: `Product ${i}`,
    description: `Desc ${i}`,
    price: { toString: () => '9.99' },
    imageUrl: `https://picsum.photos/seed/${i}/400/400`,
    createdAt: new Date(`2024-01-01T00:0${i}:00.000Z`),
  });

  function makeService(rows: ReturnType<typeof row>[]) {
    const prisma = { product: { findMany: jest.fn().mockResolvedValue(rows) } };
    return { service: new ProductsService(prisma as never), prisma };
  }

  it('fetches limit + 1 rows to detect a next page', async () => {
    const { service, prisma } = makeService([row(0), row(1)]);
    await service.findPage(5);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 6, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    );
  });

  it('returns nextCursor pointing at the last item when more rows exist', async () => {
    // limit 2, but service fetched 3 (limit+1) → there IS a next page.
    const { service } = makeService([row(0), row(1), row(2)]);
    const page = await service.findPage(2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    // The cursor anchors on the last returned item (id-1), not the peeked one.
    expect(decodeCursor(page.nextCursor as string).id).toBe('id-1');
  });

  it('returns nextCursor = null on the last page', async () => {
    const { service } = makeService([row(0), row(1)]); // fewer than limit+1
    const page = await service.findPage(5);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('builds a keyset WHERE clause from the cursor', async () => {
    const { service, prisma } = makeService([]);
    const cursor = Buffer.from(
      JSON.stringify({ createdAt: '2024-01-01T00:00:00.000Z', id: 'id-0' }),
      'utf8',
    ).toString('base64url');
    await service.findPage(5, cursor);
    const arg = prisma.product.findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { createdAt: { gt: new Date('2024-01-01T00:00:00.000Z') } },
      { createdAt: new Date('2024-01-01T00:00:00.000Z'), id: { gt: 'id-0' } },
    ]);
  });
});
