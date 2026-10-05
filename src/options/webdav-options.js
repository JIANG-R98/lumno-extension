(function(root) {
  'use strict';
  const EXPECTED_CLIENT_REVISION = 'dav-lock-4';
  const EXPECTED_SYNC_REVISION = 'dav-multi-1';
  function createCopy(t) {
    return {
      confirm_ok: t("confirm_ok", "确认"),
      confirm_cancel: t("confirm_cancel", "取消"),
      webdav_endpoint: t("webdav_endpoint", "服务器地址（HTTPS）"),
      webdav_directory: t("webdav_directory", "同步目录"),
      webdav_username: t("webdav_username", "用户名"),
      webdav_password: t("webdav_password", "应用密码"),
      webdav_credentials_hint: t("webdav_credentials_hint", "连接信息仅保存在本机，其他设备需要分别添加。"),
      webdav_password_saved: t("webdav_password_saved", "已保存；留空保持不变"),
      webdav_last_sync: t("webdav_last_sync", "最近同步"),
      webdav_choice_hint: t("webdav_choice_hint", "远端已有配置，请选择保留本机版本或使用远端版本。替换前会保留本机备份，Chrome 同步继续运行。"),
      webdav_conflict_hint: t("webdav_conflict_hint", "两端修改了相同内容，WebDAV 正等待处理。请选择冲突内容采用的版本，其他改动仍会合并；替换前会保留备份。Chrome 同步继续运行。"),
      webdav_test: t("webdav_test", "测试连接"),
      webdav_sync: t("webdav_sync", "立即同步"),
      webdav_restore_backup: t("webdav_restore_backup", "恢复替换前的本机配置"),
      webdav_use_remote: t("webdav_use_remote", "使用远端版本"),
      webdav_use_local: t("webdav_use_local", "保留本机版本"),
      webdav_test_success: t("webdav_test_success", "连接、读写和并发保护验证通过"),
      webdav_state_browser: t("webdav_state_browser", "未开启"),
      webdav_state_ready: t("webdav_state_ready", "已同步"),
      webdav_state_syncing: t("webdav_state_syncing", "正在同步…"),
      webdav_state_paused: t("webdav_state_paused", "已暂停"),
      webdav_state_pending: t("webdav_state_pending", "等待同步"),
      webdav_state_choice: t("webdav_state_choice", "需要选择"),
      webdav_state_conflict: t("webdav_state_conflict", "配置冲突"),
      webdav_state_error: t("webdav_state_error", "同步失败"),
      webdav_missing_hint: t("webdav_missing_hint", "远端配置已不存在。上传本机配置可重新建立同步；也可以先检查服务器地址。"),
      webdav_error_outdated: t("webdav_error_outdated", "请重新加载 Lumno 扩展，再刷新设置页以使用多连接同步。"),
      webdav_title: t("webdav_title", "WebDAV 同步"),
      webdav_beta_hint: t("webdav_beta_hint", "通过 WebDAV 服务器同步配置、自定义图标和壁纸，与浏览器内置同步同时运行。可添加多个连接，分别开启同步。\n\n目前为 Beta 版本，可能出现同步失败或配置异常。欢迎反馈问题，帮助我们改进。"),
      webdav_edit_config: t("webdav_edit_config", "编辑连接配置"),
      webdav_save: t("webdav_save", "保存"),
      webdav_enable: t("webdav_enable", "保存并开启同步"),
      webdav_never_synced: t("webdav_never_synced", "尚未同步"),
      webdav_state_testing: t("webdav_state_testing", "正在测试连接"),
      webdav_state_recovery: t("webdav_state_recovery", "需要恢复"),
      webdav_connecting: t("webdav_connecting", "正在连接…"),
      webdav_retry: t("webdav_retry", "重试"),
      webdav_copy_diagnostic: t("webdav_copy_diagnostic", "复制诊断信息"),
      webdav_diagnostic_copied: t("webdav_diagnostic_copied", "已复制"),
      webdav_upload_local: t("webdav_upload_local", "上传本机配置"),
      webdav_provider: t("webdav_provider", "服务商"),
      webdav_provider_jianguoyun: t("webdav_provider_jianguoyun", "坚果云"),
      webdav_provider_nextcloud: t("webdav_provider_nextcloud", "Nextcloud"),
      webdav_provider_other: t("webdav_provider_other", "其他"),
      webdav_password_help: t("webdav_password_help", "如何获取应用密码"),
      webdav_choice_title: t("webdav_choice_title", "选择初始同步版本"),
      webdav_conflict_title: t("webdav_conflict_title", "同步内容存在冲突"),
      webdav_conflict_items: t("webdav_conflict_items", "有冲突的内容"),
      webdav_conflict_shortcuts: t("webdav_conflict_shortcuts", "快捷方式及图标"),
      webdav_conflict_wallpapers: t("webdav_conflict_wallpapers", "壁纸及选图"),
      webdav_conflict_preferences: t("webdav_conflict_preferences", "设置项"),
      webdav_resolve_later: t("webdav_resolve_later", "稍后处理并暂停"),
      webdav_add: t("webdav_add", "添加 WebDAV"),
      webdav_remove: t("webdav_remove", "删除 WebDAV 配置"),
      webdav_remove_confirm: t("webdav_remove_confirm", "删除这条本机连接配置？服务器上的文件会保留。")
    };
  }
  function createController(options) {
    const chromeApi = options.chromeApi;
    const t = options.getMessage;
    const panel = document.getElementById('lumno-webdav-settings');
    const api = root.LumnoOptionsWebDavList;
    if (!panel || !api) return null;
    let current = { connections: [] };
    let initialized = false;
    let refreshSequence = 0;
    const infoController = root.LumnoOptionsInfoButton?.createInfoButtonController(document.getElementById('lumno-webdav-beta-info'));
    const requiresReload = () => initialized && (current.clientRevision !== EXPECTED_CLIENT_REVISION || current.syncRevision !== EXPECTED_SYNC_REVISION);
    const message = (operation, extra) => new Promise((resolve, reject) => {
      chromeApi.runtime.sendMessage({ action: 'webdav', operation, ...extra }, (response) => {
        const error = chromeApi.runtime.lastError;
        if (error || !response || response.ok === false) reject(Object.assign(new Error(response && response.error || 'sync-failed'), {
          diagnostic: response && response.diagnostic
        }));
        else resolve(response);
      });
    });
    function errorText(code) {
      const categories = {
        'invalid-endpoint': 'endpoint', 'invalid-directory': 'directory', 'missing-credentials': 'credentials',
        'http-401': 'auth', 'http-403': 'permission', 'http-429': 'rate', 'http-507': 'capacity',
        'conditional-write-unsupported': 'conditional', 'remote-changed': 'changed', 'local-changed': 'changed',
        'remote-locked': 'locked', 'lock-write-uncertain': 'lock_recovery', 'lock-release-failed': 'lock_recovery',
        'remote-missing': 'missing', 'chrome-capacity': 'chrome_capacity', 'timeout': 'network', 'network-error': 'network',
        'invalid-state': 'invalid', 'state-too-large': 'invalid', 'invalid-shortcuts': 'invalid', 'invalid-wallpaper': 'invalid',
        'invalid-asset': 'asset', 'asset-missing': 'asset', 'asset-integrity': 'asset', 'asset-too-large': 'asset',
        'response-too-large': 'invalid', 'private-storage-unavailable': 'storage', 'local-storage-failed': 'storage',
        'shortcut-capacity': 'shortcuts', 'interrupted-apply': 'interrupted', 'duplicate-connection': 'duplicate'
      };
      return t(`webdav_error_${categories[code] || 'generic'}`, t('webdav_error_generic', '同步失败，请稍后重试。'));
    }
    // Diagnostics stay out of the sentence users read; the card offers them
    // through a copy action for bug reports.
    function diagnosticText(diagnostic) {
      if (!diagnostic || diagnostic.revision !== EXPECTED_CLIENT_REVISION ||
          !['state-etag', 'state-lock-create', 'directory-race', 'directory-delete', 'directory-recreate',
            'move-race', 'move-owner', 'move-delete', 'move-recreate', 'move-claim'].includes(diagnostic.phase)) return '';
      const statuses = (Array.isArray(diagnostic.statuses) ? diagnostic.statuses : []).filter((status) => Number.isInteger(status) && status >= 0 && status <= 599).slice(0, 2);
      return `${diagnostic.revision} / ${diagnostic.phase} / ${statuses.join(',')}`;
    }
    function failure(error) {
      return Object.assign(new Error(errorText(error.message)), { diagnostic: diagnosticText(error.diagnostic) });
    }
    function connectionName(item) {
      try { return new URL(item.config.endpoint).host; } catch (_error) { return item.config.endpoint; }
    }
    const listController = api.createWebDavListController(document.getElementById('lumno-webdav-list'), {
      async onAction(operation, id, extra) {
        if (requiresReload() && !['pause'].includes(operation)) throw new Error(createCopy(t).webdav_error_outdated);
        try {
          const result = await message(operation, { ...(id ? { id } : {}), ...extra });
          await refresh();
          return result;
        } catch (error) {
          await refresh().catch(() => {});
          throw failure(error);
        }
      }
    });
    function render() {
      infoController?.render({ tooltip: createCopy(t).webdav_beta_hint, tooltipKey: 'webdav_beta_hint' });
      const copy = createCopy(t);
      const connections = (current.connections || (current.config ? [{ id: 'default', ...current }] : []))
        .map((item) => ({ ...item, needsRecovery: Boolean(item.needsRecovery || (item.error === 'interrupted-apply' && !item.enabled)) }));
      const blocking = connections.find((item) => item.needsRecovery);
      const describeError = (item) => {
        // The choice panel already explains a missing remote copy.
        if (!item.error || item.error === 'remote-missing') return '';
        if (item.error === 'interrupted-apply' && !item.needsRecovery && blocking) {
          return t('webdav_error_interrupted_other', '另一条 WebDAV 连接（{name}）需要先恢复本机配置，恢复后这里会继续同步。').replace('{name}', connectionName(blocking));
        }
        return errorText(item.error);
      };
      listController.render({
        ready: initialized, outdated: requiresReload(), copy, lang: document.documentElement.lang || '',
        connections: connections.map((item) => ({ ...item, errorText: describeError(item), remoteMissing: item.error === 'remote-missing',
          diagnosticText: item.error ? diagnosticText(item.diagnostic) : '',
          conflictsText: [...new Set((item.conflicts || []).map((key) => copy[
            key === 'shortcuts' ? 'webdav_conflict_shortcuts' : key === 'wallpapers' ? 'webdav_conflict_wallpapers' : 'webdav_conflict_preferences'
          ]))].join(/^(zh|ja)/.test(document.documentElement.lang) ? '、' : ', ') }))
      });
      document.getElementById('lumno-webdav-setup-hint').hidden = connections.length > 0;
      const version = document.getElementById('lumno-webdav-version');
      version.hidden = !requiresReload();
      version.dataset.error = 'true';
      version.textContent = requiresReload() ? copy.webdav_error_outdated : '';
    }
    async function refresh() {
      const sequence = ++refreshSequence;
      const result = await message('status');
      if (sequence !== refreshSequence) return;
      current = result;
      initialized = true;
      render();
    }
    chromeApi.storage.onChanged.addListener((changes, area) => {
      const key = root.LumnoSettings.WEBDAV_STATUS_STORAGE_KEY;
      if (area === 'local' && Object.keys(changes).some((name) => name === key || name.startsWith(`${key}:`))) refresh().catch(() => {});
    });
    render();
    refresh().catch((error) => {
      const version = document.getElementById('lumno-webdav-version');
      version.hidden = false;
      version.dataset.error = 'true';
      version.textContent = failure(error).message;
    });
    return { render, refresh };
  }
  root.LumnoWebDavOptions = Object.freeze({ createController });
})(globalThis);
