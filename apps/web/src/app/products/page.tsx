'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@app/shared';
import { useAuth } from '@/lib/auth-context';
import { useInactivityTimeout } from '@/hooks/useInactivityTimeout';
import { ProductList } from '@/components/ProductList';

export default function ProductsPage() {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  // Redirect unauthenticated users to the login screen.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  // Mirror the server's 30-min inactivity window on the client.
  useInactivityTimeout(status === 'authenticated', () => {
    void logout();
  });

  if (status !== 'authenticated') {
    return <div className="center">Loading…</div>;
  }

  return (
    <div className="page">
      <header className="app-header">
        <h1>Mini-Shop</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="muted">{user?.email}</span>
          <button className="btn-ghost btn" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>

      <div className="toolbar">
        <label htmlFor="pageSize" className="muted">
          Items per request
        </label>
        <select
          id="pageSize"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <ProductList pageSize={pageSize} />
    </div>
  );
}
