// The open tab switcher's host element, and the functions the switcher puts
// on it for the page bridge and the next toggle to call.

const TAB_SWITCHER_HOST_ID = '_x_extension_tab_switcher_host_2026_unique_';

// What a call into the open switcher reports.
interface TabSwitcherReply {
  ok: boolean;
  reason?: string;
}

type TabSwitcherHost = HTMLElement & {
  // Moves the selection; false while the first press is still held.
  _lumnoTabSwitcherAdvance?(offset?: unknown): boolean;
  // Switches to the selected tab, as releasing the shortcut does.
  _lumnoTabSwitcherCommitFromShortcutRelease?(): boolean;
  // A thumbnail captured after the switcher opened; read as untrusted.
  _lumnoTabSwitcherUpdateThumbnail?(update: unknown): TabSwitcherReply;
  _lumnoTabSwitcherCleanup?(): void;
};

function getTabSwitcherHost(doc: Document): TabSwitcherHost | null {
  return doc.getElementById(TAB_SWITCHER_HOST_ID);
}

export { TAB_SWITCHER_HOST_ID, getTabSwitcherHost };
export type { TabSwitcherHost, TabSwitcherReply };
