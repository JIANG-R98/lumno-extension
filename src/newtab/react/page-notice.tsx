import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export const PAGE_NOTICE_ID =
  '_x_extension_newtab_notice_banner_2026_unique_';

function getMessage(
  messages: Record<string, any>,
  key: string,
  fallback: string
) {
  if (typeof messages.t === 'function') {
    return messages.t(key, fallback);
  }
  return Object.prototype.hasOwnProperty.call(messages, key)
    ? String(messages[key] || fallback)
    : fallback;
}

function getNoticeParam(params: unknown) {
  if (!params) {
    return '';
  }
  if (
    typeof params === 'object' &&
    params &&
    'get' in params &&
    typeof params.get === 'function'
  ) {
    return String(params.get('notice') || '').trim();
  }
  return String((params as { notice?: unknown }).notice || '').trim();
}

function openDetailsPage(options: Record<string, any>, detailsUrl: string) {
  if (typeof options.openExtensionDetailsPage === 'function') {
    options.openExtensionDetailsPage(detailsUrl);
    return;
  }
  const chromeApi = options.chromeApi;
  const windowObj: Window | undefined = options.windowObj;
  if (
    chromeApi?.runtime &&
    typeof chromeApi.runtime.sendMessage === 'function'
  ) {
    chromeApi.runtime.sendMessage(
      { action: 'openExtensionDetailsPage' },
      (response: { ok?: boolean; url?: string } | undefined) => {
        if (chromeApi.runtime.lastError) {
          if (detailsUrl) {
            windowObj?.open(detailsUrl, '_blank');
          }
          return;
        }
        if (response?.ok !== true) {
          const fallbackUrl = response?.url || detailsUrl;
          if (fallbackUrl) {
            windowObj?.open(fallbackUrl, '_blank');
          }
        }
      }
    );
    return;
  }
  if (detailsUrl) {
    windowObj?.open(detailsUrl, '_blank');
  }
}

function PageNotice({
  detailsUrl,
  messages,
  onClose,
  onDetails
}: {
  detailsUrl: string;
  messages: Record<string, any>;
  onClose(): void;
  onDetails(detailsUrl: string): void;
}) {
  const getRiSvg =
    typeof messages.getRiSvg === 'function'
      ? messages.getRiSvg
      : () => '';
  return (
    <>
      <div className="x-nt-page-notice-content">
        <div
          aria-hidden="true"
          className="x-nt-page-notice-icon"
          dangerouslySetInnerHTML={{
            __html: getRiSvg('ri-error-warning-line', 'ri-size-20')
          }}
        />
        <div className="x-nt-page-notice-message">
          {getMessage(
            messages,
            'newtab_file_access_notice_title',
            '由于浏览器限制，若要在本地文件页面（如 PDF、HTML）中唤起聚焦搜索，请手动开启“允许访问文件网址”'
          )}
        </div>
      </div>
      <button
        className="x-nt-page-notice-primary"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDetails(detailsUrl);
        }}
        type="button"
      >
        {getMessage(
          messages,
          'newtab_file_access_notice_open_cta',
          '前往开启'
        )}
      </button>
      <button
        aria-label={getMessage(
          messages,
          'newtab_file_access_notice_close',
          '关闭提示'
        )}
        className="x-nt-page-notice-close"
        dangerouslySetInnerHTML={{
          __html: getRiSvg('ri-close-line', 'ri-size-16')
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        type="button"
      />
    </>
  );
}

export interface PageNoticeController {
  dismiss(): void;
  element: HTMLDivElement;
}

export function renderPageNotice(
  options: Record<string, any> = {}
): PageNoticeController | null {
  const messages = options.messages || {};
  const documentObj: Document =
    options.document || messages.document || document;
  if (
    !documentObj.body ||
    getNoticeParam(options.params) !== 'file-access'
  ) {
    return null;
  }
  documentObj.getElementById(PAGE_NOTICE_ID)?.remove();
  const element = documentObj.createElement('div');
  element.id = PAGE_NOTICE_ID;
  element.dataset.reactIsland = 'newtab-page-notice';
  const root: Root = createRoot(element);
  let dismissed = false;
  const controller: PageNoticeController = {
    dismiss() {
      if (dismissed) {
        return;
      }
      dismissed = true;
      flushSync(() => root.unmount());
      element.remove();
      options.onClose?.();
    },
    element
  };
  flushSync(() =>
    root.render(
      <PageNotice
        detailsUrl={String(options.detailsUrl || messages.detailsUrl || '')}
        messages={messages}
        onClose={() => controller.dismiss()}
        onDetails={(detailsUrl) =>
          openDetailsPage(
            {
              ...options,
              windowObj: options.windowObj || window
            },
            detailsUrl
          )
        }
      />
    )
  );
  const bottomDock: HTMLElement | null =
    options.bottomDock || messages.bottomDock || null;
  const referenceNode =
    bottomDock?.parentNode === documentObj.body ? bottomDock : null;
  documentObj.body.insertBefore(element, referenceNode);
  return controller;
}

export function createPageNoticeApi() {
  return Object.freeze({
    NOTICE_ID: PAGE_NOTICE_ID,
    implementation: 'react',
    renderPageNotice
  });
}
