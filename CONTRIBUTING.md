# Contributing to Lumno

Lumno is developed through issues and pull requests. This fork also uses
`feat/dynamic-collections` as the shared integration branch for the linked-page
workstream.

## Branch roles

- `main` is the stable branch and should stay suitable for release or upstream sync.
- `feat/dynamic-collections` integrates the linked-page work before it is ready for `main`.
- Contributors work on short-lived branches named
  `collab/<github-handle>/<short-topic>`, created from the intended target branch.

Examples: `collab/alice/popup-empty-state` and `collab/bob/tracking-recovery`.

Do not commit directly to `main` or `feat/dynamic-collections`. Do not rebase or
force-push either shared branch after publication.

The repository owner has a PR-only break-glass bypass for service recovery. It is
not part of the normal workflow: the PR must explain why bypass was necessary,
retain any available CI evidence, and receive a follow-up review. The bypass never
permits a direct push to a shared branch.

## Workflow

1. Fetch the latest repository state.
2. Switch to the intended target branch and update it with `--ff-only`.
3. Create a personal task branch.
4. Keep each pull request focused on one user-visible outcome.
5. Push the task branch and open a pull request into the branch it came from.
6. Resolve review conversations and wait for the required `test` check.
7. Merge with **Squash and merge**, then delete the task branch.

```bash
git fetch origin
git switch feat/dynamic-collections
git pull --ff-only origin feat/dynamic-collections
git switch -c collab/<github-handle>/<short-topic>
git push -u origin HEAD
```

Use the pull request body to record the visible change, focused validation,
generated React bundles, and screenshots for UI changes. One approving review is
required. The author must not approve their own pull request.

## Validation

Run tests proportional to the change while iterating. Before requesting final
review, ensure the checks relevant to the changed area pass. CI runs the repository
verification suite with:

```bash
npm ci
npm run verify
```

After editing `react-src/`, run `npm run build:react` and commit the corresponding
generated files under `src/react/`.

## Keeping the fork current

The original project is configured locally as `upstream`. Bring upstream changes
into a shared branch with a normal merge or pull request. Never rewrite a shared
branch to match upstream.

```bash
git fetch upstream
git switch feat/dynamic-collections
git switch -c collab/<github-handle>/sync-upstream
git merge upstream/main
git push -u origin HEAD
```

Open that branch as a pull request into `feat/dynamic-collections`. When the
workstream is ready, open a separate pull request from `feat/dynamic-collections`
to the appropriate stable or upstream branch.

## 中文协作摘要

- `main` 是稳定分支，`feat/dynamic-collections` 是当前功能集成分支。
- 每位开发者从目标分支创建 `collab/<GitHub 用户名>/<简短主题>` 分支。
- 禁止直接推送、强推或变基共享分支；所有修改通过 PR 合入。
- PR 需要 1 位非作者维护者批准、解决全部讨论并通过 `test` 检查。
- 仓库所有者仅在故障恢复时可通过 PR 紧急绕过，并须在 PR 中说明原因、保留可用的 CI 证据和补充评审；该权限不允许直接推送。
- 使用 Squash merge，合并后删除个人任务分支。
- 修改 `react-src/` 后必须重新构建并提交 `src/react/` 生成产物。
