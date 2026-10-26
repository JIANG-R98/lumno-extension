'use strict';

// The modules an executeScript call imports into a page, as extension paths
// (build/injected/<name>.js): the worker injects its in-page scripts as a
// function that imports them (src/platform/injection.ts). Empty for any other
// injection.

function injectedModules(details) {
  const urls = details && Array.isArray(details.args) && Array.isArray(details.args[0]) ? details.args[0] : [];
  return urls
    .map((url) => String(url).replace(/^.*?(build\/injected\/[\w-]+\.js)$/, '$1'))
    .filter((path) => /^build\/injected\/[\w-]+\.js$/.test(path));
}

// The command an executeScript call sends the last module it imports.
function injectedCommand(details) {
  return details && Array.isArray(details.args) ? details.args[1] : undefined;
}

module.exports = { injectedCommand, injectedModules };
