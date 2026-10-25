// Types the New Tab shares with the modules split out of it.
import type { ToastShowOptions } from '../shared/react/toast';
import type { CursorTooltipOptions, CursorTooltipTextSource } from '../shared/ui/cursor-tooltip';
import type { createSelectMenuController } from './react/select-menu';
import type { TooltipBindOptions, TooltipTextSource } from '../shared/ui/tooltip';

// A message by key from the page language; fallback when it has none.
type Translate = (key: string, fallback: string) => string;

// The message with each {name} replaced by params[name].
type FormatMessage = (key: string, fallback: string, params?: Readonly<Record<string, string | number>>) => string;

// Shows a toast; isError marks it as a failure.
type ShowToast = (message: string, isError?: boolean, options?: ToastShowOptions) => void;

// Binds a tooltip to the target; null when there is no target.
type BindTooltip = (
  target: HTMLElement | null,
  getText: TooltipTextSource,
  options?: TooltipBindOptions
) => HTMLElement | null;

// Binds a tooltip that follows the pointer to the target.
type BindCursorTooltip = (
  target: HTMLElement | null,
  getText: CursorTooltipTextSource,
  options?: CursorTooltipOptions
) => HTMLElement | null;

// The controller of the React select menus the page's context menus are.
type SelectMenuController = ReturnType<typeof createSelectMenuController>;

// A context menu's parts: the positioned wrapper and the select it drives.
interface ContextMenuParts {
  control: HTMLElement;
  select: HTMLSelectElement;
  trigger: HTMLButtonElement;
  menu: HTMLElement;
}

export type {
  BindCursorTooltip,
  BindTooltip,
  ContextMenuParts,
  FormatMessage,
  SelectMenuController,
  ShowToast,
  Translate
};
