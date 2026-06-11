'use client';

import { useEffect, useRef } from 'react';
import { INACTIVITY_TIMEOUT_MS } from '@app/shared';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;

/**
 * Logs the user out after INACTIVITY_TIMEOUT_MS without interaction.
 * This mirrors the server-side sliding window so the UI reacts immediately
 * instead of waiting for the next API call to be rejected.
 */
export function useInactivityTimeout(enabled: boolean, onTimeout: () => void): void {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onTimeoutRef.current(), INACTIVITY_TIMEOUT_MS);
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [enabled]);
}
