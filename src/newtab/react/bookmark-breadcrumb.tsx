import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export interface BookmarkBreadcrumbItem {
  id: string;
  title: string;
}

export interface BookmarkBreadcrumbModel {
  items?: BookmarkBreadcrumbItem[];
}

export function createBookmarkBreadcrumbController(
  host: HTMLElement | null,
  options: { onNavigate?: (folderId: string) => void } = {}
) {
  if (!host) {
    return Object.freeze({
      render() {},
      destroy() {}
    });
  }
  const root: Root = createRoot(host);
  host.dataset.reactIsland = 'newtab-bookmark-breadcrumb';
  let destroyed = false;

  return Object.freeze({
    render(model: BookmarkBreadcrumbModel = {}) {
      if (destroyed) {
        return;
      }
      const items = Array.isArray(model.items) ? model.items : [];
      const visible = items.length > 0;
      host.style.setProperty('display', visible ? 'inline-flex' : 'none');
      flushSync(() => {
        root.render(
          <>
            {items.map((item, index) => {
              const id = String(item.id || '');
              const title = String(item.title || '');
              const current = index === items.length - 1;
              return (
                <span
                  className="x-nt-bookmarks-crumb-item"
                  key={`${id}:${index}`}
                >
                  <span
                    aria-hidden="true"
                    className="x-nt-bookmarks-crumb-sep"
                  >
                    /
                  </span>
                  <button
                    aria-current={current ? 'page' : undefined}
                    aria-label={title}
                    className="x-nt-bookmarks-crumb"
                    data-bookmark-drop-folder-id={id}
                    data-bookmark-drop-folder-title={title}
                    disabled={current}
                    onClick={() => {
                      if (!current && id) {
                        options.onNavigate?.(id);
                      }
                    }}
                    title={title}
                    type="button"
                  >
                    {title}
                  </button>
                </span>
              );
            })}
          </>
        );
      });
    },
    destroy() {
      if (destroyed) {
        return;
      }
      flushSync(() => root.unmount());
      destroyed = true;
    }
  });
}

export function createBookmarkBreadcrumbApi() {
  return Object.freeze({
    implementation: 'react',
    createBookmarkBreadcrumbController
  });
}
