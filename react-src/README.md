# React UI architecture

React is the required renderer for Lumno's New Tab, Options, Onboarding, Popup,
and in-page Overlay surfaces. The classic scripts under `src/` remain responsible
for browser APIs, persistence, navigation, ranking, drag orchestration, viewport
placement, and other platform behavior. They do not provide a second page
renderer.

## Runtime boundaries

- `react-src/newtab/` owns the New Tab structure and visible controls, including
  bookmarks, recent sites, shortcuts, suggestions, wallpaper controls, notices,
  menus, dialogs, feedback, dock, and wordmark.
- `react-src/options/` owns Settings navigation, forms, lists, controls,
  confirmations, shortcut references, and status feedback.
- `react-src/onboarding/` owns the complete onboarding presentation and
  interaction surfaces.
- `react-src/overlay/` owns the injected shell, search input, result rows, empty
  states, and recent-tab switcher.
- `react-src/popup/` owns the toolbar status, update, undo, and Picture-in-Picture controls.
- `react-src/shared/` contains typed renderers reused by more than one route.
- Background and content scripts stay framework-free unless they host one of the
  React surfaces above.

Shared Tooltip elements keep their owning React renderer on the element itself.
This lets the Onboarding page coexist with the self-contained Overlay bundle
without a later global API registration taking over or orphaning an existing
React root.

The page bootstrap imports the relevant React entry first and starts its classic
adapter only after the React API is ready. A missing React entry is a startup
error; there is no timed legacy-renderer fallback.

## Delivery guardrails

- Keep Manifest V3 artifacts local: no CDN, runtime compilation, `eval`, or
  remote code.
- Preserve stable DOM IDs, CSS classes, localization keys, and controller
  contracts that browser adapters depend on.
- Treat classic DOM writes as adapter work only: mount hosts, browser-managed
  resource elements, measurement probes, drag previews, and updates to elements
  owned by a React controller.
- Add visible structure and state to React components, not to classic adapter
  scripts.
- Keep the New Tab, Options, Onboarding, Popup, and Overlay bundle budgets enforced by
  `scripts/test-react-migration-contract.js`.
- Run both Vitest component coverage and classic browser-adapter contract tests.

## Verification

The release gate is:

```sh
npm test
npm run check
npm run audit:i18n
npm run test:package-store
git diff --check
```

Unpacked-extension smoke tests cover all five routes plus delayed search
completion, tab switching, bookmark drag/cascade behavior, wallpaper controls,
and settings persistence.
