'use client';

import { useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Product, ProductPage } from '@app/shared';
import { useAuth } from '@/lib/auth-context';

const ROW_HEIGHT = 108; // card (72px) + vertical gap

function ProductCard({ product }: { product: Product }) {
  return (
    <div className="product-card">
      {/* Plain <img loading="lazy"> keeps virtualization simple; only visible
          rows mount, so the browser never holds 10k image elements. next/image
          adds little here since rows are already windowed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.imageUrl} alt="" loading="lazy" width={72} height={72} />
      <div className="meta">
        <h3>{product.name}</h3>
        <p>{product.description}</p>
      </div>
      <div className="price">${product.price}</div>
    </div>
  );
}

export function ProductList({ pageSize }: { pageSize: number }) {
  const { apiFetch } = useAuth();
  const parentRef = useRef<HTMLDivElement>(null);

  const query = useInfiniteQuery({
    // pageSize is part of the key → changing it starts a fresh paginated stream.
    queryKey: ['products', pageSize],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (pageParam) params.set('cursor', pageParam);
      const res = await apiFetch(`/products?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load products');
      return (await res.json()) as ProductPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const showLoaderRow = query.hasNextPage;

  const rowVirtualizer = useVirtualizer({
    count: showLoaderRow ? items.length + 1 : items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Fetch the next page as the sentinel (loader) row scrolls into the window.
  useEffect(() => {
    const last = virtualItems.at(-1);
    if (!last) return;
    if (last.index >= items.length - 1 && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [virtualItems, items.length, query]);

  if (query.isLoading) {
    return (
      <div className="scroll-area">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 72, marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="scroll-area">
        <div className="center">
          <p>Could not load products.</p>
          <button className="btn" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="scroll-area">
        <div className="center">No products found.</div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="scroll-area">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualItems.map((vi) => {
          const isLoaderRow = vi.index >= items.length;
          const product = items[vi.index];
          return (
            <div
              key={vi.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
                paddingBottom: 12,
              }}
            >
              {isLoaderRow ? (
                <div className="center">Loading more…</div>
              ) : (
                <ProductCard product={product} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
