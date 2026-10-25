// Waits a moment after a direct address is typed before showing it, so a
// suggestion that arrives meanwhile can take its place.
interface DirectNavigationSettleOptions<C> {
  setTimeout?(callback: () => void, delayMs: number): number;
  clearTimeout?(timer: number): void;
  delayMs?: number;
  // Runs with the context of the last schedule once the wait passes.
  onSettle?(context: C): void;
}

interface DirectNavigationSettleController<C> {
  // Drops the pending wait; false when none was pending.
  cancel(): boolean;
  schedule(context: C): void;
  isPending(): boolean;
}

function createDirectNavigationSettleController<C>(
  options?: DirectNavigationSettleOptions<C> | null
): Readonly<DirectNavigationSettleController<C>> {
  const config: DirectNavigationSettleOptions<C> = options && typeof options === 'object' ? options : {};
  const scheduleTimer = typeof config.setTimeout === 'function'
    ? config.setTimeout
    : (callback: () => void, delayMs: number): number => window.setTimeout(callback, delayMs);
  const cancelTimer = typeof config.clearTimeout === 'function'
    ? config.clearTimeout
    : (timer: number): void => window.clearTimeout(timer);
  const delayMs = Number.isFinite(Number(config.delayMs))
    ? Math.max(0, Number(config.delayMs))
    : 120;
  let timer: number | null = null;

  function cancel(): boolean {
    if (timer === null) {
      return false;
    }
    cancelTimer(timer);
    timer = null;
    return true;
  }

  function schedule(context: C): void {
    cancel();
    timer = scheduleTimer(() => {
      timer = null;
      if (typeof config.onSettle === 'function') {
        config.onSettle(context);
      }
    }, delayMs);
  }

  return Object.freeze({
    cancel,
    schedule,
    isPending: () => timer !== null
  });
}

export { createDirectNavigationSettleController };
export type { DirectNavigationSettleController, DirectNavigationSettleOptions };
