import { Injectable } from '@nestjs/common';
import type { Product, ProductPage } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { decodeCursor, encodeCursor } from './cursor';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Keyset (cursor) pagination ordered by (createdAt, id).
   *
   * Why keyset over OFFSET:
   *  - O(log n) via the composite index instead of scanning/skipping rows, so
   *    page 1000 costs the same as page 1.
   *  - Stable under concurrent inserts: the cursor anchors to a real row, so the
   *    feed never duplicates or skips items while the user scrolls.
   *
   * We fetch `limit + 1` rows: the extra row tells us whether a next page exists
   * (and seeds nextCursor) without a second COUNT query.
   */
  async findPage(limit: number, rawCursor?: string): Promise<ProductPage> {
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;

    const rows = await this.prisma.product.findMany({
      take: limit + 1,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: cursor
        ? {
            // Tuple comparison (createdAt, id) > (cursor.createdAt, cursor.id),
            // expressed as an OR since Prisma has no native row-value compare.
            OR: [
              { createdAt: { gt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } },
            ],
          }
        : undefined,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map(this.toDto),
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  private toDto(p: {
    id: string;
    name: string;
    description: string;
    price: { toString(): string };
    imageUrl: string;
    createdAt: Date;
  }): Product {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      // Decimal → string to avoid float precision loss on money.
      price: p.price.toString(),
      imageUrl: p.imageUrl,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
