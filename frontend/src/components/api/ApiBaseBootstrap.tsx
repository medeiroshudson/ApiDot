'use client';

import { useEffect } from 'react';
import { API_BASE_STORAGE_KEY, setApiBase } from '@/lib/api/base';

/**
 * Restores the persisted API base into memory before the rest of the app
 * starts issuing requests. Renders nothing.
 */
export function ApiBaseBootstrap(): null {
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = typeof window !== 'undefined'
        ? window.localStorage.getItem(API_BASE_STORAGE_KEY)
        : null;
    } catch {
      stored = null;
    }
    setApiBase(stored);
  }, []);

  return null;
}
