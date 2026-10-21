// Starts the development-only debug surface on the page or frame that loads
// it (the codex-debug-surface bundle).
import { start } from './codex-debug-surface.js';

start({
  windowObj: typeof window !== 'undefined' ? window : null,
  documentObj: typeof document !== 'undefined' ? document : null,
  chromeApi: typeof chrome !== 'undefined' ? chrome : null
});
