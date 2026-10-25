import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { queryHtmlTag, queryHtmlTags } from '../../shared/dom-lookup';
import { isHtmlTag } from '../../shared/dom-guards';

export interface CascadeItemView {
  button: HTMLButtonElement;
  copyButton: HTMLButtonElement | null;
  icon: HTMLImageElement | HTMLSpanElement | null;
  row: HTMLDivElement;
}

export interface CascadeLevelView {
  content: HTMLDivElement;
  destroy(): void;
  element: HTMLDivElement;
  items: CascadeItemView[];
}

export interface CascadeItem {
  host?: string;
  id?: string | number;
  index?: number;
  parentId?: string | number;
  themeUrl?: string;
  title?: string;
  type?: string;
  url?: string;
}

export interface CascadeLevelConfig {
  documentObj?: Document;
  levelIndex: number;
  folderId: string;
  folderTitle: string;
  items: readonly CascadeItem[];
  sanitizeDisplayText?(value: unknown): string;
  getFigmaFolderSvg?(suffix: string, folderId?: string): string;
  getRiSvg?(icon: string, className: string): string;
  getUrlDisplay?(url: string): string;
  copyLabel?: string;
  emptyLabel?: string;
  siteIconAlt?: string;
}

function CascadeLevel({
  copyLabel,
  emptyLabel,
  folderId,
  folderTitle,
  getFigmaFolderSvg,
  getRiSvg,
  getUrlDisplay,
  items,
  levelIndex,
  register,
  sanitizeDisplayText,
  siteIconAlt
}: {
  copyLabel: string;
  emptyLabel: string;
  folderId: string;
  folderTitle: string;
  getFigmaFolderSvg(suffix: string, folderId?: string): string;
  getRiSvg(icon: string, className: string): string;
  getUrlDisplay(url: string): string;
  items: readonly CascadeItem[];
  levelIndex: number;
  register(content: HTMLDivElement, items: CascadeItemView[]): void;
  sanitizeDisplayText(value: unknown): string;
  siteIconAlt: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    const itemViews = queryHtmlTags(content, '[data-cascade-view-index]', 'div').map((row): CascadeItemView => {
      const button = queryHtmlTag(row, '.x-nt-bookmark-cascade-item', 'button');
      if (!button) {
        throw new Error('A bookmark cascade row has no item button.');
      }
      const icon = row.querySelector('.x-nt-bookmark-cascade-icon');
      return {
        row,
        button,
        copyButton: queryHtmlTag(row, '.x-nt-bookmark-cascade-copy-trigger', 'button'),
        icon: isHtmlTag(icon, 'img') || isHtmlTag(icon, 'span') ? icon : null
      };
    });
    register(content, itemViews);
  }, [register]);
  const cleanFolderTitle = sanitizeDisplayText(folderTitle);
  return (
    <div className="x-nt-bookmark-cascade-content" ref={contentRef} role="none">
      {cleanFolderTitle ? (
        <div
          className="x-nt-bookmark-cascade-title"
          role="presentation"
          title={cleanFolderTitle}
        >
          {cleanFolderTitle}
        </div>
      ) : null}
      {items.length === 0 ? (
        <div className="x-nt-bookmark-cascade-empty">{emptyLabel}</div>
      ) : null}
      {items.map((item, index) => {
        const isFolder = item.type === 'folder';
        const titleText = sanitizeDisplayText(
          item.title || (item.url ? getUrlDisplay(item.url) : folderTitle)
        );
        const parentId = String(item.parentId || folderId || '');
        const bookmarkIndex = Number.isFinite(Number(item.index))
          ? String(item.index)
          : '';
        const draggable = Boolean(
          item.id && parentId && Number.isFinite(Number(item.index))
        );
        return (
          <div
            className={`x-nt-bookmark-cascade-row${
              isFolder ? ' x-nt-bookmark-cascade-row--folder' : ''
            }`}
            data-cascade-view-index={index}
            key={`${String(item.id || item.url || index)}-${index}`}
            role="none"
          >
            <button
              aria-expanded={isFolder ? false : undefined}
              aria-haspopup={isFolder ? 'menu' : undefined}
              aria-label={titleText}
              className={`x-nt-bookmark-cascade-item${
                isFolder ? ' x-nt-bookmark-cascade-item--folder' : ''
              }`}
              data-bookmark-dragging="false"
              data-bookmark-draggable={draggable ? 'true' : 'false'}
              data-bookmark-drop-folder-id={
                isFolder ? String(item.id || '') : undefined
              }
              data-bookmark-drop-folder-title={
                isFolder ? titleText : undefined
              }
              data-bookmark-id={String(item.id || '')}
              data-bookmark-index={bookmarkIndex}
              data-bookmark-parent-id={parentId}
              data-level={levelIndex}
              data-type={isFolder ? 'folder' : 'bookmark'}
              draggable={false}
              role="menuitem"
              tabIndex={-1}
              title={titleText}
              type="button"
            >
              {isFolder ? (
                <span
                  aria-hidden="true"
                  className="x-nt-bookmark-cascade-icon x-nt-bookmark-cascade-icon--folder"
                  dangerouslySetInnerHTML={{
                    __html: getFigmaFolderSvg(
                      `${String(item.id || 'folder')}-cascade-${index}`, String(item.id || '')
                    )
                  }}
                />
              ) : (
                <img
                  alt={siteIconAlt}
                  className="x-nt-bookmark-cascade-icon"
                  draggable={false}
                  loading={index < 4 ? 'eager' : 'lazy'}
                />
              )}
              <span className="x-nt-bookmark-cascade-label">{titleText}</span>
              {isFolder ? (
                <span
                  aria-hidden="true"
                  className="x-nt-bookmark-cascade-arrow"
                  dangerouslySetInnerHTML={{
                    __html: getRiSvg(
                      'ri-arrow-right-s-line',
                      'ri-size-16'
                    )
                  }}
                />
              ) : null}
            </button>
            {!isFolder && item.url ? (
              <button
                aria-label={copyLabel}
                className="x-nt-bookmark-cascade-copy-trigger"
                data-tooltip={copyLabel}
                dangerouslySetInnerHTML={{
                  __html: getRiSvg('ri-file-copy-line', 'ri-size-16')
                }}
                type="button"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function createCascadeMenu(documentObj: Document = document) {
  const element = documentObj.createElement('div');
  element.className = 'x-nt-bookmark-cascade-menu';
  element.dataset.reactIsland = 'newtab-bookmark-cascade';
  element.setAttribute('role', 'menu');
  return element;
}

export function createCascadeLevel(config: CascadeLevelConfig): CascadeLevelView {
  const documentObj: Document = config.documentObj || document;
  const levelIndex = Math.max(0, Math.floor(Number(config.levelIndex)) || 0);
  const element = documentObj.createElement('div');
  element.className = `x-nt-bookmark-cascade-level${
    levelIndex > 0 ? ' x-nt-bookmark-cascade-submenu' : ''
  }`;
  element.dataset.level = String(levelIndex);
  element.dataset.reactIsland = 'newtab-bookmark-cascade-level';
  element.setAttribute('role', 'menu');
  const root: Root = createRoot(element);
  let content: HTMLDivElement | null = null;
  let itemViews: CascadeItemView[] = [];
  const register = (
    nextContent: HTMLDivElement,
    nextItems: CascadeItemView[]
  ) => {
    content = nextContent;
    itemViews = nextItems;
  };
  const rawItems = Array.isArray(config.items) ? config.items : [];
  const items = rawItems.filter(
    (item) => item && (item.url || item.type === 'folder')
  );
  flushSync(() =>
    root.render(
      <CascadeLevel
        copyLabel={String(config.copyLabel || 'Copy link')}
        emptyLabel={String(config.emptyLabel || 'No content')}
        folderId={String(config.folderId || '')}
        folderTitle={String(config.folderTitle || '')}
        getFigmaFolderSvg={
          typeof config.getFigmaFolderSvg === 'function'
            ? config.getFigmaFolderSvg
            : () => ''
        }
        getRiSvg={
          typeof config.getRiSvg === 'function' ? config.getRiSvg : () => ''
        }
        getUrlDisplay={
          typeof config.getUrlDisplay === 'function'
            ? config.getUrlDisplay
            : (url) => String(url || '')
        }
        items={items}
        levelIndex={levelIndex}
        register={register}
        sanitizeDisplayText={
          typeof config.sanitizeDisplayText === 'function'
            ? config.sanitizeDisplayText
            : (value) => String(value || '')
        }
        siteIconAlt={String(config.siteIconAlt || 'Site')}
      />
    )
  );
  if (!content) {
    flushSync(() => root.unmount());
    throw new Error('Lumno React bookmark cascade level did not mount.');
  }
  let destroyed = false;
  return {
    content,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      flushSync(() => root.unmount());
    },
    element,
    items: itemViews
  };
}

export function createBookmarkCascadeViewApi() {
  return Object.freeze({
    implementation: 'react',
    createLevel: createCascadeLevel,
    createMenu: createCascadeMenu
  });
}
