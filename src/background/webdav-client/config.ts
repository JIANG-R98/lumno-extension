// Checking a connection's endpoint, folder and credentials.
import { error } from './errors';
import type { WebDavConfigInput, WebDavConnection } from './types';

function readEndpoint(value: unknown): string {
  let endpoint: URL;
  try { endpoint = new URL(String(value || '').trim()); } catch (_error) { throw error('invalid-endpoint'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw error('invalid-endpoint');
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/';
  return endpoint.href;
}

function readDirectory(value: unknown): string {
  const directory = String(value || 'lumno').trim().replace(/^\/+|\/+$/g, '');
  if (!directory || directory.length > 240 || directory.split('/').some((part) => !/^[-\w\u0080-\uffff ]+$/.test(part) || part === '.' || part === '..')) throw error('invalid-directory');
  return directory;
}

function normalizeConfig(input: WebDavConfigInput): WebDavConnection {
  const endpoint = readEndpoint(input.endpoint);
  const directory = readDirectory(input.directory);
  const username = String(input.username || '').trim();
  const password = String(input.password || '');
  if (!username || username.includes(':') || username.length > 256 || !password || password.length > 4096) throw error('missing-credentials');
  return { endpoint, directory, username, password, enabled: input.enabled === true,
    concurrency: input.concurrency === 'collection-lock' ? 'collection-lock' : 'conditional',
    lockStrategy: input.lockStrategy === 'collection-create' ? 'collection-create' : 'collection-move' };
}

export {
  normalizeConfig,
  readDirectory,
  readEndpoint
};
