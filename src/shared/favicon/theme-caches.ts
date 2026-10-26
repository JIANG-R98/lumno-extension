// The site themes a surface resolved, by theme URL and by host, kept for the
// page's later lookups (the overlay keeps them across openings).
import type { ThemeVariant } from './favicon-theme';

const themeColorCache = new Map<string, ThemeVariant>();
const themeHostCache = new Map<string, ThemeVariant>();

export { themeColorCache, themeHostCache };
