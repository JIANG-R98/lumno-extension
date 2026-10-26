// The input's placeholder follows the mode: the panel's hint while the mode
// menu is open, the scope hint while a mode tag shows, else the surface's own.
import type { ControllerOptions } from './mode-options';

interface InputPlaceholderParts {
  input: HTMLInputElement;
  tag: HTMLElement;
  isMenuOpen(): boolean;
}

class InputPlaceholder {
  private readonly parts: InputPlaceholderParts;
  private readonly options: Pick<ControllerOptions, 'formatMessage' | 'getDefaultPlaceholder'>;

  constructor(parts: InputPlaceholderParts, options: Pick<ControllerOptions, 'formatMessage' | 'getDefaultPlaceholder'>) {
    this.parts = parts;
    this.options = options;
  }

  sync(): void {
    const { input, tag, isMenuOpen } = this.parts;
    const { formatMessage } = this.options;
    if (isMenuOpen()) {
      input.placeholder = formatMessage('search_scope_panel_placeholder', 'Search specific site content…');
      return;
    }
    input.placeholder = tag.style.getPropertyValue('display') !== 'none'
      ? formatMessage('search_scope_active_placeholder', 'Search within this scope; press Tab again to open the scope panel…')
      : this.options.getDefaultPlaceholder();
  }
}

export type { InputPlaceholderParts };
export { InputPlaceholder };
