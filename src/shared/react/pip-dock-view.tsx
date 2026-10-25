import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createReactRootController, type ReactRootController } from './root-controller';

// The dock at the bottom of a page clip's picture-in-picture window: it
// peeks out from the bottom edge and slides up while the pointer is near it
// or a button has focus.

export interface PipDockTheme {
  hudBackground: string;
  hudBorder: string;
  cardShadow: string;
  buttonBackground: string;
  buttonText: string;
  buttonShadow: string;
  secondaryButtonBackground: string;
}

export interface PipDockModel {
  theme: PipDockTheme;
  labels: { reselect: string; close: string };
}

export interface PipDockHandlers {
  onReselect(): void;
  onClose(): void;
}

// The pointer this close to the window's bottom edge brings the dock up.
const REVEAL_EDGE_PX = 48;
const HIDE_DELAY_MS = 140;

// Keeps translation tools away from the dock's labels.
const NO_TRANSLATE = {
  className: 'notranslate',
  translate: 'no',
  lang: 'zxx',
  'data-no-translate': 'true',
  notranslate: ''
} as const;

function DockButton({ label, iconClass, background, theme, onClick }: {
  label: string;
  iconClass: string;
  background: string;
  theme: PipDockTheme;
  onClick(): void;
}) {
  return (
    <button
      {...NO_TRANSLATE}
      className="lumno-pip-dock-btn notranslate"
      onClick={onClick}
      style={{ background, color: theme.buttonText, boxShadow: theme.buttonShadow }}
      type="button"
    >
      <i {...NO_TRANSLATE} className={`ri-icon ${iconClass} notranslate`} />
      <span {...NO_TRANSLATE} className="lumno-pip-dock-label notranslate">{label}</span>
    </button>
  );
}

function PipDock({ model, handlers }: { model: PipDockModel; handlers: PipDockHandlers }) {
  const [expanded, setExpanded] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef(0);
  const viewRef = useRef<Window | null>(null);

  const cancelHide = (): void => {
    if (hideTimer.current && viewRef.current) {
      viewRef.current.clearTimeout(hideTimer.current);
    }
    hideTimer.current = 0;
  };
  const show = (): void => {
    cancelHide();
    setExpanded(true);
  };
  const hide = (): void => {
    cancelHide();
    const view = viewRef.current;
    if (!view) {
      return;
    }
    hideTimer.current = view.setTimeout(() => {
      hideTimer.current = 0;
      setExpanded(false);
    }, HIDE_DELAY_MS);
  };
  // The latest show and hide, for the window's pointer listener below.
  const reveal = useRef({ show, hide });
  reveal.current = { show, hide };

  useEffect(() => {
    const doc = dockRef.current ? dockRef.current.ownerDocument : null;
    const view = doc ? doc.defaultView : null;
    if (!doc || !view) {
      return undefined;
    }
    viewRef.current = view;
    const onMove = (event: MouseEvent): void => {
      const height = view.innerHeight;
      if (height > 0 && event.clientY >= height - REVEAL_EDGE_PX) {
        reveal.current.show();
      } else {
        reveal.current.hide();
      }
    };
    doc.addEventListener('mousemove', onMove);
    return () => {
      doc.removeEventListener('mousemove', onMove);
      if (hideTimer.current) {
        view.clearTimeout(hideTimer.current);
      }
      hideTimer.current = 0;
      viewRef.current = null;
    };
  }, []);

  const { theme, labels } = model;
  const style: CSSProperties = {
    position: 'fixed',
    left: '50%',
    bottom: '10px',
    transform: expanded ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(calc(100% - 8px))',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px 12px',
    borderRadius: '999px',
    background: theme.hudBackground,
    border: `1px solid ${theme.hudBorder}`,
    boxShadow: theme.cardShadow,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    transition: 'transform 180ms ease, opacity 180ms ease',
    opacity: expanded ? 1 : 0.92,
    zIndex: 2147483647
  };
  return (
    <div
      {...NO_TRANSLATE}
      data-expanded={expanded ? 'true' : undefined}
      data-lumno-pip-dock="1"
      onBlur={hide}
      onFocus={show}
      onMouseEnter={show}
      onMouseLeave={hide}
      ref={dockRef}
      style={style}
    >
      <DockButton
        background={theme.buttonBackground}
        iconClass="ri-focus-3-line"
        label={labels.reselect}
        onClick={handlers.onReselect}
        theme={theme}
      />
      <DockButton
        background={theme.secondaryButtonBackground}
        iconClass="ri-close-line"
        label={labels.close}
        onClick={handlers.onClose}
        theme={theme}
      />
    </div>
  );
}

export type PipDockViewController = ReactRootController<PipDockModel>;

// Draws the dock into a container in the picture-in-picture window.
function createPipDockView(container: HTMLElement, handlers: PipDockHandlers): PipDockViewController {
  return createReactRootController(container, (model: PipDockModel) => <PipDock handlers={handlers} model={model} />);
}

export function createPipDockViewApi() {
  return Object.freeze({
    implementation: 'react',
    createPipDockView
  });
}
