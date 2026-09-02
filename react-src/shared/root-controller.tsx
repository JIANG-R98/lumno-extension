import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export interface ReactRootController<Model> {
  render(model: Model): void;
  destroy(): void;
}

export function createReactRootController<Model>(
  host: HTMLElement | null,
  renderView: (model: Model) => ReactNode
): ReactRootController<Model> {
  if (!host) {
    return Object.freeze({
      render() {},
      destroy() {}
    });
  }

  const reactRoot: Root = createRoot(host);
  let destroyed = false;

  return Object.freeze({
    render(model: Model) {
      if (destroyed) {
        return;
      }
      flushSync(() => {
        reactRoot.render(renderView(model));
      });
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      flushSync(() => {
        reactRoot.unmount();
      });
    }
  });
}
