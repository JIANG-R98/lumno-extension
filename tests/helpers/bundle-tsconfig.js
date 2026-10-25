'use strict';

// The TypeScript settings esbuild compiles test bundles with. The extension's
// own bundles take none from the type-checking tsconfig.json (whose strict
// mode would make esbuild add "use strict", and vars of a script evaluated
// in a window would then stay local), so neither do the tests'.
const BUNDLE_TSCONFIG_RAW = Object.freeze({
  compilerOptions: {
    jsx: 'react-jsx',
    useDefineForClassFields: true
  }
});

module.exports = { BUNDLE_TSCONFIG_RAW };
