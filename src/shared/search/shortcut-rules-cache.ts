// The browser shortcut rules (assets/data/shortcut-rules.json) a search
// surface loaded, and the load in progress, kept for the page's later
// searches.
import type { ShortcutRule } from '../../domain/messages';

const shortcutRulesCache: { rules: ShortcutRule[] | undefined; pending: Promise<ShortcutRule[]> | undefined } = {
  rules: undefined,
  pending: undefined
};

export { shortcutRulesCache };
