// The WebDAV state rules as one object, for the sync engine, which takes
// them as an option so tests can give it another.
import * as WebDavChromeBackup from './chrome-backup';
import * as WebDavConflicts from './conflicts';
import * as WebDavMerge from './merge';
import * as WebDavStateBase from './state-base';
import * as WebDavValidation from './validation';

const WEBDAV_CONTRACT_API = Object.freeze({
  ...WebDavStateBase,
  ...WebDavValidation,
  ...WebDavMerge,
  ...WebDavConflicts,
  ...WebDavChromeBackup
});

type WebDavContractApi = typeof WEBDAV_CONTRACT_API;

export { WEBDAV_CONTRACT_API };
export type { WebDavContractApi };
