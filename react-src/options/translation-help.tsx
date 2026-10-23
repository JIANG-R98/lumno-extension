import { useEffect, useRef, useState } from 'react';
import { createReactRootController, type ReactRootController } from './root-controller';

export interface TranslationHelpRenderModel {
  visible: boolean;
  actionLabel?: string;
  actionLabelKey?: string;
  closeLabel?: string;
  description?: string;
  downloadHint?: string;
  downloadLabel?: string;
  onDownload?: () => Promise<unknown> | void;
  reportHref?: string;
  reportLabel?: string;
  title?: string;
}

export type TranslationHelpController = ReactRootController<TranslationHelpRenderModel>;

const POPOVER_ID = '_x_extension_translation_help_popover_2026_unique_';

// The quiet "Improve translation" button beside the language picker; it opens
// a small panel with the two ways to help.
function TranslationHelpView(model: TranslationHelpRenderModel) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  if (!model.visible) {
    return null;
  }

  const handleDownload = () => {
    if (downloading || !model.onDownload) {
      return;
    }
    setDownloading(true);
    Promise.resolve(model.onDownload())
      .catch(() => undefined)
      .finally(() => setDownloading(false));
  };

  return (
    <div className="_x_extension_translation_help_anchor_2026_unique_" ref={rootRef}>
      <button
        aria-controls={POPOVER_ID}
        aria-expanded={open ? 'true' : 'false'}
        aria-haspopup="dialog"
        className="_x_extension_shortcut_submit_2024_unique_ _x_extension_feedback_support_action_2026_unique_"
        data-open={open ? 'true' : 'false'}
        data-translation-help="toggle"
        onClick={() => setOpen((value) => !value)}
        ref={buttonRef}
        type="button"
      >
        <i className="ri-icon ri-size-14 ri-translate-2" aria-hidden="true" />
        <span data-i18n={model.actionLabelKey}>{model.actionLabel}</span>
      </button>
      <div
        aria-hidden={open ? undefined : 'true'}
        aria-label={model.title}
        className="_x_extension_menu_surface_2024_unique_ _x_extension_translation_help_popover_2026_unique_"
        data-open={open ? 'true' : 'false'}
        id={POPOVER_ID}
        role="dialog"
      >
        <div className="_x_extension_feedback_support_qr_header_2026_unique_">
          <p>{model.title}</p>
          <button
            aria-label={model.closeLabel}
            className="_x_extension_feedback_support_qr_close_2026_unique_"
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
            tabIndex={open ? 0 : -1}
            type="button"
          >
            <i className="ri-icon ri-size-16 ri-close-line" aria-hidden="true" />
          </button>
        </div>
        <p className="_x_extension_translation_help_desc_2026_unique_">{model.description}</p>
        <div className="_x_extension_translation_help_actions_2026_unique_">
          {model.reportHref ? (
            <a
              className="_x_extension_feedback_support_link_2026_unique_"
              data-translation-help="report"
              href={model.reportHref}
              rel="noreferrer noopener"
              tabIndex={open ? 0 : -1}
              target="_blank"
            >
              <i className="ri-icon ri-size-16 ri-github-line" aria-hidden="true" />
              <span>{model.reportLabel}</span>
              <i className="ri-icon ri-size-14 ri-external-link-line" aria-hidden="true" />
            </a>
          ) : null}
          <button
            aria-busy={downloading ? 'true' : undefined}
            className="_x_extension_feedback_support_link_2026_unique_"
            data-translation-help="download"
            disabled={downloading}
            onClick={handleDownload}
            tabIndex={open ? 0 : -1}
            type="button"
          >
            <i className="ri-icon ri-size-16 ri-file-excel-2-line" aria-hidden="true" />
            <span>{model.downloadLabel}</span>
            <i className="ri-icon ri-size-14 ri-download-2-line" aria-hidden="true" />
          </button>
        </div>
        <p className="_x_extension_translation_help_hint_2026_unique_">{model.downloadHint}</p>
      </div>
    </div>
  );
}

export function createTranslationHelpController(
  host: HTMLElement | null
): TranslationHelpController {
  if (host) {
    host.dataset.reactIsland = 'options-translation-help';
  }
  return createReactRootController(host, (model) => (
    <TranslationHelpView {...model} />
  ));
}

export function createTranslationHelpApi() {
  return Object.freeze({
    implementation: 'react' as const,
    createTranslationHelpController
  });
}
