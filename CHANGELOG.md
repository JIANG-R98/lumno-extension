Tags: Release

## Features

- 新增聚合搜索：可组合 2–10 个内置或自定义搜索源，一次打开全部结果；为聚合搜索设置独立触发词后，可直接从搜索框进入，触发词会与现有搜索源共用重复校验。感谢 @Lysand-Shen 通过 PR #59 贡献核心功能。
- 聚合搜索结果默认自动归入同一标签页组，并以本次查询命名；可在常规设置中关闭。聚合搜索配置与分组偏好也已纳入配置同步。
- 新增毛玻璃、积木和 CRT 壁纸滤镜，支持模糊强度、纹理、积木尺寸、RGB 偏移、光晕和屏幕曲率等独立调节。感谢 @JIANG-R98 通过 PR #58 贡献核心功能。

## Bug Fixes

- 完善聚合搜索的异常反馈：搜索源不可用、重复执行或部分页面打开失败时会给出明确提示，不再静默失败。
- 当搜索框已有搜索标签时，放大镜按钮会自动禁用，避免重复打开搜索范围面板；移除标签后恢复交互。
- 优化新手引导：保留第一页的兼容性提示，并在 New Tab 指引页直接展示相同说明，减少额外点击。
- 改进 New Tab 的图标背景、内容加载和过渡稳定性，减少壁纸切换或窗口尺寸变化时的跳色、闪动和不必要位移。

---

## Features

- Added aggregate search for combining 2–10 built-in or custom search sources and opening all results at once. Each aggregate search can have its own trigger word for direct access from the search box, with the same duplicate validation used by existing search sources. Thanks to @Lysand-Shen for the core contribution in PR #59.
- Aggregate search results are grouped by default and the tab group is named after the current query; this can be disabled in General settings. Aggregate definitions and the grouping preference are also included in settings sync.
- Added Glass Blur, Blocks, and CRT wallpaper effects with independent controls for blur strength, texture, block size, RGB offset, bloom, and screen curvature. Thanks to @JIANG-R98 for the core contribution in PR #58.

## Bug Fixes

- Added clearer aggregate-search feedback when sources are unavailable, a request is already running, or only some result pages can be opened.
- The magnifier button is now disabled while a search tag is active, preventing the scope panel from reopening unnecessarily; interaction returns after the tag is removed.
- Refined onboarding by keeping the compatibility tooltip on the first page while showing the same guidance directly on the New Tab slide.
- Improved New Tab icon backgrounds, content loading, and transition stability to reduce color shifts, flashes, and unnecessary movement during wallpaper or window-size changes.
