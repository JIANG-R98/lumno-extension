import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export interface ShortcutHotkeyModel {
  animate?: boolean;
  placeholder?: string;
  tokens?: string[];
}

export interface ShortcutHotkeyController {
  render(model: ShortcutHotkeyModel): void;
  destroy(): void;
}

function ShortcutHotkey({ model }: { model: ShortcutHotkeyModel }) {
  const tokens = Array.isArray(model.tokens)
    ? model.tokens.map((token) => String(token || '')).filter(Boolean)
    : [];
  return (
    <>
      {tokens.map((label, index) => {
        const minWidth =
          label.length > 1
            ? `${Math.max(17, Math.round(label.length * 7.5 + 12))}px`
            : undefined;
        return (
          <span
            className={[
              '_x_extension_shortcuts_hotkey_token_2024_unique_',
              model.animate
                ? '_x_extension_shortcuts_hotkey_token_pop_2024_unique_'
                : ''
            ].filter(Boolean).join(' ')}
            key={`${label}:${index}`}
            style={{
              animationDelay: model.animate ? `${index * 36}ms` : undefined,
              minWidth
            }}
          >
            {label}
          </span>
        );
      })}
    </>
  );
}

export function createShortcutHotkeyController(
  host: HTMLElement | null,
  options: { onContentReady?: () => void } = {}
): ShortcutHotkeyController {
  if (!host) {
    return Object.freeze({
      render() {},
      destroy() {}
    });
  }
  const root: Root = createRoot(host);
  host.dataset.reactIsland = 'options-shortcut-hotkey';
  let destroyed = false;

  return Object.freeze({
    render(model: ShortcutHotkeyModel = {}) {
      if (destroyed) {
        return;
      }
      const tokens = Array.isArray(model.tokens) ? model.tokens : [];
      host.dataset.empty = tokens.length === 0 ? 'true' : 'false';
      host.dataset.placeholder = String(model.placeholder || '');
      flushSync(() => root.render(<ShortcutHotkey model={model} />));
      options.onContentReady?.();
    },
    destroy() {
      if (destroyed) {
        return;
      }
      flushSync(() => root.unmount());
      destroyed = true;
    }
  });
}

export function createShortcutHotkeyApi() {
  return Object.freeze({
    implementation: 'react',
    createShortcutHotkeyController
  });
}
