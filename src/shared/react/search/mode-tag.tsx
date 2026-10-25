// The search input's mode tag (the chip at the input's start that says
// where a search goes, with its icon, label, "current" label and chevron)
// and the Tab hint at the input's end. The input mode controller
// (search/search-input-mode.ts) hands them models; the tag's motion and its
// place in the input stay with the controller, which animates and measures
// the elements drawn here.
import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties
} from 'react';
import { getModeLineIconPaths } from '../../search/input-mode/line-icons';
import { createRenderStore, type RenderStore } from '../render-store';
import { FONT_STACK, NO_TRANSLATE, SURFACE_VARS, type ModeSurface } from './mode-surface';
import {
  EMPTY_MODE_TAG,
  MODE_TAG_ITEM_GAP_PX,
  type ModeTagGhost,
  type ModeTagIcon,
  type ModeTagModel,
  type TabHintModel
} from '../../search/input-mode/mode-tag-model';

export type { ModeTagModel, TabHintModel };

export interface ModeTagHandlers {
  onClick(event: MouseEvent): void;
  onKeyDown(event: KeyboardEvent): void;
  onIconError(): void;
  // Swaps the image to the site icon's saved copy once there is one.
  attachIconData(image: HTMLImageElement, iconUrl: string, iconHost: string): void;
}

export interface ModeTagSnapshot {
  model: ModeTagModel;
  handlers: ModeTagHandlers | null;
}

export type ModeTagStore = RenderStore<ModeTagSnapshot>;
export type TabHintStore = RenderStore<TabHintModel>;

// What the controller draws through; each render commits before it returns.
export interface ModeTagView {
  render(model: ModeTagModel, handlers: ModeTagHandlers): void;
}

export interface TabHintView {
  render(model: TabHintModel): void;
}

export function createModeTagStore(): ModeTagStore {
  return createRenderStore<ModeTagSnapshot>({ model: EMPTY_MODE_TAG, handlers: null });
}

export function createTabHintStore(): TabHintStore {
  return createRenderStore<TabHintModel>({ visible: false, label: '', title: '' });
}

const ICON_SIZE = '20px';
const ICON_CLIP = 'inset(0 round 6px)';

// The tag's own look. Its place (left), size while it animates (width),
// motion (transform, opacity, transition, will-change) are the controller's.
function getTagStyle(model: ModeTagModel): CSSProperties {
  return {
    all: 'unset',
    position: 'absolute',
    top: '50%',
    transformOrigin: 'left center',
    display: model.visible ? 'inline-flex' : 'none',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: `${MODE_TAG_ITEM_GAP_PX}px`,
    maxWidth: 'min(220px, 48%)',
    minWidth: '0',
    boxSizing: 'border-box',
    height: '32px',
    padding: '0 6px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '13px',
    fontFamily: FONT_STACK,
    fontWeight: 700,
    lineHeight: '1',
    letterSpacing: '0',
    color: model.colors.color,
    background: model.colors.background,
    border: model.colors.border,
    borderRadius: '10px',
    cornerShape: 'superellipse(1.25)',
    boxShadow: model.colors.shadow,
    cursor: 'pointer',
    pointerEvents: 'auto',
    zIndex: model.expanded ? 41 : 1,
    userSelect: 'none',
    '--x-lumno-search-mode-accent': model.colors.accent || undefined
  };
}

function LinePaths({ name }: { name: string }) {
  const paths = getModeLineIconPaths(name) || [];
  return <>{paths.map((path) => <path d={path} key={path} />)}</>;
}

const LINE_ICON_PROPS = {
  fill: 'none',
  focusable: 'false',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: '2',
  viewBox: '0 0 24 24'
} as const;

const FRAME_STYLE: CSSProperties = {
  all: 'unset',
  position: 'relative',
  width: ICON_SIZE,
  height: ICON_SIZE,
  borderRadius: '6px',
  clipPath: ICON_CLIP,
  overflow: 'hidden',
  isolation: 'isolate',
  flex: `0 0 ${ICON_SIZE}`,
  transition: 'none'
};

const IMAGE_STYLE: CSSProperties = {
  all: 'unset',
  width: ICON_SIZE,
  height: ICON_SIZE,
  borderRadius: '6px',
  clipPath: ICON_CLIP,
  overflow: 'hidden',
  objectFit: 'contain',
  flex: '0 0 auto',
  transition: 'none'
};

