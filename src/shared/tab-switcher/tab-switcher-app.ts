// The tab switcher the worker injects into a web page, an ES module the
// browser loads once per page. The worker calls run() with each open
// command (src/platform/injection.ts); extension pages import the switcher
// itself instead.
import { toggleTabSwitcher } from './tab-switcher';
import { readTabSwitcherCommand } from '../../domain/injected-commands';
import type { TabSwitcherReply } from './host';

function run(command: unknown): TabSwitcherReply {
  const request = readTabSwitcherCommand(command);
  return request ? toggleTabSwitcher(request.context) : { ok: false, reason: 'invalid-command' };
}

export { run };
