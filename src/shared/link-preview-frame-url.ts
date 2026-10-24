// @ts-nocheck
// The address the link preview loads in its frame for a link, where that
// differs from the link itself.
//
// X answers a post's own address (/name/status/id) for a signed-in user from
// its service worker, out of a cached app shell that carries
// X-Frame-Options: DENY. The preview removes that header only from network
// responses, so the post would be refused. /i/web/status/id is not one of the
// routes the service worker takes; X serves it from the network, shows the
// same post and puts the post's own address back in place.
const X_POST_PATTERN = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,20}\/status\/(\d+)(?:[/?#]|$)/i;

function toPreviewFrameUrl(url) {
  const match = X_POST_PATTERN.exec(String(url || ''));
  return match ? `https://x.com/i/web/status/${match[1]}` : url;
}

export { toPreviewFrameUrl };
