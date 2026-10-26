// The sites where automatic picture-in-picture stays off (shopping and
// social feeds play muted previews there), for site-auto-pip.ts.
const AUTO_PIP_BLACKLIST_HOST_RULES: readonly RegExp[] = Object.freeze([
  /(^|\.)jd\.com$/,
  /(^|\.)360buy\.com$/,
  /(^|\.)taobao\.com$/,
  /(^|\.)x\.com$/,
  /(^|\.)twitter\.com$/,
  /(^|\.)weibo\.com$/,
  /(^|\.)weibo\.cn$/
]);

function isAutoPipBlacklistedHost(host: string): boolean {
  return AUTO_PIP_BLACKLIST_HOST_RULES.some((rule) => rule.test(host));
}

export { AUTO_PIP_BLACKLIST_HOST_RULES, isAutoPipBlacklistedHost };
