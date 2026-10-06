# Website release deployment

The website reads this repository's public Releases during its static build.
`Update Website Release` dispatches `lumno-web`'s `deploy-pages.yml` workflow
when a release is published, edited, or deleted. It can also be run manually
to recover a missed update. A successful dispatch means the build was requested;
check the website workflow for deployment completion.

## One-time credential setup

Create a fine-grained GitHub personal access token with resource owner
`kubai087`, access to **only `lumno-web`**, and repository permission
**Actions: Read and write**. Save it as the `LUMNO_WEB_ACTIONS_TOKEN` Actions
secret in **`lumno-extension`**. Set an expiration and rotate the secret before
it expires. Do not reuse a local CLI login token or commit credentials.

The default `GITHUB_TOKEN` cannot dispatch workflows in another repository.
Missing or expired credentials make the dispatch workflow fail visibly.

The website also rebuilds on pushes to `main`, manual dispatch, and a
best-effort schedule at minutes 7, 17, 27, 37, 47, and 57 of each hour.
GitHub may delay or drop scheduled jobs; the schedule is a fallback, not a
guarantee of a ten-minute update time. Release dispatch avoids waiting for that
schedule, though GitHub's runner and deployment queues can still delay builds.

- [Extension dispatch runs](https://github.com/kubai087/lumno-extension/actions/workflows/update-website-release.yml)
- [Website deployment runs](https://github.com/kubai087/lumno-web/actions/workflows/deploy-pages.yml)
