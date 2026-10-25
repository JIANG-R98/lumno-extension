// Reads site search providers from data this code did not write: settings,
// the bundled provider list, another surface's message. A provider needs a
// string key; each other provider field is kept only with its own type.
import type { SiteSearchProvider } from './types';

const STRING_FIELDS = [
  'id',
  'name',
  'template',
  'action',
  'submitStrategy',
  'category',
  'disabledReason',
  'icon',
  'iconUrl',
  'builtinKey',
  'directNavigationUrl',
  'directNavigationTitle'
] as const;

const BOOLEAN_FIELDS = [
  'disabled',
  '_xIsCustom',
  '_xIsAggregateSearch',
  '_xIsDetectedSearchEngine'
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readSiteSearchProvider(value: unknown): SiteSearchProvider | null {
  if (!isRecord(value) || typeof value.key !== 'string') {
    return null;
  }
  const provider: SiteSearchProvider = { key: value.key };
  STRING_FIELDS.forEach((field) => {
    const fieldValue = value[field];
    if (typeof fieldValue === 'string') {
      provider[field] = fieldValue;
    }
  });
  BOOLEAN_FIELDS.forEach((field) => {
    const fieldValue = value[field];
    if (typeof fieldValue === 'boolean') {
      provider[field] = fieldValue;
    }
  });
  const aliases: unknown = value.aliases;
  if (Array.isArray(aliases)) {
    provider.aliases = aliases.filter((alias): alias is string => typeof alias === 'string');
  }
  return provider;
}

// The providers in a list; anything that is not one is left out.
function readSiteSearchProviders(value: unknown): SiteSearchProvider[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const providers: SiteSearchProvider[] = [];
  value.forEach((item: unknown) => {
    const provider = readSiteSearchProvider(item);
    if (provider) {
      providers.push(provider);
    }
  });
  return providers;
}

export { readSiteSearchProvider, readSiteSearchProviders };
