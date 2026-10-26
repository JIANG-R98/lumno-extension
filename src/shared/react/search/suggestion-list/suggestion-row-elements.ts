// The elements of a search suggestion row, and how the row publishes them
// on its own element for the selection styles (action-styles.ts), which
// restyle rows as the selection and the held modifier keys change.
import { useRef } from 'react';
import type { RefObject } from 'react';
import { queryHtmlTag } from '../../../dom-lookup';
import { surfaceClass, surfaceCssValue } from './surface-options';
import type {
  IconSpec,
  NormalizedOptions,
  SuggestionActionModelResult,
  SuggestionActionTagElement,
  SuggestionElement,
  SuggestionUtilityActionElements,
  SuggestionValueRef
} from './types';

interface RowRefs {
  item: RefObject<SuggestionElement | null>;
  iconSlot: RefObject<HTMLSpanElement | null>;
  title: RefObject<HTMLSpanElement | null>;
  command: RefObject<HTMLSpanElement | null>;
  historyTag: RefObject<SuggestionActionTagElement | null>;
  bookmarkTag: RefObject<SuggestionActionTagElement | null>;
  topSiteTag: RefObject<SuggestionActionTagElement | null>;
  openTabTag: RefObject<SuggestionActionTagElement | null>;
  actionTags: RefObject<HTMLDivElement | null>;
  // The action tags in the row's tag container, by position.
  actionTagList: RefObject<SuggestionActionTagElement[]>;
  visitButton: RefObject<HTMLButtonElement | null>;
  visitLabel: RefObject<HTMLSpanElement | null>;
  copySlot: RefObject<HTMLDivElement | null>;
  copyButton: RefObject<HTMLButtonElement | null>;
  deleteSlot: RefObject<HTMLDivElement | null>;
  deleteButton: RefObject<HTMLButtonElement | null>;
}

// What the row knows about itself when it publishes its elements.
interface RowFacts {
  themeHost: string;
  isPrimary: boolean;
  iconKind: IconSpec['kind'];
  // Its icon is the page's (a direct URL or browser page row).
  directIcon: boolean;
  command: boolean;
  actionModel: SuggestionActionModelResult;
  simpleMode: boolean;
}

function useRowRefs(): RowRefs {
  return {
    item: useRef<SuggestionElement>(null),
    iconSlot: useRef<HTMLSpanElement>(null),
    title: useRef<HTMLSpanElement>(null),
    command: useRef<HTMLSpanElement>(null),
    historyTag: useRef<SuggestionActionTagElement>(null),
    bookmarkTag: useRef<SuggestionActionTagElement>(null),
    topSiteTag: useRef<SuggestionActionTagElement>(null),
    openTabTag: useRef<SuggestionActionTagElement>(null),
    actionTags: useRef<HTMLDivElement>(null),
    actionTagList: useRef<SuggestionActionTagElement[]>([]),
    visitButton: useRef<HTMLButtonElement>(null),
    visitLabel: useRef<HTMLSpanElement>(null),
    copySlot: useRef<HTMLDivElement>(null),
    copyButton: useRef<HTMLButtonElement>(null),
    deleteSlot: useRef<HTMLDivElement>(null),
    deleteButton: useRef<HTMLButtonElement>(null)
  };
}

// The colors a tag returns to when the row is not selected.
function setDefaultTagColors(options: NormalizedOptions, tag: SuggestionActionTagElement | null, textFallback: string): void {
  if (!tag) {
    return;
  }
  tag._xDefaultBg = surfaceCssValue(options, 'var(--x-nt-tag-bg, #F3F4F6)');
  tag._xDefaultText = surfaceCssValue(options, `var(--x-nt-tag-text, ${textFallback})`);
  tag._xDefaultBorder = 'transparent';
}

function readUtilityActions(refs: RowRefs): SuggestionUtilityActionElements[] {
  return [
    refs.copySlot.current && refs.copyButton.current ? { slot: refs.copySlot.current, button: refs.copyButton.current } : null,
    refs.deleteSlot.current && refs.deleteButton.current ? { slot: refs.deleteSlot.current, button: refs.deleteButton.current } : null
  ].filter((action): action is SuggestionUtilityActionElements => Boolean(action));
}

// Puts the row's elements and state on its element.
function publishRowElements(options: NormalizedOptions, item: SuggestionElement, refs: RowRefs, facts: RowFacts,
  suggestionRef: SuggestionValueRef): void {
  const { actionModel, command } = facts;
  item._xIsSearchSuggestion = true;
  item._xThemeHost = facts.themeHost;
  item._xIsAutocompleteTop = facts.isPrimary;
  item._xIconWrap = refs.iconSlot.current;
  item._xIconIsFavicon = facts.iconKind === 'favicon' && refs.iconSlot.current?.getAttribute('data-favicon') === 'true';
  item._xDirectIconWrap = facts.directIcon ? refs.iconSlot.current : null;
  item._xTitle = command ? refs.command.current : refs.title.current;
  item._xCommandLabel = command ? refs.command.current : null;
  item._xHistoryTag = refs.historyTag.current;
  item._xBookmarkTag = refs.bookmarkTag.current;
  item._xTopSiteTag = refs.topSiteTag.current;
  item._xOpenTabTag = refs.openTabTag.current;
  [item._xHistoryTag, item._xTopSiteTag, item._xBookmarkTag, item._xOpenTabTag].forEach((tag) => {
    setDefaultTagColors(options, tag, '#667085');
  });
  item._xTagContainer = refs.actionTags.current;
  item._xActionModel = actionModel;
  item._xHasActionTags = actionModel.hasActionTags;
  item._xVisitButton = refs.visitButton.current;
  item._xVisitButtonLabel = refs.visitLabel.current;
  item._xVisitButtonAction = actionModel.visitButtonAction;
  item._xActionTags = refs.actionTagList.current;
  item._xActionTags.forEach((tag) => {
    tag._xActionLabel = queryHtmlTag(tag, `.${surfaceClass(options, 'x-nt-suggestion-action-tag__label')}`, 'span');
  });
  item._xSuggestion = suggestionRef.current;
  item._xAlwaysHideVisitButton = actionModel.alwaysHideVisitButton;
  item._xHasSwitchAction = actionModel.hasSwitchAction;
  item._xSimpleMode = facts.simpleMode;
  item._xHistoryDeleteButton = refs.deleteButton.current;
  item._xUtilityActions = readUtilityActions(refs);
}

export type { RowFacts, RowRefs };
export { publishRowElements, setDefaultTagColors, useRowRefs };