// Which of the tag's icons shows.
function getIconParts(icon: ModeTagIcon | null, iconFailed: boolean) {
  const lineIcon = icon && getModeLineIconPaths(icon.lineIcon) ? icon.lineIcon : '';
  const showImage = Boolean(icon && !lineIcon && icon.iconUrl && !iconFailed);
  return {
    lineIcon,
    showImage,
    showGlyph: Boolean(icon && !lineIcon && !showImage)
  };
}

// The copy of the previous icon; the controller fades it out.
function GhostIcon({ ghost }: { ghost: ModeTagGhost }) {
  const style: CSSProperties = {
    position: 'absolute',
    left: `${ghost.left}px`,
    top: `${ghost.top}px`,
    width: `${ghost.width}px`,
    height: `${ghost.height}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    transformOrigin: 'center',
    zIndex: 2
  };
  if (getModeLineIconPaths(ghost.icon.lineIcon)) {
    return (
      <svg {...LINE_ICON_PROPS} aria-hidden="true" data-search-input-mode-icon-ghost="" style={style}>
        <LinePaths name={ghost.icon.lineIcon} />
      </svg>
    );
  }
  if (ghost.showImage) {
    return (
      <span aria-hidden="true" data-search-input-mode-icon-ghost="" style={{ ...FRAME_STYLE, ...style }}>
        <img alt="" src={ghost.icon.iconUrl} style={{ ...IMAGE_STYLE, display: 'block' }} />
      </span>
    );
  }
  return (
    <i
      aria-hidden="true"
      className={`ri-icon ri-size-16 ${ghost.icon.glyphClass}`}
      data-search-input-mode-icon-ghost=""
      style={style}
    />
  );
}

export function ModeTag({ store, prefixId }: { store: ModeTagStore; prefixId: string }) {
  const { model, handlers } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { lineIcon, showImage, showGlyph } = getIconParts(model.icon, model.iconFailed);
  const iconUrl = showImage && model.icon ? model.icon.iconUrl : '';
  const iconHost = model.icon ? model.icon.iconHost : '';
  const imageRef = useRef<HTMLImageElement>(null);
  const attach = useRef(handlers ? handlers.attachIconData : null);
  attach.current = handlers ? handlers.attachIconData : null;
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (image && iconUrl && attach.current && !iconUrl.startsWith('data:')) {
      attach.current(image, iconUrl, iconHost);
    }
  }, [iconUrl, iconHost]);
  const accent = model.colors.accent || undefined;
  const currentShown = model.currentVisible || model.currentMeasuring;
  return (
    <button
      {...NO_TRANSLATE}
      aria-controls={`${prefixId}-menu`}
      aria-expanded={model.expanded ? 'true' : 'false'}
      aria-haspopup="menu"
      aria-label={model.ariaLabel || undefined}
      className="x-lumno-search-input-mode__prefix"
      data-current-measuring={model.currentMeasuring ? 'true' : 'false'}
      data-current-visible={model.currentVisible ? 'true' : 'false'}
      data-menu-open={model.menuOpen ? 'true' : 'false'}
      data-mode-id={model.modeId || undefined}
      data-search-input-mode-prefix=""
      id={prefixId}
      onClick={(event) => {
        if (handlers) {
          handlers.onClick(event.nativeEvent);
        }
      }}
      onKeyDown={(event) => {
        if (handlers) {
          handlers.onKeyDown(event.nativeEvent);
        }
      }}
      style={getTagStyle(model)}
      type="button"
    >
      <span
        className="x-lumno-search-input-mode__prefix-icon-frame"
        data-search-input-mode-prefix-icon-frame=""
        style={{ ...FRAME_STYLE, display: showImage ? 'inline-flex' : 'none' }}
      >
        <img
          alt=""
          data-search-input-mode-prefix-icon=""
          decoding="async"
          onError={() => {
            if (handlers) {
              handlers.onIconError();
            }
          }}
          ref={imageRef}
          referrerPolicy="no-referrer"
          src={iconUrl || undefined}
          style={{ ...IMAGE_STYLE, display: showImage ? 'block' : 'none' }}
        />
      </span>
      <i
        aria-hidden="true"
        className={`ri-icon ri-size-16 ${model.icon ? model.icon.glyphClass : 'ri-search-line'}`}
        data-search-input-mode-prefix-glyph=""
        style={{ display: showGlyph ? 'inline-flex' : 'none', flex: '0 0 auto', transition: 'none' }}
      />
      <svg
        {...LINE_ICON_PROPS}
        aria-hidden="true"
        className="x-lumno-search-input-mode__prefix-line-icon"
        data-icon-name={lineIcon || undefined}
        data-search-input-mode-line-icon=""
        style={{
          display: lineIcon ? 'inline-flex' : 'none',
          width: '16px',
          height: '16px',
          flex: '0 0 16px',
          color: accent,
          transition: 'none'
        }}
      >
        {lineIcon ? <LinePaths name={lineIcon} /> : null}
      </svg>
      <span
        {...NO_TRANSLATE}
        data-search-input-mode-prefix-text=""
        style={{
          all: 'unset',
          display: 'block',
          flex: '0 1 auto',
          minWidth: '0',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: '18px'
        }}
      >
        {model.text}
      </span>
      <span
        {...NO_TRANSLATE}
        aria-hidden="true"
        data-search-input-mode-current=""
        style={{
          all: 'unset',
          display: currentShown ? 'inline-flex' : 'none',
          alignItems: 'center',
          fontSize: '13px',
          fontWeight: 600,
          lineHeight: '18px',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          flex: '0 0 auto',
          color: accent
        }}
      >
        <span {...NO_TRANSLATE} data-search-input-mode-current-text="" style={{ display: 'inline-block' }}>
          {model.currentText}
        </span>
      </span>
      <i
        aria-hidden="true"
        className="ri-icon ri-size-16 ri-arrow-down-s-line"
        data-search-input-mode-prefix-chevron=""
        style={{ display: model.icon ? 'inline-flex' : 'none', flex: '0 0 auto', color: accent }}
      />
      {model.ghost ? <GhostIcon ghost={model.ghost} key={model.ghost.key} /> : null}
    </button>
  );
}

// "Tab" and what it does now (search with the matched site). Its distance
// from the input's right edge is the controller's.
export function TabHint({ store, id, surface }: { store: TabHintStore; id: string; surface: ModeSurface }) {
  const model = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const vars = SURFACE_VARS[surface];
  return (
    <span
      {...NO_TRANSLATE}
      aria-hidden="true"
      className="x-lumno-search-input-mode__tab-hint"
      data-search-input-mode-tab-hint=""
      id={id}
      style={{
        all: 'unset',
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        display: model.visible ? 'inline-flex' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
        maxWidth: 'min(300px, 52%)',
        minWidth: '0',
        height: '28px',
        padding: '0',
        border: 'none',
        background: 'transparent',
        color: vars.tagText,
        boxSizing: 'border-box',
        fontSize: '13px',
        fontFamily: FONT_STACK,
        fontWeight: 700,
        lineHeight: '18px',
        letterSpacing: '0',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 1
      }}
      title={model.title || undefined}
    >
      <span
        {...NO_TRANSLATE}
        data-search-input-mode-tab-key=""
        style={{
          all: 'unset',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '32px',
          height: '22px',
          padding: '0 6px',
          borderRadius: '7px',
          cornerShape: 'superellipse(1.25)',
          border: `1px solid ${vars.border}`,
          background: vars.tagBackground,
          color: vars.tagText,
          boxSizing: 'border-box',
          fontSize: '11px',
          fontWeight: 700,
          lineHeight: '14px',
          letterSpacing: '0',
          whiteSpace: 'nowrap',
          flex: '0 0 auto'
        }}
      >
        {model.visible ? 'Tab' : ''}
      </span>
      <span
        {...NO_TRANSLATE}
        data-search-input-mode-tab-text=""
        style={{
          all: 'unset',
          display: 'inline-block',
          minWidth: '0',
          maxWidth: '220px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: vars.tagText,
          fontSize: '13px',
          fontWeight: 400,
          lineHeight: '18px',
          letterSpacing: '0',
          flex: '1 1 auto'
        }}
      >
        {model.label}
      </span>
    </span>
  );
}
