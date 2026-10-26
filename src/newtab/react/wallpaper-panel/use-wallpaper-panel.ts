// The appearance panel's state and handlers: which sections are open, the
// slider value bubble, the upload and link inputs, and everything the
// sections read from the panel state. Its result is what every section takes.
import { useRef, useState, useEffect } from 'react';
import { useSliderValueBubble, type SliderBubble } from './panel-primitives';
import {
  type WallpaperSourceTab,
  sourceTabId,
  sourcePanelId,
  type ExternalSelectKey,
  type PanelSelectModel,
  type SectionSettingsModel,
  type WallpaperPanelModel,
  type WallpaperPanelState
} from './panel-model';
import type { SelectMenuControls } from '../../../shared/react/select-menu';

export interface WallpaperPanelProps {
  documentObj: Document;
  externalSelects: Partial<Record<ExternalSelectKey, PanelSelectModel>>;
  model: WallpaperPanelModel;
  registerSelect(id: string, controls: SelectMenuControls): void;
  // Null until the bookmark and site card runtime hands it over.
  sectionSettings: SectionSettingsModel | null;
  state: WallpaperPanelState;
}

export function useWallpaperPanel(props: WallpaperPanelProps) {
  const { documentObj, externalSelects, model, registerSelect, sectionSettings, state } = props;
  const { actions, glassStyle } = state;
  const checkIcon = String(model.icons?.check || '');
  const arrowIcon = String(model.icons?.arrow || '');
  const infoIcon = String(model.icons?.info || '');
  const marks = model.marks || {};
  const { bubble, node: bubbleNode } = useSliderValueBubble(documentObj, state.open);
  const fileInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const [themeExpanded, setThemeExpanded] = useState(true);
  const [searchExpanded, setSearchExpanded] = useState(true);
  const [styleExpanded, setStyleExpanded] = useState(true);
  const [faviconExpanded, setFaviconExpanded] = useState(true);
  const [wallpaperExpanded, setWallpaperExpanded] = useState(true);
  const [shortcutsExpanded, setShortcutsExpanded] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const shortcuts = state.shortcuts;
  const wallpaper = state.wallpaper;
  const shortcutsOpen = shortcutsExpanded && shortcuts.enabled;
  const shortcutControlsDisabled = !shortcutsOpen;
  const wallpaperOpen = wallpaperExpanded && wallpaper.enabled;

  // Turning shortcuts off folds their details. Switching a section on here opens its
  // settings, like every other section; a change made elsewhere leaves them folded.
  useEffect(() => {
    if (!shortcuts.enabled) setShortcutsExpanded(false);
  }, [shortcuts.enabled]);
  // A saved link clears the field for the next one.
  useEffect(() => {
    setUrlDraft('');
  }, [wallpaper.local.url.clearToken]);

  const sliderBubble: SliderBubble = bubble;
  const local = wallpaper.local;
  const bing = wallpaper.bing;
  const curated = wallpaper.curated;
  const effect = wallpaper.effect;
  const sourceTabPanel = (tab: WallpaperSourceTab) => ({
    'aria-hidden': wallpaper.activeTab === tab ? 'false' as const : 'true' as const,
    'aria-labelledby': sourceTabId(tab),
    'data-wallpaper-panel': tab,
    id: sourcePanelId(tab),
    role: 'tabpanel'
  });
  const openFilePicker = () => {
    if (local.upload.loading) return;
    actions.hideTooltip();
    if (local.upload.full) {
      actions.showLocalWallpaperLimit();
      return;
    }
    fileInput.current?.click();
  };
  const showUploadTooltip = (event: { currentTarget: HTMLElement }) => {
    if (local.upload.loading) {
      actions.hideTooltip();
      return;
    }
    actions.showTooltip(event.currentTarget, local.upload.label);
  };

  return {
    documentObj,
    externalSelects,
    model,
    registerSelect,
    sectionSettings,
    state,
    actions,
    glassStyle,
    checkIcon,
    arrowIcon,
    infoIcon,
    marks,
    bubble,
    bubbleNode,
    fileInput,
    urlInput,
    themeExpanded,
    setThemeExpanded,
    searchExpanded,
    setSearchExpanded,
    styleExpanded,
    setStyleExpanded,
    faviconExpanded,
    setFaviconExpanded,
    wallpaperExpanded,
    setWallpaperExpanded,
    shortcutsExpanded,
    setShortcutsExpanded,
    urlDraft,
    setUrlDraft,
    shortcuts,
    wallpaper,
    shortcutsOpen,
    shortcutControlsDisabled,
    wallpaperOpen,
    sliderBubble,
    local,
    bing,
    curated,
    effect,
    sourceTabPanel,
    openFilePicker,
    showUploadTooltip
  };
}

export type WallpaperPanelContext = ReturnType<typeof useWallpaperPanel>;
