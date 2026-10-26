// The mode tag's and Tab hint's models, which the input mode controller
// keeps and the React view (react/search/mode-tag.tsx) draws.
import type { RemixIconName } from '../../ui/remix-icon';

export interface ModeTagIcon {
  // A built-in line icon's name; empty for a glyph or a site icon.
  lineIcon: string;
  // The Remix icon class shown when there is no site icon, or it failed.
  glyphName: RemixIconName;
  iconUrl: string;
  // The host whose saved icon may replace iconUrl.
  iconHost: string;
}

export interface ModeTagColors {
  accent: string;
  background: string;
  color: string;
  border: string;
  shadow: string;
}

// A copy of the icon the tag showed before, fading out over the new one.
export interface ModeTagGhost {
  // Tells one swap's copy from the next.
  key: number;
  icon: ModeTagIcon;
  showImage: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ModeTagModel {
  visible: boolean;
  modeId: string;
  ariaLabel: string;
  text: string;
  // Null while no mode is set.
  icon: ModeTagIcon | null;
  // The site icon failed to load; the glyph shows instead.
  iconFailed: boolean;
  currentText: string;
  // The "current" label shows (while the menu is open), or is laid out
  // only to be measured.
  currentVisible: boolean;
  currentMeasuring: boolean;
  // The menu it controls is open: the tag sits above the menu.
  expanded: boolean;
  // The tag shows its open state, which follows the menu with motion.
  menuOpen: boolean;
  colors: ModeTagColors;
  ghost: ModeTagGhost | null;
}

export interface TabHintModel {
  visible: boolean;
  label: string;
  // The full label, for when the hint is cut short.
  title: string;
}

// The space between the tag's icon, label, "current" label and chevron.
export const MODE_TAG_ITEM_GAP_PX = 6;

export const EMPTY_MODE_TAG: ModeTagModel = Object.freeze({
  visible: false,
  modeId: '',
  ariaLabel: '',
  text: '',
  icon: null,
  iconFailed: false,
  currentText: '',
  currentVisible: false,
  currentMeasuring: false,
  expanded: false,
  menuOpen: false,
  colors: Object.freeze({
    accent: '',
    background: '#3B82F6',
    color: '#F8FAFC',
    border: 'none',
    shadow: 'none'
  }),
  ghost: null
});
