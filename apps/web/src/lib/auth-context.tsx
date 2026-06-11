'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthResult, LoginInput } from '@app/shared';
import { ApiError } from './api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface User {
  id: string;
  email: string;
}

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: User | null;
  status: Status;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Authenticated fetch: injects the bearer token and transparently refreshes on 401. */
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  // Access token lives ONLY in memory (a ref), never in localStorage — so an XSS
  // payload cannot exfiltrate it. Persistence across reloads is provided by the
  // httpOnly refresh cookie + the silent refresh on mount below.
  const accessTokenRef = useRef<string | null>(null);
  // Single-flight guard so concurrent 401s trigger exactly one /auth/refresh.
  const refreshPromiseRef = useRef<Promise<AuthResult | null> | null>(null);

  const doRefresh = useCallback(async (): Promise<AuthResult | null> => {
    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = (async () => {
        try {
          const res = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-Requested-With': 'fetch' },
          });
          return res.ok ? ((await res.json()) as AuthResult) : null;
        } catch {
          return null;
        }
      })();
    }
    const result = await refreshPromiseRef.current;
    refreshPromiseRef.current = null;
    return result;
  }, []);

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const exec = (token: string | null) =>
        fetch(`${API_URL}${path}`, {
          ...init,
          credentials: 'include',
          headers: {
            'X-Requested-With': 'fetch',
            ...(init.headers ?? {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

      let res = await exec(accessTokenRef.current);
      if (res.status === 401) {
        const refreshed = await doRefresh();
        if (refreshed) {
          accessTokenRef.current = refreshed.accessToken;
          setUser(refreshed.user);
          setStatus('authenticated');
          res = await exec(refreshed.accessToken);
        } else {
          accessTokenRef.current = null;
          setUser(null);
          setStatus('unauthenticated');
        }
      }
      return res;
    },
    [doRefresh],
  );

  const login = useCallback(async (input: LoginInput): Promise<void> => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new ApiError(res.status, body.message ?? 'Login failed');
    }
    const data = (await res.json()) as AuthResult;
    accessTokenRef.current = data.accessToken;
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'fetch' },
      });
    } catch {
      // best-effort; clear local state regardless
    }
    accessTokenRef.current = null;
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // On mount, attempt a silent refresh. If the httpOnly cookie is still valid
  // (and within the inactivity window), the user is restored without re-login.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await doRefresh();
      if (cancelled) return;
      if (result) {
        accessTokenRef.current = result.accessToken;
        setUser(result.user);
        setStatus('authenticated');
      } else {
        setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doRefresh]);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
