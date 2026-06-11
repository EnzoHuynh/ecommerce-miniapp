import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from './constants';

/**
 * Query contract for the paginated product listing.
 *
 * `limit` is STRICTLY validated against [MIN_PAGE_SIZE, MAX_PAGE_SIZE]. An
 * out-of-range value is rejected (HTTP 400) rather than silently clamped, so
 * misuse is surfaced instead of hidden. Inputs arrive as strings from the query
 * string, hence `coerce`.
 */
export const productQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(MIN_PAGE_SIZE, `limit must be >= ${MIN_PAGE_SIZE}`)
    .max(MAX_PAGE_SIZE, `limit must be <= ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
  /**
   * Opaque keyset cursor returned by the previous page. Absent on the first
   * request. Encodes (createdAt, id) of the last item already seen.
   */
  cursor: z.string().optional(),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Serialized as a string to avoid float precision loss on money values. */
  price: z.string(),
  imageUrl: z.string().url(),
  createdAt: z.string(),
});

export type Product = z.infer<typeof productSchema>;

/** A page of products plus the cursor to fetch the next page (null = last page). */
export const productPageSchema = z.object({
  items: z.array(productSchema),
  nextCursor: z.string().nullable(),
});

export type ProductPage = z.infer<typeof productPageSchema>;
