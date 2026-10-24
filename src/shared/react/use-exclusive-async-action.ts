import { useCallback, useEffect, useRef, useState } from 'react';

export type ExclusiveAsyncOutcome<Result> =
  | { status: 'fulfilled'; value: Result }
  | { status: 'rejected'; error: unknown }
  | { status: 'skipped' };

export function getAsyncErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return String(error.message || '');
  }
  return typeof error === 'string' ? error : '';
}

export function useExclusiveAsyncAction<Args extends unknown[], Result>(
  action: (...args: Args) => Result | Promise<Result>
) {
  const actionRef = useRef(action);
  const mountedRef = useRef(true);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  actionRef.current = action;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: Args): Promise<ExclusiveAsyncOutcome<Result>> => {
      if (pendingRef.current) {
        return { status: 'skipped' };
      }
      pendingRef.current = true;
      setPending(true);
      try {
        return {
          status: 'fulfilled',
          value: await actionRef.current(...args)
        };
      } catch (error) {
        return { status: 'rejected', error };
      } finally {
        pendingRef.current = false;
        if (mountedRef.current) {
          setPending(false);
        }
      }
    },
    []
  );

  return { pending, run };
}
