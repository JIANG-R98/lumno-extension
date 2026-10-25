export interface CursorLayerRenderModel {
  enabled: boolean;
  mode: string;
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

// The demo cursor over the visual; its mode picks the path it moves along.
export function CursorLayer({ model, className }: { model: CursorLayerRenderModel; className?: string }) {
  const enabled = Boolean(model.enabled);
  return (
    <div
      className={['cursor-layer', className].filter(Boolean).join(' ')}
      data-cursor-enabled={enabled ? 'true' : 'false'}
      data-cursor-mode={enabled ? String(model.mode || '') : ''}
      id="onboarding-cursor-layer"
    >
      <DemoCursor />
    </div>
  );
}
