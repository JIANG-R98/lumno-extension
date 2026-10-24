import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Callbacks keep the parameters of the signature they implement, a catch block
// often only needs to know that something threw, and `{ key: _omit, ...rest }`
// is how the code drops a key from a copy.
const unusedVarsOptions = {
  args: 'none',
  caughtErrors: 'none',
  ignoreRestSiblings: true,
  destructuredArrayIgnorePattern: '^_'
};

const extensionGlobals = {
  ...globals.browser,
  ...globals.webextensions
};

// src/ layers, lowest first: domain (pure logic), platform (browser and
// extension API wrappers), shared (UI and page runtime used by several
// surfaces), then the surfaces themselves. A module may import its own layer
// and the ones below it; a surface may not import another surface.
const SURFACES = ['background', 'content', 'overlay', 'newtab', 'options', 'onboarding', 'popup'];

function importsFrom(directories) {
  return {
    regex: `(?:^|/)(?:${directories.join('|')})(?:/|$)`,
    message: 'This layer may not import from there; see the layers in eslint.config.mjs.'
  };
}

function restrictImports(directories) {
  return { 'no-restricted-imports': ['error', { patterns: [importsFrom(directories)] }] };
}

// What domain code may not reach for: browser and extension globals, and DOM
// work on any object handed to it.
const DOMAIN_GLOBALS = [
  'chrome', 'browser', 'document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'location',
  'self', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'matchMedia', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'Image', 'FileReader', 'fetch', 'indexedDB', 'caches', 'importScripts', 'DOMParser', 'screen', 'history'
];
const DOM_MEMBERS = [
  'createElement', 'createElementNS', 'createTextNode', 'createDocumentFragment', 'querySelector',
  'querySelectorAll', 'getElementById', 'getElementsByClassName', 'addEventListener', 'removeEventListener',
  'appendChild', 'insertBefore', 'removeChild', 'replaceChildren', 'classList', 'setAttribute',
  'removeAttribute', 'innerHTML', 'getBoundingClientRect', 'attachShadow', 'getRootNode', 'ownerDocument',
  'defaultView', 'scrollIntoView'
];

export default tseslint.config(
  {
    ignores: [
      'build/',
      'dist/',
      'coverage/',
      'node_modules/',
      'src/react/',
      'assets/vendor/',
      '.claude/'
    ]
  },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', unusedVarsOptions],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Input sanitizers match control characters on purpose.
      'no-control-regex': 'off',
      // `let match = null;` and the like give a variable its type up front even
      // when every path assigns it before reading.
      'no-useless-assignment': 'off'
    }
  },
  {
    files: ['src/**/*.{js,ts,tsx}'],
    languageOptions: {
      sourceType: 'module',
      globals: extensionGlobals
    }
  },
  {
    files: ['src/background/**/*.{js,ts}'],
    languageOptions: {
      globals: globals.serviceworker
    }
  },
  {
    // Pages load these by URL as classic scripts, outside the bundles.
    files: [
      'src/shared/search/search-han-variants.js',
      'src/content/youtube-auto-pip-page.js'
    ],
    languageOptions: {
      sourceType: 'script'
    }
  },
  {
    // Node tooling. Tests also hand functions to the pages they drive, so
    // they see the browser's globals too.
    files: ['scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...extensionGlobals
      }
    }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node
    }
  },
  {
    // Converted runtime sources keep their JavaScript shape until they are
    // typed, so only the TypeScript rules that hold for untyped code apply.
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', unusedVarsOptions],
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-nocheck': false }],
      '@typescript-eslint/no-this-alias': 'off',
      // Not enforced for the JavaScript sources either.
      'prefer-const': 'off',
      'prefer-spread': 'off',
      'prefer-rest-params': 'off',
      '@typescript-eslint/no-unused-expressions': 'off'
    }
  },
  {
    // Globals are declared with var, the only form globalThis picks up.
    files: ['src/types/**/*.d.ts'],
    rules: { 'no-var': 'off' }
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      ...restrictImports(['platform', 'shared', 'react', ...SURFACES]),
      'no-restricted-globals': ['error', ...DOMAIN_GLOBALS],
      'no-restricted-syntax': ['error', {
        selector: `MemberExpression[property.name=/^(?:${DOM_MEMBERS.join('|')})$/]`,
        message: 'Domain code does no DOM work; move this to shared/ or a surface.'
      }]
    }
  },
  {
    files: ['src/platform/**/*.ts'],
    rules: restrictImports(['shared', 'react', ...SURFACES])
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: restrictImports(SURFACES)
  },
  ...SURFACES.map((surface) => ({
    files: [`src/${surface}/**/*.ts`],
    rules: restrictImports(SURFACES.filter((other) => other !== surface))
  })),
  {
    files: ['src/**/react/**/*.{ts,tsx}', 'tests/react/**/*.ts'],
    extends: [tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: extensionGlobals
    },
    rules: {
      // The classic hook rules. The plugin's other recommended rules check
      // code for the React Compiler, which Lumno does not use.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Config objects handed over from the untyped runtime in src/ are typed
      // as Record<string, any> on purpose.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', unusedVarsOptions]
    }
  }
);
