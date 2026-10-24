// A development reload reports an update to the version already installed.
function isSameVersionReload(
  details: { reason?: string; previousVersion?: string } | null | undefined,
  currentVersion: unknown
): boolean {
  if (!details || String(details.reason || '') !== 'update') {
    return false;
  }
  const previousVersion = String(details.previousVersion || '').trim();
  const installedVersion = String(currentVersion || '').trim();
  return Boolean(previousVersion && installedVersion && previousVersion === installedVersion);
}

export { isSameVersionReload };
