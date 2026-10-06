# React UI architecture

React is the required renderer for Lumno's New Tab, Options, Onboarding, and
in-page Overlay surfaces. The classic scripts under `src/` remain responsible
for browser APIs, persistence, navigation, ranking, drag orchestration, viewport
placement, and other platform behavior. They do not provide a second page
renderer.

## Runtime boundaries

- `react-src/newtab/` owns the New Tab structure and visible controls, including
  bookmarks, recent sites, shortcuts, wallpaper controls, notices, menus,
  dialogs, feedback, dock, and wordmark.
- `react-src/options/` owns Settings navigation, forms, lists, controls,
  confirmations, shortcut references, and status feedback.
- `react-src/onboarding/` owns the complete onboarding presentation and
  interaction surfaces.
- `react-src/overlay/` owns the injected shell, search input, result rows, empty
  states, and recent-tab switcher.
- `react-src/shared/` contains typed renderers reused by more than one route.
  Everything here lands in the `react-shared` chunk that New Tab, Options and
  Onboarding all load, so keep it to small, widely used pieces (select menu,
  segmented indicator, range slider, tooltip, toast, search input).
- `react-src/search/` holds the suggestion list rendered by both New Tab and the
  Overlay. It sits outside `shared/` on purpose: it is large and Options never
  needs it, so it stays in the New Tab bundle and the self-contained Overlay
  bundle.
- Background and content scripts stay framework-free unless they host one of the
  React surfaces above.

Shared Tooltip elements keep their owning React renderer on the element itself.
This lets the Onboarding page coexist with the self-contained Overlay bundle
without a later global API registration taking over or orphaning an existing
React root.

The page bootstrap imports the relevant React entry first and starts its classic
adapter only after the React API is ready. A missing React entry is a startup
error; there is no timed legacy-renderer fallback.

## Styling and shared components

- `src/shared/tokens.css` is the design vocabulary: radius, type, motion,
  layer and elevation scales plus semantic colors with light and dark values.
  Every extension page loads it first. Use a token instead of a literal when a
  value is on a scale; an off-scale literal is a deliberate exception.
- Dark mode flows through tokens. A component reads semantic tokens and only
  keeps its own `body[data-theme="dark"]` rule for colors no token covers.
- Stylesheets that the Overlay injects into web pages (`tooltip`, `menu-surface`,
  `toast`, `search-input`, `feature-hints`, `cursor-tooltip`,
  `suggestions-view`) keep a literal fallback in every `var(--lumno-…)`,
  because web pages do not load the tokens.
- One component, one stylesheet: `switch.css`, `choice-card.css`,
  `custom-select.css`, `range-slider.css`, `checkbox.css`, `toast.css`,
  `link-button.css` and `info-button.css` style both pages. Pages may resize a
  component through its documented custom properties; they do not copy its
  rules. Where two pages still use different legacy class names, the shared
  stylesheet lists both with `:is(...)`.
- Segmented controls position their sliding indicator only through
  `react-src/shared/segmented-indicator.ts`: React controls use
  `useSegmentedIndicator`, classic scripts call
  `globalThis.LumnoSegmentedIndicator`.
- Name new classes `x-lumno-<component>` with `__part` and `--variant` suffixes
  (see `x-lumno-link-button`). The `_x_extension_*_unique_`, `x-nt-*` and
  `x-ov-*` names are adapter contracts: keep them stable, but do not extend
  those schemes for new components.

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
- Keep the New Tab, Options, Onboarding, and Overlay bundle budgets enforced by
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

Unpacked-extension smoke tests cover all four routes plus delayed search
completion, tab switching, bookmark drag/cascade behavior, wallpaper controls,
and settings persistence.
