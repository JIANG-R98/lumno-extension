import { BusyLabel } from '../shared/busy-label';

export interface PopconfirmCopy {
  cancelLabel: string;
  confirmLabel: string;
  message: string;
  messageKey: string;
}

export function PopconfirmContent({
  busy = false,
  copy,
  onCancel,
  onConfirm
}: {
  busy?: boolean;
  copy: PopconfirmCopy;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <>
      <div
        className="_x_extension_popconfirm_text_2024_unique_"
        data-i18n={copy.messageKey}
      >
        {copy.message}
      </div>
      <div className="_x_extension_popconfirm_actions_2024_unique_">
        <button
          className="_x_extension_shortcut_submit_2024_unique_ _x_extension_shortcut_secondary_2024_unique_"
          data-i18n="confirm_cancel"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
          type="button"
        >
          {copy.cancelLabel}
        </button>
        <button
          aria-busy={busy}
          className="_x_extension_shortcut_submit_2024_unique_ _x_extension_shortcut_submit_primary_2024_unique_ _x_extension_shortcut_save_2024_unique_"
          data-i18n="confirm_ok"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onConfirm();
          }}
          type="button"
        >
          <BusyLabel busy={busy}>{copy.confirmLabel}</BusyLabel>
        </button>
      </div>
    </>
  );
}
