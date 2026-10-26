// One WebDAV connection: captures this device's preferences, shortcuts and
// wallpapers, merges them with the server's copy against the last state
// both shared, publishes the result under the server's write lock and
// applies it locally.
import type { WebDavRequest } from '../../domain/messages';
import { capture } from './capture';
import { pause, status } from './connect';
import { createConnection } from './connection';
import type { Connection, ConnectionListeners } from './connection';
import { handle } from './connection-requests';
import { mirrorChrome } from './local-apply';
import { fail, report, session } from './runtime';
import { backgroundRound, onStorageChanged, schedule } from './sync-round';
import type { ConnectionController, ConnectionControllerOptions } from './types';

function createListeners(conn: Connection): ConnectionListeners {
  return {
    storageChanged: (changes, areaName) => onStorageChanged(conn, changes, areaName),
    alarm: (alarm) => {
      if (!conn.schedule.stopped && alarm.name === conn.ports.alarmName) {
        void backgroundRound(conn, false);
      }
    }
  };
}

// Listens for local edits and the round alarm, and runs the first round
// unless the manager does.
function start(conn: Connection, listeners: ConnectionListeners): void {
  const { chrome: chromeApi, runtime, privateStore } = conn.ports;
  if (conn.schedule.started || conn.schedule.stopped) return;
  conn.schedule.started = true;
  chromeApi.storage.onChanged.addListener(listeners.storageChanged);
  if (chromeApi.alarms && chromeApi.alarms.onAlarm) chromeApi.alarms.onAlarm.addListener(listeners.alarm);
  if (conn.ports.managed) return;
  runtime.ready.then(async () => {
    const { config } = await session(conn);
    if ((config && config.enabled) || runtime.isActiveAreaName('local') || await privateStore.get('pendingApply')) {
      if (config && config.enabled) schedule(conn);
      await backgroundRound(conn, true);
    }
  }).catch((cause: unknown) => report(conn, 'Could not start WebDAV sync.', cause));
}

function stop(conn: Connection, listeners: ConnectionListeners): Promise<void> {
  const chromeApi = conn.ports.chrome;
  return conn.jobs.run(async () => {
    await pause(conn);
    conn.schedule.stopped = true;
    if (chromeApi.storage.onChanged.removeListener) chromeApi.storage.onChanged.removeListener(listeners.storageChanged);
    if (chromeApi.alarms && chromeApi.alarms.onAlarm.removeListener) chromeApi.alarms.onAlarm.removeListener(listeners.alarm);
  });
}

function createConnectionController(options?: ConnectionControllerOptions | null): Readonly<ConnectionController> {
  const conn = createConnection(options || {});
  const listeners = createListeners(conn);
  return Object.freeze({
    start: () => start(conn, listeners),
    stop: () => stop(conn, listeners),
    status: () => status(conn),
    capture: (recovering?: boolean) => capture(conn, recovering),
    mirrorChrome: () => mirrorChrome(conn),
    handle: (request: WebDavRequest) => conn.jobs.run(() => {
      if (conn.schedule.stopped) fail(conn, 'connection-missing');
      return handle(conn, request);
    })
  });
}

export { createConnectionController };
