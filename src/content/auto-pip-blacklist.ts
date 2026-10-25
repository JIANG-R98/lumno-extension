// The sites where automatic picture-in-picture stays off (shopping and
// social feeds play muted previews there), for site-auto-pip.ts.
(function () {
  if (window.__lumnoAutoPipBlacklist2026) {
    return;
  }

  const hostRules = [
    /(^|\.)jd\.com$/,
    /(^|\.)360buy\.com$/,
    /(^|\.)taobao\.com$/,
    /(^|\.)x\.com$/,
    /(^|\.)twitter\.com$/,
    /(^|\.)weibo\.com$/,
    /(^|\.)weibo\.cn$/
  ];

  window.__lumnoAutoPipBlacklist2026 = {
    hostRules: hostRules
  };
})();
