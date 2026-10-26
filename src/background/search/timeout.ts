// A promise that settles with a fallback when it takes too long or fails.
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  const safePromise = promise
    .then((value) => value)
    .catch(() => fallbackValue);
  if (!timeoutMs || timeoutMs <= 0) {
    return safePromise;
  }
  return Promise.race([
    safePromise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallbackValue), timeoutMs);
    })
  ]);
}

export { withTimeout };
