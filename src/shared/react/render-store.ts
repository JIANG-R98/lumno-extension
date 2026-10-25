import { flushSync } from 'react-dom';

// A value a plain controller hands to a mounted React view. Each render
// commits before it returns, so the controller can measure, focus and
// animate what was drawn straight away.
export interface RenderStore<S> {
  getSnapshot(): S;
  subscribe(listener: () => void): () => void;
  render(snapshot: S): void;
}

export function createRenderStore<S>(initial: S): RenderStore<S> {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    render(next) {
      snapshot = next;
      flushSync(() => {
        listeners.forEach((listener) => listener());
      });
    }
  };
}
