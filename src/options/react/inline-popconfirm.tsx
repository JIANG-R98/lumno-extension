import { useEffect, useId, useRef, useState } from 'react';
import { useExclusiveAsyncAction } from '../../shared/react/use-exclusive-async-action';
import {
  PopconfirmContent,
  type PopconfirmCopy
} from '../../shared/react/popconfirm-content';
import { isNode } from '../../shared/dom-guards';
import type { RemixIconName } from '../../shared/ui/remix-icon';
import { RemixIcon } from '../../shared/react/remix-icon';

export type InlinePopconfirmCopy = PopconfirmCopy;

export function InlinePopconfirm({
  copy,
  onConfirm,
  triggerAriaLabel,
  triggerClassName,
  triggerIconName,
  triggerDisabled = false,
  triggerId,
  triggerTooltip
}: {
  copy: InlinePopconfirmCopy;
  onConfirm(): void | Promise<void>;
  triggerAriaLabel: string;
  triggerClassName: string;
  triggerIconName: RemixIconName;
  triggerDisabled?: boolean;
  triggerId?: string;
  // Shown by the page's floating tooltip.
  triggerTooltip?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocusRef = useRef(false);
  const generatedId = useId();
  const popconfirmId = triggerId ? `${triggerId}_popconfirm` : generatedId;
  const confirmAction = useExclusiveAsyncAction(onConfirm);

  const closeAndRestoreTriggerFocus = () => {
    restoreTriggerFocusRef.current = true;
    setOpen(false);
  };

  useEffect(() => {
    if (open || !restoreTriggerFocusRef.current) {
      return;
    }
    restoreTriggerFocusRef.current = false;
    triggerRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(isNode(event.target) ? event.target : null)) {
        setOpen(false);
      }
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAndRestoreTriggerFocus();
      }
    };
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [open]);

  return (
    <div
      className="_x_extension_popconfirm_wrap_2024_unique_"
      data-react-surface="options-inline-popconfirm"
      ref={wrapRef}
    >
      <button
        aria-controls={popconfirmId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={triggerAriaLabel}
        className={triggerClassName}
        data-tooltip={triggerTooltip}
        disabled={confirmAction.pending || triggerDisabled}
        id={triggerId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        ref={triggerRef}
        type="button"
      >
        <RemixIcon name={triggerIconName} />
      </button>
      <div
        aria-hidden={!open}
        aria-label={copy.message}
        className="_x_extension_popconfirm_2024_unique_"
        data-open={open ? 'true' : 'false'}
        id={popconfirmId}
        role="dialog"
      >
        {open ? (
          <PopconfirmContent
            busy={confirmAction.pending}
            copy={copy}
            onCancel={closeAndRestoreTriggerFocus}
            onConfirm={() => {
              void confirmAction.run().then((outcome) => {
                if (outcome.status !== 'skipped') {
                  closeAndRestoreTriggerFocus();
                }
              });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
