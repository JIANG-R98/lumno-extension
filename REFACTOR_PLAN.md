# Repository Refactor Plan

## Objective

Improve maintainability and runtime performance across the entire extension while preserving user data, observable behavior, packaging semantics, and browser compatibility.

The refactor follows four rules:

1. Extract only behavior that is genuinely shared or independently testable.
2. Remove duplicate and patch-stacked implementations instead of adding another compatibility layer.
3. Require behavior-equivalence tests or an explicit contract test for every structural extraction.
4. Treat persisted user data, manifest identity, sync keys, and migration behavior as compatibility boundaries.

## Baseline and Scope

The repository was audited across these surfaces:

- New-tab data flow, bookmarks, recent sites, search, favicon rendering, and folder animations.
- Background service worker, shortcut rules, favicon policies, and cache behavior.
- Overlay lifecycle, event listeners, search panel, and dynamically injected dependencies.
- Options, onboarding, content scripts, locale handling, shortcuts, and selection actions.
- Shared browser/runtime utilities and storage settings.
- React onboarding islands and generated bundles.
- Manifest resource ordering, store packaging, tests, and performance profiles.

The worktree was clean before the refactor. Existing test, type-check, build, package, and performance commands are the comparison baseline.

## Workstreams

### 1. New-tab data and rendering

- [x] Optimize recent-site collection with bounded `Set`/`Map` lookups and early termination.
- [x] Preserve the previous merge and ordering behavior with randomized equivalence tests.
- [x] Extract site display-name resolution into a pure shared module.
- [x] Extract bookmark-folder SVG generation and morph behavior from the new-tab entry point.
- [x] Preserve cross-level drag and cascade-icon behavior with focused regression tests.

### 2. Background and shared browser behavior

- [x] Centralize browser scheme, brand, and profile detection.
- [x] Load the shared browser profile before every consumer, including service worker and dynamic overlay injection paths.
- [x] Remove fallback copies of bounded favicon-cache insertion and use one canonical helper.
- [x] Preserve shortcut rules, favicon blacklist behavior, race handling, and bounded-cache contracts.

### 3. Overlay lifecycle

- [x] Introduce a reusable Chrome event-listener registry.
- [x] Replace the manually tracked storage-listener stack with registry-based add/clear lifecycle management.
- [x] Verify teardown, theme, and repeated-mount stability.

### 4. Options, onboarding, and content scripts

- [x] Centralize shortcut parsing and key-event matching, including macOS symbols and key aliases.
- [x] Reuse shared locale normalization and HTML-language mapping.
- [x] Reuse the shared storage-change listener wrapper.
- [x] Preserve manifest and HTML dependency order for every content/onboarding entry point.

### 5. React and generated assets

- [x] Replace duplicate onboarding icon components with one typed shared component.
- [x] Type-check and rebuild generated browser bundles.
- [x] Keep generated artifacts synchronized with their TypeScript sources.

### 6. Architecture and data-safety boundaries

- [x] Add architecture tests that prevent the removed duplicate implementations from returning.
- [x] Freeze the existing sync-storage key contract in a regression test.
- [x] Reject destructive `chrome.storage.sync.clear()` and `chrome.storage.local.clear()` calls in extension source.
- [x] Verify migrations remain copy-only and do not delete the source or destination data.
- [x] Preserve the manifest key, extension permissions, storage permission, and store packaging identity rules.

## User-data Compatibility Contract

The following are release-blocking invariants:

- The ordered set of Chrome Sync keys must remain unchanged unless an explicit, reviewed migration is added.
- Storage migrations may copy missing values but may not clear or remove existing values.
- The refactor may not change the extension manifest key or silently change the store extension identity.
- Development and store builds use different extension IDs. Chrome Sync isolates extension storage by extension ID, so data visible in one installation is not automatically visible in the other. This is an installation-identity boundary, not a migration or deletion performed by this refactor.
- Users must retain the ability to export/import settings when moving between installations with different extension IDs.

## Acceptance Criteria

- [x] Every extracted unit has focused behavior or contract coverage.
- [x] Shared implementations are loaded before their consumers in source, manifest, HTML, and packaging paths.
- [x] Removed implementations are guarded by architecture-boundary tests.
- [x] Performance-sensitive recent-site behavior has randomized equivalence coverage and a repeatable benchmark.
- [x] Storage safety has a hard regression test.
- [x] Full legacy test suite passes.
- [x] React unit tests and TypeScript type-check pass.
- [x] Production build and store-package resource validation pass.
- [x] Performance/stability suite and new-tab data profile pass.
- [x] `git diff --check` reports no whitespace errors.
- [x] Independent final diff review finds no unresolved correctness, lifecycle, load-order, packaging, or data-safety issue.

## Final Review Procedure

1. Run focused architecture and storage-safety gates.
2. Run the new-tab performance profile and record the before/after comparison.
3. Run the repository's complete verification command.
4. Inspect every changed source and generated file by subsystem, including dependency order and CommonJS/browser loading paths.
5. Search for duplicate implementations, destructive storage operations, unbounded listeners/caches, and stale generated output.
6. Fix all findings and repeat complete verification after the review.
7. Mark this plan complete only when all acceptance criteria are satisfied.

## Completion Record

Completed on 2026-08-24 after an implementation pass, a separate full-diff review, review-driven fixes, and a final clean verification run.

- Legacy tests: 151 files passed.
- React tests: 46 files and 252 tests passed.
- JavaScript syntax: 97 files passed.
- TypeScript: no errors.
- Production bundles: both Vite builds passed.
- Store package: 236 entries; the store manifest contains no development key and includes every new shared runtime.
- Locale audit: 717 keys in each of `en`, `ja`, `zh_CN`, and `zh_TW`, with no missing or unreviewed hardcoded strings.
- New-tab profile: recent-site merge p95 0.26 ms for 50,000 history items and 5,000 tabs; lazy bookmark-cache startup p95 3.09 ms for 50,002 nodes.
- Data safety: all 57 active sync keys are frozen, the development extension ID is frozen, destructive area clears are rejected, removals are allowlisted, and migrations remain copy-only.

The independent review found and corrected two remaining gaps: it strengthened the extension-identity/removal safety gate, and removed the last duplicate shortcut parser/matcher from the new-tab runtime.
