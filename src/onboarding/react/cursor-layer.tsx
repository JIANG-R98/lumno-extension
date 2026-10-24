import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export interface CursorLayerRenderModel {
  enabled: boolean;
  mode: string;
}

export interface CursorLayerController {
  render(model: CursorLayerRenderModel): void;
  destroy(): void;
}

const CURSOR_PATH = 'M8.5 6.5 L43.5 28.7 L29.3 33 L20.8 50 Z';

function DemoCursor() {
  return (
    <span aria-hidden="true" className="demo-cursor">
      <svg
        aria-hidden="true"
        className="figma-cursor"
        focusable="false"
        viewBox="0 0 48 58"
      >
        <path
          className="figma-cursor__outline"
          d={CURSOR_PATH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="figma-cursor__fill"
          d={CURSOR_PATH}
          fill="#303030"
          stroke="#303030"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}

export function createCursorLayerController(
  host: HTMLElement | null
): CursorLayerController {
  if (!host) {
    return {
      render() {},
      destroy() {}
    };
  }

  const hostElement: HTMLElement = host;
  const reactRoot: Root = createRoot(hostElement);
  let destroyed = false;
  hostElement.setAttribute('data-react-island', 'onboarding-cursor-layer');

  function render(model: CursorLayerRenderModel): void {
    if (destroyed) {
      return;
    }
    const enabled = Boolean(model.enabled);
    hostElement.dataset.cursorEnabled = enabled ? 'true' : 'false';
    hostElement.dataset.cursorMode = enabled ? String(model.mode || '') : '';

    flushSync(() => {
      reactRoot.render(<DemoCursor />);
    });
  }

  return Object.freeze({
    render,
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

export function createCursorLayerApi() {
  return Object.freeze({
    implementation: 'react',
    createCursorLayerController
  });
}
