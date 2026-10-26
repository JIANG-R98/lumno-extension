'use strict';

// Storage for a New Tab where the feature hints and the update notice have
// been seen, so the engagement prompt is the notice left to show.

const engagementNotice = require('../../src/shared/engagement-notice.ts');
const featureHints = require('../../src/shared/ui/feature-hints.ts');
const settings = require('../../src/domain/settings/index.ts');
const { engagementNoticeState } = require('../../src/domain/settings/features.ts');

function dismissedFeatureHints() {
  const areas = { sync: {}, local: {}, session: {} };
  Object.values(featureHints.FEATURE_HINTS).forEach((hint) => {
    const area = featureHints.normalizeDismissStorage(hint.dismissStorage);
    const key = {
      sync: featureHints.getFeatureHintSyncDismissKey,
      local: featureHints.getFeatureHintLocalDismissKey,
      session: featureHints.getFeatureHintSessionDismissKey
    }[area](hint);
    areas[area][key] = true;
  });
  return areas;
}

// An engagement state that qualifies on `surface` (newtab: five meaningful
// searches over four days in a week; pass `meaningfulUses` to fall short).
function engagementState(surface, overrides) {
  const now = Date.now();
  const day = (offset) => new Date(now - offset * engagementNotice.DAY_MS).toISOString().slice(0, 10);
  const state = engagementNotice.normalizeEngagementState(null);
  state[surface] = Object.assign({
    activeDays: [day(7), day(5), day(3), day(1)],
    firstSeenAt: now - 8 * engagementNotice.DAY_MS,
    meaningfulUses: surface === 'newtab' ? 5 : 0,
    opens: surface === 'newtab' ? 8 : 10
  }, overrides || {});
  return state;
}

// createNewtabPage storage options for that page.
function engagementStorage(options) {
  const config = options || {};
  const hints = dismissedFeatureHints();
  return {
    sync: Object.assign({
      [settings.language.key]: config.language || 'en',
      [settings.updateNoticeEnabled.key]: config.updateNotice === true
    }, hints.sync, config.sync || {}),
    local: Object.assign({
      [engagementNoticeState.key]: engagementState('newtab', config.newtab)
    }, hints.local, config.local || {}),
    session: hints.session
  };
}

// The New Tab waits this long before exposing the prompt.
const ENGAGEMENT_DELAY_MS = 1800;

module.exports = { ENGAGEMENT_DELAY_MS, dismissedFeatureHints, engagementState, engagementStorage };
