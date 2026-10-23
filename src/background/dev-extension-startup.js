function isSameVersionReload(details, currentVersion) {
  if (!details || String(details.reason || '') !== 'update') {
    return false;
  }
  const previousVersion = String(details.previousVersion || '').trim();
  const installedVersion = String(currentVersion || '').trim();
  return Boolean(previousVersion && installedVersion && previousVersion === installedVersion);
}

export { isSameVersionReload };
