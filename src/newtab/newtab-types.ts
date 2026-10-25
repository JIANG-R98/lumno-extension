// Types the New Tab shares with the modules split out of it.
import type { ToastShowOptions } from '../shared/react/toast';
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

export type { BindTooltip, FormatMessage, ShowToast, Translate };
