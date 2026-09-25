import { useEffect } from 'react';
import { useToast } from '@jfc/ui-web';
import { ApiError } from './api';

/** Structural, not `jotai/utils`' own (internal-path) `Loadable<T>` type —
 * just enough shape for `useToastOnError` to read a loadable's error arm
 * without depending on jotai's non-public export path. */
interface LoadableLike {
  state: 'loading' | 'hasData' | 'hasError';
  error?: unknown;
}

interface ToastLike {
  show: (text: string, opts?: { tone?: 'neutral' | 'positive' | 'warning'; durationMs?: number }) => void;
}

/** Pure extraction, no side effect — for a call site that needs the
 * message for BOTH an inline error and a toast (form pages), so the two
 * never drift by using two different fallback strings. */
function messageFor(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  return err instanceof ApiError ? err.body.message : fallback;
}

/** One place every mutation's catch block calls — an `ApiError` shows its
 * real server message; anything else (a network failure, a thrown
 * non-Error) falls back to `fallback`. Mirrors jfc-host-app's
 * `lib/toastError.ts` (same name, same shape) so the pattern reads the
 * same in both the mobile and the web codebase. */
export function showApiError(toast: ToastLike, err: unknown, fallback = 'Something went wrong. Try again.'): void {
  toast.show(messageFor(err, fallback), { tone: 'warning' });
}

showApiError.messageFor = messageFor;

/** Fires a toast from a `loadable()`'s error arm — in a `useEffect`, not
 * during render (calling `toast.show` mid-render trips React's "cannot
 * update a component while rendering a different component" warning,
 * since `ToastProvider` is state above this one). One page-level call
 * covers a GET atom's failure; mutations still call `showApiError`
 * directly from their own catch block. */
export function useToastOnError(loadable: LoadableLike, fallback?: string): void {
  const toast = useToast();
  useEffect(() => {
    if (loadable.state === 'hasError') showApiError(toast, loadable.error, fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadable.state, loadable.error]);
}
