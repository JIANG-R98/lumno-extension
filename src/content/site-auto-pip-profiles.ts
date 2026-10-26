// The player profile of each video site auto PiP knows: where its real
// player is, what to leave alone, and how it enters picture-in-picture.

// How auto PiP finds and enters a site's player.
interface SitePlayerProfile {
  test: RegExp;
  // Containers of the real player; matching videos score higher.
  selectors: string[];
  // Previews and feeds that never enter PiP.
  rejectSelectors?: string[];
  // Enter even where the site set disablePictureInPicture.
  allowDisablePiP?: boolean;
  minVisibleArea?: number;
  allowEnterWhenHiddenVideo?: boolean;
  autoResumeOnHiddenEnter?: boolean;
  allowNoUserGesture?: boolean;
  allowEnterWhenNotPlaying?: boolean;
  hiddenRetryLimit?: number;
  hiddenRetryDelayMs?: number;
  // The site's player only enters PiP reliably from the page's own world:
  // the background runs `action` there (after `setupAction`, when set).
  mainWorldEnter?: {
    action: 'siteTryEnterPiPInMainWorld' | 'iqiyiTryEnterPiPInMainWorld';
    setupAction?: 'iqiyiSetupAutoPiPInMainWorld';
    requiresPlaying?: boolean;
  };
  reloadsJingxuanModal?: boolean;
}

const IQIYI_PLAYER_PROFILE: Omit<SitePlayerProfile, 'test'> = {
  selectors: [
    ".iqp-player video",
    ".iqp-player-videolayer video",
    "#flashbox video",
    "#player video"
  ],
  rejectSelectors: [
    ".player_outer_video video",
    "video[outer='1']"
  ],
  allowDisablePiP: true,
  minVisibleArea: 38000,
  allowEnterWhenHiddenVideo: true,
  autoResumeOnHiddenEnter: true,
  allowNoUserGesture: true
};

