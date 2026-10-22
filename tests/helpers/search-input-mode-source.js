const { moduleScript } = require('./module-script');

// The controller as the pages run it, for evaluating in a test context: a
// script that leaves the module's exports on LumnoSearchInputMode.
function readSearchInputModeRuntimeSource() {
  return moduleScript('src/shared/search/search-input-mode.js', 'LumnoSearchInputMode');
}

module.exports = { readSearchInputModeRuntimeSource };
