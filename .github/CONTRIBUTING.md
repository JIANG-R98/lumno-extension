# Contributing to Lumno

Thanks for helping improve Lumno. Bug reports, ideas, translations and code are
all welcome. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Issues

- Search the [existing issues](https://github.com/kubai087/lumno-extension/issues)
  first; a thumbs-up on an existing one counts too.
- Use the bug report or feature request form. You can write in English, Chinese
  or Japanese.
- Report security problems privately, as [SECURITY.md](SECURITY.md) describes,
  never in a public issue.
- For a large change or a new feature, open an issue to agree on the approach
  before you write the code, so the work is not wasted.

## Setting up

You need Node.js 22 (`nvm use` reads `.nvmrc`) and Chrome or another Chromium
browser.

```bash
npm ci
npm run build
```

Then open `chrome://extensions/`, turn on Developer mode, choose
**Load unpacked** and select the repository root. To try the Firefox build, see
the Development section of the [README](../README.md#development).

`npm run build` writes two folders that are build output and never committed:

- `build/`: esbuild bundles of the scripts in `src/`. While you edit `src/`,
  `npm run watch:bundles` rebuilds them on every change.
- `src/react/`: the React islands, built by Vite from `react-src/`. Run
  `npm run build:react` after editing `react-src/`.

After a rebuild, click Reload on the extensions page, then reload the pages you
are testing.

## Where things live

The [README](../README.md#project-structure) maps the folders, and
[react-src/README.md](../react-src/README.md) explains how the React views and the
browser-facing modules in `src/` split the work. In short: `src/` owns browser
APIs, storage, navigation and ranking; `react-src/` owns what the pages show.

## Making a change

- Keep a pull request to one topic. Unrelated fixes are easier to review in
  pull requests of their own.
- Add or update tests for what the change does. Node tests live in
  `tests/<area>/test-*.js` and drive the real pages, worker and styles; React
  component tests sit next to their components in `react-src/` as `*.test.tsx`.
- Put new or changed UI text in all four locales under `_locales/`
  (`en`, `zh_CN`, `zh_TW`, `ja`). `npm run audit:i18n` lists what is missing.
- Keep the extension local: no code loaded from a CDN, no `eval`, and no new
  network requests unless the user turns the feature on. A change that sends
  data anywhere new also needs the README's Privacy section and the privacy
  policy updated.
- New third-party code, icons or fonts must come under a license that allows
  redistribution. Add them to [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
  and put their license texts next to them.
- The React bundles have size budgets. A change that grows a route by more than
  a few KiB fails CI unless one of its commit messages carries a
  `Bundle-Growth: <why>` trailer; see [react-src/README.md](../react-src/README.md).

## Checks

Before you open a pull request, run:

```bash
npm run verify
```

It builds the extension and runs the Node and React test suites, the static
checks and ESLint, the same as CI. While you work, run only part of it:

```bash
npm run test:legacy -- settings search/  # Node tests whose path contains a filter
npm run test:react                       # React component tests
npm run lint                             # ESLint
```

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
type(scope): subject

What was wrong or missing, and how this change fixes it, wrapped at
72 characters.
```

- **type**: `feat`, `fix`, `perf`, `refactor`, `style`, `test`, `docs`,
  `build`, `ci` or `chore`.
- **scope** (optional): the area the change touches, such as `newtab`,
  `overlay`, `options`, `popup`, `onboarding`, `background`, `search`,
  `settings`, `tests` or `repo`. Leave it out when a change spans many areas.
- **subject**: English, in the imperative, starting with a lowercase letter and
  without a trailing period. The whole first line stays within 72 characters.
- **body**: may be left out for a small, obvious change; otherwise say why the
  change is needed, not only what it does. Wrap it at 72 characters.
- **trailers** go at the end, such as `Bundle-Growth: <why>` for a change that
  is meant to grow a React bundle past its budget.

Keep each commit to one logical change, so it can be reviewed and reverted on
its own.

## Pull requests

Fill in the pull request template: what changed and why, how you tested it, and
before and after screenshots for UI changes. Check the change in Chrome, and in
Firefox too when it touches anything the README's browser compatibility table
lists.

## License

Lumno is licensed under the [GPL-3.0](../LICENSE). By sending a pull request, you
agree that your contribution is licensed under the same terms.
