// Shapes the input mode controller (search-input-mode.ts) hands to several
// of its modules here.
import type { ThemeRgb } from '../../../domain/favicon/favicon-utils';
import type { AggregateSearch } from '../../../domain/search/aggregate-search-store';
import type { SearchSourceType, SearchTextIndex, SiteSearchProvider } from '../../../domain/search/types';
import type { RemixIconName } from '../../ui/remix-icon';

// Message text by key, with {name} placeholders filled from values.
type FormatMessage = (key: string, fallback: string, values?: Record<string, string>) => string;

type CssDeclaration = [property: string, value: string];

// An inline style text from declarations.
type CssText = (pairs: CssDeclaration[]) => string;

// Sets one style property; ignores a missing element.
type SetStyle = (
  element: ElementCSSInlineStyle | null | undefined,
  property: string,
  value: string
) => void;

// Whether an element shows: its data-visible, else its display.
type IsElementVisible = (element: Element | null | undefined) => boolean;

// The surface's CSS custom properties the mode tag and menu draw with.
interface InputModeVars {
  tagBg: string;
  tagText: string;
  panelBorder: string;
  panelBg: string;
  panelText: string;
  panelShadow: string;
  panelRadius: string;
  panelGap: string;
}

// Red, green and blue, 0-255.
type Rgb = number[];

// A search mode's colors, as the surface works them out (from the site's
// icon for a site search). Only these fields are read here.
interface InputModeTheme {
  accent?: string;
  accentRgb?: ThemeRgb;
  // The caret color while the mode is on.
  placeholderText?: string;
}

// An entry of the mode menu, as the surface lists it.
interface ModeMenuItem {
  id: string;
  label: string;
  // The group title it sits under; a new title starts where it changes.
  group?: string;
  // The group's key when the surface lets groups move.
  groupKey?: string;
  active?: boolean;
  // The list it reorders within ('pinned' items do not drag).
  orderList?: string;
  // More text the filter matches.
  searchTerms?: string[];
  provider?: SiteSearchProvider | null;
  // A built-in line icon (bookmark, browser, history, star).
  menuIconName?: string;
  // A Remix icon class for the glyph.
  iconName?: RemixIconName;
  isAi?: boolean;
  theme?: InputModeTheme | null;
  iconUrl?: string;
  // The surface's own fields, handed back to its select and reorder
  // callbacks: what the item stands for, its saved order key, and the
  // aggregate search it runs.
  kind?: string;
  orderKey?: string;
  aggregate?: AggregateSearch;
  // The local source a local scope item narrows search to.
  sourceType?: SearchSourceType;
}

// Where a run of a label's characters starts and ends.
interface ModeMenuRange {
  start: number;
  end: number;
}

// What the filter matches an item against.
interface ModeMenuSearchIndex {
  // The normalized label, one character per entry of labelMap.
  label: string;
  // The label range each normalized character came from.
  labelMap: Readonly<ModeMenuRange>[];
  units: SearchTextIndex | null;
  searchTerms: string[];
}

interface ModeMenuMatch {
  matched: boolean;
  ranges: ModeMenuRange[];
}

// An item the menu shows, with what the filter matches it against.
interface ModeMenuEntry {
  // Shown as the selected mode.
  checked: boolean;
  group: string;
  item: ModeMenuItem;
  labelText: string;
  searchIndex: Readonly<ModeMenuSearchIndex>;
}

// Swaps the image to the icon's cached data URL once there is one.
type AttachFaviconData = (image: HTMLImageElement, iconUrl: string, iconHost: string) => void;

// A site search provider as the surfaces hand it to the controller; an
// aggregate search comes as one with its id.
type InputModeProvider = SiteSearchProvider & {
  aggregateId?: string;
  // Replaces "Search with {site}" in the Tab hint.
  tabHintLabel?: string;
};

// What the mode prefix shows besides its text, and how it changes.
interface PrefixContentOptions {
  modeId?: string;
  provider?: InputModeProvider | null;
  iconUrl?: string;
  // The host whose icon and theme the provider uses.
  iconHost?: string;
  iconName?: RemixIconName;
  isAi?: boolean;
  menuIconName?: string;
  // Keep an icon animation that is running.
  preserveIconAnimation?: boolean;
  animateIcon?: boolean;
  animateOutgoingIcon?: boolean;
}

type ResolveProviderIconUrl = (provider: SiteSearchProvider | null | undefined, iconUrl: string) => string | null | undefined;

type GetThemeForProvider = (provider: SiteSearchProvider) =>
  InputModeTheme | null | undefined | PromiseLike<InputModeTheme | null | undefined>;

export type {
  AttachFaviconData,
  CssDeclaration,
  CssText,
  FormatMessage,
  GetThemeForProvider,
  InputModeTheme,
  InputModeVars,
  InputModeProvider,
  IsElementVisible,
  ModeMenuEntry,
  ModeMenuItem,
  ModeMenuMatch,
  ModeMenuRange,
  ModeMenuSearchIndex,
  PrefixContentOptions,
  ResolveProviderIconUrl,
  Rgb,
  SetStyle
};
