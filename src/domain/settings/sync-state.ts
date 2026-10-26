// How settings are kept and synced: the area the user keeps them in, WebDAV
// connections and status, the last sync, and the storage schema version.
import { defineSetting, defineSettingFamily } from './define';
import { custom, flag, opaque } from './schema';

// On when the user keeps settings on this device instead of browser sync.
// Retained for safely migrating older WebDAV installations: new connections
// keep browser sync as the preferences source and add WebDAV alongside it.
const localPrimary = defineSetting({
  key: '_x_extension_local_primary_2026_unique_',
  area: 'device',
  schema: flag(false)
});

const webdavStatus = defineSetting({
  key: '_x_extension_webdav_status_2026_unique_',
  area: 'device',
  schema: opaque()
});

// The status of each further WebDAV connection, by connection id; the first
// connection keeps webdavStatus.
const webdavConnectionStatus = defineSettingFamily({
  prefix: '_x_extension_webdav_status_2026_unique_:',
  area: 'device',
  schema: opaque()
});

// Server address, directory and username of each WebDAV connection, in
// browser sync so another device can offer to fill them in. The app
// password never goes here, and the record is not a preference: it never
// travels through WebDAV or settings export.
const webdavConnections = defineSetting({
  key: '_x_extension_webdav_connections_2026_unique_',
  area: 'browserSync',
  schema: opaque()
});

// Synced connections this device chose not to add.
const webdavDismissedConnections = defineSetting({
  key: '_x_extension_webdav_dismissed_connections_2026_unique_',
  area: 'device',
  schema: opaque()
});

// Changes whenever WebDAV replaces this device's wallpapers or icons, so
// open pages reload them.
const assetRevision = defineSetting({
  key: '_x_extension_asset_revision_2026_unique_',
  area: 'device',
  schema: opaque()
});

// When and how settings last synced (manual sync or an import); written to
// the area the user keeps settings in.
const syncMeta = defineSetting({
  key: '_x_extension_sync_meta_2024_unique_',
  area: 'preferences',
  schema: opaque()
});

// The storage schema version this device's migrations have reached
// (domain/settings/migrations.ts).
// A whole number, 0 for a device that never migrated.
const settingsSchemaVersion = defineSetting({
  key: '_x_extension_settings_schema_version_2026_unique_',
  area: 'device',
  schema: custom((value) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0))
});

// Errors the extension met recently, for the diagnostics file
// (domain/diagnostics.ts).
const diagnosticErrors = defineSetting({
  key: '_x_lumno_diagnostic_errors_2026_unique_',
  area: 'device',
  schema: opaque()
});

export {
  assetRevision,
  diagnosticErrors,
  localPrimary,
  settingsSchemaVersion,
  syncMeta,
  webdavConnectionStatus,
  webdavConnections,
  webdavDismissedConnections,
  webdavStatus
};
