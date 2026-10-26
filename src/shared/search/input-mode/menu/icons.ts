// Which icon a mode menu tile shows (a built-in line icon, a site icon or a
// glyph) and its colors. A site search's theme can come from its icon, so
// the surface resolves provider themes once per opening; the tiles redraw
// as each one arrives.
import { getModeLineIconPaths } from '../line-icons';
import { getModeMenuTileColors } from '../colors';
import type { ModeColorOptions } from '../colors';
import type { ControllerOptions } from '../mode-options';
import type { ModeMenuTileColors, ModeMenuTileIcon } from '../../../react/search/mode-menu';
import type { InputModeTheme, ModeMenuItem } from '../types';

type ModeMenuIconOptions = ModeColorOptions &
  Pick<ControllerOptions, 'getThemeForProvider' | 'resolveProviderIconUrl' | 'getProviderThemeHost'>;

function getLineIconName(item: ModeMenuItem): string {
  const name = item.menuIconName ? String(item.menuIconName).trim() : '';
  return getModeLineIconPaths(name) ? name : '';
}

class ModeMenuIcons {
  // Provider themes by item id, and the ids still being resolved.
  private providerThemes = new Map<string, InputModeTheme>();
  private pendingThemes = new Set<string>();
  private disposed = false;
  private readonly options: ModeMenuIconOptions;
  // Called when a provider theme arrives, to draw the tiles again.
  private readonly onThemesChange: () => void;

  constructor(options: ModeMenuIconOptions, onThemesChange: () => void) {
    this.options = options;
    this.onThemesChange = onThemesChange;
  }

  // Forgets the resolved themes, so the next opening asks again.
  clear(): void {
    this.providerThemes = new Map();
    this.pendingThemes = new Set();
  }

  // Asks the surface for the themes of the providers not asked about yet.
  request(items: readonly ModeMenuItem[]): void {
    const resolveTheme = this.options.getThemeForProvider;
    if (!resolveTheme) {
      return;
    }
    const themes = this.providerThemes;
    const pending = this.pendingThemes;
    items.forEach((item) => {
      const provider = item.provider;
      if (!provider || themes.has(item.id) || pending.has(item.id)) {
        return;
      }
      pending.add(item.id);
      Promise.resolve(resolveTheme(provider)).then((theme: InputModeTheme | null | undefined) => {
        pending.delete(item.id);
        if (this.disposed || themes !== this.providerThemes || !theme) {
          return;
        }
        themes.set(item.id, theme);
        this.onThemesChange();
      }).catch(() => {
        pending.delete(item.id);
      });
    });
  }

  tileColors(item: ModeMenuItem): ModeMenuTileColors {
    const theme = this.providerThemes.get(item.id) || item.theme || this.options.defaultTheme;
    return getModeMenuTileColors(this.options, theme, item.menuIconName);
  }

  tileIcon(item: ModeMenuItem): ModeMenuTileIcon {
    const provider = item.provider || null;
    return {
      lineIcon: getLineIconName(item),
      glyphName: item.iconName || (item.isAi ? 'ri-search-ai-line' : 'ri-search-line'),
      iconUrl: item.iconUrl ? String(this.options.resolveProviderIconUrl(item.provider, item.iconUrl) || '').trim() : '',
      iconHost: provider ? String(this.options.getProviderThemeHost(provider) || '').trim() : ''
    };
  }

  dispose(): void {
    this.disposed = true;
  }
}

export type { ModeMenuIconOptions };
export { ModeMenuIcons };
