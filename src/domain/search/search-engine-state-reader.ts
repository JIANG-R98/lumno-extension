import type { SearchEngineState } from './types';

// Reads a stored default search engine, keeping only the fields that hold
// text; null when the value is no record at all.
function readSearchEngineState(value: unknown): SearchEngineState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const state: SearchEngineState = {};
  const id: unknown = Reflect.get(value, 'id');
  const name: unknown = Reflect.get(value, 'name');
  const host: unknown = Reflect.get(value, 'host');
  const searchTemplate: unknown = Reflect.get(value, 'searchTemplate');
  if (typeof id === 'string') {
    state.id = id;
  }
  if (typeof name === 'string') {
    state.name = name;
  }
  if (typeof host === 'string') {
    state.host = host;
  }
  if (typeof searchTemplate === 'string') {
    state.searchTemplate = searchTemplate;
  }
  return state;
}

export { readSearchEngineState };
