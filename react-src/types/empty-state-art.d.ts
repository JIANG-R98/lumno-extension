// Types for src/shared/ui/empty-state-art.js, which the React views import.
declare module '*/src/shared/ui/empty-state-art.js' {
  export type EmptyStateArtName =
    | 'blockedPage'
    | 'noResults'
    | 'noCommands'
    | 'noTabs'
    | 'emptyFolder'
    | 'emptyList'
    | 'loadFailed'
    | 'nothing';

  export type EmptyStateArtTheme = 'light' | 'dark' | 'auto';

  export interface EmptyStateArtOptions {
    size?: number;
    theme?: EmptyStateArtTheme;
    label?: string;
    id?: string;
  }

  export const EMPTY_STATE_ART_NAMES: readonly EmptyStateArtName[];

  export function createEmptyStateArt(
    doc: Document | null | undefined,
    name: EmptyStateArtName,
    options?: EmptyStateArtOptions
  ): SVGSVGElement;

  export function getEmptyStateArtMarkup(
    name: EmptyStateArtName,
    options?: EmptyStateArtOptions
  ): string;

  export const EMPTY_STATE_ART_CSS: string;

  export function ensureEmptyStateArtStyles(node: Node | null | undefined): boolean;

  export function followEmptyStateArtTheme(svg: SVGSVGElement): () => void;

  export function resolveEmptyStateArtTheme(element: Element | null | undefined): EmptyStateArtTheme;
}