// Per-site player profiles, keyed by site. The first profile whose test
// matches the host applies. mainWorldEnter marks sites whose player only
// enters PiP reliably from the page's own world: the background runs
// `action` there (after `setupAction`, when set). With requiresPlaying, the
// main-world attempt is skipped unless the video is playing.
const SITE_PROFILES: Readonly<Record<string, SitePlayerProfile>> = {
  douyin: {
    test: /(^|\.)douyin\.com$/,
    selectors: [
      ".xgplayer video",
      ".xgplayer-video-wrap video",
      ".xg-video-container video",
      "[class*='videoPlayer'] video",
      "[class*='Player'] video",
      "video"
    ],
    rejectSelectors: [
      ".discover-video-card-item video",
      ".waterfall-videoCardContainer video",
      ".jingxuanVideoCard video"
    ],
    allowDisablePiP: true,
    minVisibleArea: 24000,
    allowEnterWhenHiddenVideo: true,
    autoResumeOnHiddenEnter: true,
    allowNoUserGesture: true,
    allowEnterWhenNotPlaying: true,
    hiddenRetryLimit: 24,
    hiddenRetryDelayMs: 180,
    mainWorldEnter: {
      action: "siteTryEnterPiPInMainWorld",
      requiresPlaying: true
    },
    // The Jingxuan feed's video modal can lose its player while in PiP;
    // reloading the modal URL is the only reliable way back.
    reloadsJingxuanModal: true
  },
  bilibili: {
    test: /(^|\.)bilibili\.com$/,
    selectors: [
      ".bpx-player-video-wrap video",
      ".bilibili-player-video-wrap video",
      ".bilibili-player-video video",
      "#bilibili-player video",
      "#player video"
    ]
  },
  bilibiliTv: {
    test: /(^|\.)bilibili\.tv$/,
    selectors: [
      ".bpx-player-video-wrap video",
      ".bilibili-player-video-wrap video",
      ".bilibili-player-video video",
      "#bilibili-player video",
      "#player video"
    ]
  },
  youku: {
    test: /(^|\.)youku\.com$/,
    selectors: [
      ".html5player-video video",
      ".youku-player video",
      "#player video",
      "#ykPlayer video"
    ]
  },
  tencentVideo: {
    test: /(^|\.)v\.qq\.com$/,
    selectors: [
      ".txp_video_container video",
      ".txp-player video",
      ".txp_videos_container video",
      ".txp_video video",
      ".mod_player video",
      "#mod_player video",
      "#player video",
      "video"
    ],
    rejectSelectors: [
      "[class*='preview'] video",
      "[class*='recommend'] video"
    ],
    allowDisablePiP: true,
    allowEnterWhenHiddenVideo: true,
    autoResumeOnHiddenEnter: true,
    allowNoUserGesture: true,
    allowEnterWhenNotPlaying: true,
    minVisibleArea: 30000,
    hiddenRetryLimit: 16,
    hiddenRetryDelayMs: 180
  },
  iqiyi: {
    test: /(^|\.)iqiyi\.com$/,
    mainWorldEnter: {
      action: "iqiyiTryEnterPiPInMainWorld",
      setupAction: "iqiyiSetupAutoPiPInMainWorld"
    },
    ...IQIYI_PLAYER_PROFILE
  },
  // iQIYI's international site shares the player but not the main-world setup.
  iqiyiInternational: {
    test: /(^|\.)iq\.com$/,
    ...IQIYI_PLAYER_PROFILE
  },
  kuaishou: {
    test: /(^|\.)(kuaishou\.com|kwai\.com)$/,
    selectors: [
      ".ks-player video",
      ".video-player video",
      "[class*='player'] video",
      "video"
    ],
    rejectSelectors: [
      ".video-card video",
      ".sidebar video",
      "[class*='preview'] video"
    ],
    minVisibleArea: 36000
  },
  netflix: {
    test: /(^|\.)netflix\.com$/,
    selectors: [
      ".watch-video video",
      "[data-uia='video-canvas'] video",
      ".NFPlayer video",
      "video"
    ],
    rejectSelectors: [
      ".previewModal video",
      "[class*='preview'] video",
      "[class*='billboard'] video"
    ],
    minVisibleArea: 56000
  },
  vimeo: {
    test: /(^|\.)vimeo\.com$/,
    selectors: [
      ".vp-video video",
      ".player video",
      ".js-player video",
      "video"
    ],
    rejectSelectors: [
      ".vp-preview video",
      "[class*='thumbnail'] video"
    ]
  },
  dailymotion: {
    test: /(^|\.)dailymotion\.com$/,
    selectors: [
      ".dmp_Player video",
      ".dmp_VideoContainer video",
      "#player video",
      "video"
    ],
    rejectSelectors: [
      ".sd_video_list video",
      "[class*='preview'] video"
    ]
  },
  primeVideo: {
    test: /(^|\.)(primevideo\.com|amazon\.(com|co\.uk|de|co\.jp|in))$/,
    selectors: [
      ".webPlayerSDKContainer video",
      ".atvwebplayersdk-video video",
      "#dv-web-player video",
      "video"
    ],
    rejectSelectors: [
      "[class*='trailer'] video",
      "[class*='preview'] video"
    ],
    minVisibleArea: 56000
  },
  disneyPlus: {
    test: /(^|\.)(disneyplus\.com|hotstar\.com)$/,
    selectors: [
      ".btm-media-client-element video",
      ".video-container video",
      "[data-testid='videoPlayer'] video",
      "video"
    ],
    rejectSelectors: [
      "[class*='preview'] video",
      "[class*='trailer'] video"
    ],
    minVisibleArea: 56000
  },
  max: {
    test: /(^|\.)(max\.com|hbomax\.com)$/,
    selectors: [
      ".video-player video",
      ".player-container video",
      "[data-testid='video-player'] video",
      "video"
    ],
    rejectSelectors: [
      "[class*='preview'] video",
      "[class*='sizzle'] video"
    ],
    minVisibleArea: 56000
  },
  tiktok: {
    test: /(^|\.)tiktok\.com$/,
    selectors: [
      "[data-e2e='video-player'] video",
      ".tiktok-player video",
      "[class*='DivVideoContainer'] video",
      "video"
    ],
    rejectSelectors: [
      "[class*='recommend'] video",
      "[class*='preview'] video"
    ],
    allowEnterWhenHiddenVideo: true,
    autoResumeOnHiddenEnter: true,
    allowNoUserGesture: true,
    minVisibleArea: 26000
  },
  tubi: {
    test: /(^|\.)tubitv\.com$/,
    selectors: [
      ".video-js video",
      ".vjs-tech",
      "#video_player video",
      "video"
    ],
    rejectSelectors: [
      ".poster video",
      "[class*='preview'] video"
    ]
  },
  pluto: {
    test: /(^|\.)pluto\.tv$/,
    selectors: [
      ".video-js video",
      ".vjs-tech",
      ".player video",
      "video"
    ],
    rejectSelectors: [
      "[class*='grid'] video",
      "[class*='preview'] video"
    ]
  },
  twitch: {
    test: /(^|\.)twitch\.tv$/,
    selectors: [
      ".video-player video",
      ".persistent-player video",
      "[data-a-target='player-overlay-click-handler'] video",
      "video"
    ],
    rejectSelectors: [
      ".channel-root__player-container--theatre + * video",
      "[class*='preview'] video"
    ],
    minVisibleArea: 42000
  }
};

function getMatchedProfile(host: string): SitePlayerProfile | null {
  return Object.values(SITE_PROFILES).find((profile) => profile.test.test(host)) || null;
}

export { getMatchedProfile };
export type { SitePlayerProfile };
