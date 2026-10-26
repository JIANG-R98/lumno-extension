// The field's secondary action button, which may ask in a popconfirm under
// it before running.
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { PopconfirmContent, type PopconfirmClassNames, type PopconfirmCopy } from '../popconfirm-content';
import { RemixIcon } from '../remix-icon';
import type { RemixIconSpec } from '../../ui/remix-icon';
import { noTranslateProps, useButtonTooltip, useHoverActive } from './chrome';
import type { SearchInputTooltip } from './chrome';

interface SearchInputActionConfirm {
  // Read on every open, so the copy follows the current UI language.
  getCopy(): PopconfirmCopy;
  onConfirm(event: MouseEvent): void;
}

interface SecondaryActionConfig {
  ariaLabel?: string;
  className?: string;
  // Asks in a popconfirm under the button before running the action.
  confirm?: SearchInputActionConfirm;
  icon: RemixIconSpec;
  id: string;
}

const POPCONFIRM_CLASS_NAMES: PopconfirmClassNames = Object.freeze({
  actions: 'x-lumno-search-input__popconfirm-actions',
  // No Cancel button: the action button, Escape or a click outside closes it.
  cancel: '',
  confirm:
    'x-lumno-search-input__popconfirm-button x-lumno-search-input__popconfirm-button--primary',
  text: 'x-lumno-search-input__popconfirm-text'
});
const POPCONFIRM_GAP = 6;

// Closes the bubble on a press anywhere but the button and the bubble. The
// Overlay lives in a closed ShadowRoot, whose nodes are hidden from
// document listeners, so this watches the root the button is rendered in.
function useCloseOnOutsidePress(open: boolean, triggerRef: RefObject<HTMLButtonElement | null>,
  bubbleRef: RefObject<HTMLDivElement | null>, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger) {
      return undefined;
    }
    const root = trigger.getRootNode();
    const onPointerDown = (event: Event) => {
      const path = event.composedPath();
      if (path.includes(trigger) || (bubbleRef.current && path.includes(bubbleRef.current))) {
        return;
      }
      closeRef.current();
    };
    root.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [bubbleRef, open, triggerRef]);
}

function PopconfirmBubble({ id, open, copy, position, bubbleRef, onKeyDown, onConfirm }: {
  id: string;
  open: boolean;
  // Kept after closing so the bubble fades out with its content.
  copy: PopconfirmCopy | null;
  position: CSSProperties;
  bubbleRef: RefObject<HTMLDivElement | null>;
  onKeyDown(event: ReactKeyboardEvent): void;
  onConfirm(event: MouseEvent): void;
}) {
  return (
    <div
      {...noTranslateProps()}
      aria-hidden={!open}
      aria-label={copy?.message}
      className="x-lumno-search-input__popconfirm"
      data-open={open ? 'true' : 'false'}
      id={id}
      onKeyDown={onKeyDown}
      ref={bubbleRef}
      role="dialog"
      style={position}
    >
      {copy ? (
        <PopconfirmContent classNames={POPCONFIRM_CLASS_NAMES} copy={copy} onConfirm={(event) => onConfirm(event.nativeEvent)} />
      ) : null}
    </div>
  );
}

function SecondaryAction({ action, label, tooltip }: {
  action: SecondaryActionConfig;
  label: string;
  tooltip: SearchInputTooltip | null;
}) {
  const confirm = action.confirm;
  const hover = useHoverActive();
  const [open, setOpen] = useState(false);
  // Kept after closing so the bubble fades out with its content.
  const [copy, setCopy] = useState<PopconfirmCopy | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useButtonTooltip<HTMLButtonElement>(tooltip, label);
  const popconfirmRef = useRef<HTMLDivElement>(null);
  const popconfirmId = useId();

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  };

  useCloseOnOutsidePress(open, triggerRef, popconfirmRef, () => setOpen(false));

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!open || event.key !== 'Escape') {
      return;
    }
    // Close only the bubble, not the surface around the search input.
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };

  const toggle = () => {
    const trigger = triggerRef.current;
    if (tooltip) {
      tooltip.hide();
    }
    if (!confirm || !trigger) {
      return;
    }
    if (open) {
      setOpen(false);
      return;
    }
    const parent = trigger.offsetParent;
    setPosition({
      right: parent
        ? parent.clientWidth - trigger.offsetLeft - trigger.offsetWidth
        : 0,
      top: trigger.offsetTop + trigger.offsetHeight + POPCONFIRM_GAP
    });
    setCopy(confirm.getCopy());
    setOpen(true);
  };

  return (
    <>
      <button
        {...noTranslateProps()}
        aria-controls={confirm ? popconfirmId : undefined}
        aria-expanded={confirm ? open : undefined}
        aria-haspopup={confirm ? 'dialog' : undefined}
        {...hover.handlers}
        aria-label={label}
        className={action.className || ''}
        data-hover-active={hover.active ? 'true' : undefined}
        data-tooltip={label || undefined}
        id={action.id}
        onClick={confirm ? toggle : (tooltip ? tooltip.hide : undefined)}
        onKeyDown={confirm ? onKeyDown : undefined}
        ref={triggerRef}
        type="button"
      >
        <RemixIcon {...action.icon} />
      </button>
      {confirm ? (
        <PopconfirmBubble
          bubbleRef={popconfirmRef}
          copy={copy}
          id={popconfirmId}
          onConfirm={(event) => {
            close(false);
            confirm.onConfirm(event);
          }}
          onKeyDown={onKeyDown}
          open={open}
          position={position}
        />
      ) : null}
    </>
  );
}

export type { SearchInputActionConfirm, SecondaryActionConfig };
export { SecondaryAction };
