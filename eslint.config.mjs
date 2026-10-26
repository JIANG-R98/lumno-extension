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

// What domain code may not reach for: browser and extension globals, directly
// or through globalThis, and DOM work on any object handed to it. Timers and
// network requests are I/O too; platform/ wraps them. crypto stays allowed:
// its random values work the same in every runtime.
const DOMAIN_GLOBALS = [
  'chrome', 'browser', 'document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'location',
  'self', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'matchMedia', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'Image', 'FileReader', 'fetch', 'indexedDB', 'caches', 'importScripts', 'DOMParser', 'screen', 'history',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'AbortController', 'XMLHttpRequest',
  'WebSocket', 'Worker', 'BroadcastChannel'
];
const DOM_TYPES = [
  'Node', 'Element', 'HTMLElement', 'HTML\\w+Element', 'SVGElement', 'SVG\\w+Element', 'Document',
  'DocumentFragment', 'ShadowRoot', 'Window', 'EventTarget', 'Event', 'UIEvent', 'KeyboardEvent', 'MouseEvent',
  'PointerEvent', 'FocusEvent', 'InputEvent', 'CompositionEvent', 'WheelEvent', 'DragEvent', 'ClipboardEvent',
  'TouchEvent', 'CustomEvent', 'DOMRect', 'CSSStyleDeclaration'
];
const DOM_MEMBERS = [
  'createElement', 'createElementNS', 'createTextNode', 'createDocumentFragment', 'querySelector',
  'querySelectorAll', 'getElementById', 'getElementsByClassName', 'addEventListener', 'removeEventListener',
  'appendChild', 'insertBefore', 'removeChild', 'replaceChildren', 'classList', 'setAttribute',
  'removeAttribute', 'innerHTML', 'getBoundingClientRect', 'attachShadow', 'getRootNode', 'ownerDocument',
  'defaultView', 'scrollIntoView'
];

// An element type given to a query asserts it; the lookups in
// src/shared/dom-lookup.ts (and tests/react/dom.ts) check it instead.
const TYPE_ASSERTING_QUERY = {
  selector: 'CallExpression[callee.property.name=/^(?:querySelector|querySelectorAll|closest)$/][typeArguments]',
  message: 'Look the element up through a guarded lookup instead of asserting its type.'
};

// React rewrites innerHTML whenever this object is a new one.
const INLINE_INNER_HTML = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML'] > JSXExpressionContainer > ObjectExpression",
  message: 'Pass innerHtml(markup) from shared/react/inner-html, so unchanged markup stays in place.'
};

export default tseslint.config(
  {
    ignores: [
      'build/',
      'dist/',
      'coverage/',
      'node_modules/',
      'src/react/',
      'assets/vendor/',
      '.claude/',
      // Local work output and scratch data, ignored by git as well.
      'output/',
      '.tmp/',
      '.codex-artifacts/',
      '.worktrees/'
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
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      sourceType: 'module',
      globals: extensionGlobals
    }
  },
  {
    files: ['src/background/**/*.ts'],
    languageOptions: {
      globals: globals.serviceworker
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
    files: ['src/**/*.{ts,tsx}', 'tests/react/**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', unusedVarsOptions],
      // Types are narrowed, never asserted.
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-syntax': ['error', TYPE_ASSERTING_QUERY, INLINE_INNER_HTML]
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
      }, {
        selector: `MemberExpression[object.name='globalThis'][property.name=/^(?:${DOMAIN_GLOBALS.join('|')})$/]`,
        message: 'Domain code reaches no browser API; take it as a parameter or move this to platform/.'
      }, {
        // Typed code that handles the DOM names its types.
        selector: `TSTypeReference[typeName.name=/^(?:${DOM_TYPES.join('|')})$/]`,
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
      '@typescript-eslint/no-unused-vars': ['error', unusedVarsOptions]
    }
  }
);
