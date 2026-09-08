const assert = require('assert');
const surface = require('../src/shared/aggregate-search-surface.js');

function createChromeRuntime(options = {}) {
  const messages = [];
  const callbacks = [];
  const runtime = {
    lastError: null,
    sendMessage(message, callback) {
      if (options.throwOnSend) {
        throw new Error('send failed');
      }
      messages.push(message);
      callbacks.push(callback);
    }
  };
  return { callbacks, chromeApi: { runtime }, messages, runtime };
}

const feedback = [];
const successes = [];
const runtime = createChromeRuntime();
const controller = surface.createAggregateSearchRequestController({
  chromeApi: runtime.chromeApi,
  onFeedback(descriptor, response, runtimeError) {
    feedback.push({ descriptor, response, runtimeError });
  }
});
const request = {
  aggregateId: 'research',
  disposition: 'newTab',
  query: 'Lumno 聚合'
};

const first = controller.run(request, {
  onSuccess(response) {
    successes.push(response);
  }
});
const duplicate = controller.run(request);
assert.strictEqual(first.started, true);
assert.strictEqual(duplicate.duplicate, true);
assert.strictEqual(runtime.messages.length, 1, 'a rapid duplicate must not send twice');
assert.deepStrictEqual(runtime.messages[0], {
  action: 'runAggregateSearchQuery',
  aggregateId: 'research',
  disposition: 'newTab',
  query: 'Lumno 聚合'
});
assert.strictEqual(feedback[0].descriptor.messageKey, 'aggregate_search_in_progress');
assert.strictEqual(feedback[0].descriptor.isError, false);

runtime.callbacks[0]({ ok: true, openedCount: 2, warnings: [] });
assert.strictEqual(successes.length, 1);
assert.strictEqual(feedback.length, 1);

controller.run(request, {
  onSuccess(response) {
    successes.push(response);
  }
});
assert.strictEqual(runtime.messages.length, 2, 'completion must release the pending key');
runtime.callbacks[1]({
  failedCount: 1,
  ok: true,
  warnings: ['partial-tab-create-failure']
});
assert.strictEqual(successes.length, 2, 'partial success still reaches the success hook');
assert.strictEqual(feedback[1].descriptor.messageKey, 'aggregate_search_partial_failure');
assert.strictEqual(feedback[1].descriptor.isError, true);
assert.strictEqual(
  surface.hasPartialFailure({ ok: true, failedCount: 0, warnings: ['group denied'] }),
  false,
  'grouping, naming, and activation warnings are not failed search results'
);
assert.strictEqual(
  surface.hasAncillaryWarning({ ok: true, failedCount: 0, warnings: ['group denied'] }),
  true
);
assert.deepStrictEqual(
  surface.getResponseDescriptor({ ok: true, failedCount: 0, warnings: ['group denied'] }),
  {
    fallback: 'Search results opened, but tab grouping, naming, or focus could not be completed.',
    isError: false,
    messageKey: 'aggregate_search_degraded_success'
  },
  'ancillary browser failures must not claim that search results failed to open'
);
assert.strictEqual(
  surface.getSuccessFeedbackDelayMs({
    activationDeferred: false,
    activationDelayMs: 0,
    ok: true,
    warnings: ['activation denied']
  }),
  surface.PARTIAL_FEEDBACK_DELAY_MS,
  'an ancillary warning without deferred activation must remain visible for the toast duration'
);
assert.strictEqual(
  surface.getSuccessFeedbackDelayMs({
    activationDeferred: true,
    activationDelayMs: 900,
    ok: true,
    warnings: ['partial-tab-create-failure']
  }),
  900,
  'the background-provided activation delay must remain authoritative'
);
assert.strictEqual(
  surface.getSuccessFeedbackDelayMs({ ok: true, warnings: [] }),
  0,
  'a clean success must preserve immediate overlay completion'
);

controller.run({ ...request, query: 'runtime failure' });
runtime.runtime.lastError = { message: 'worker stopped' };
runtime.callbacks[2](undefined);
runtime.runtime.lastError = null;
assert.strictEqual(feedback[2].descriptor.messageKey, 'toast_error');
assert.strictEqual(feedback[2].runtimeError.message, 'worker stopped');

const throwingFeedback = [];
const throwingController = surface.createAggregateSearchRequestController({
  chromeApi: createChromeRuntime({ throwOnSend: true }).chromeApi,
  onFeedback(descriptor) {
    throwingFeedback.push(descriptor);
  }
});
const thrown = throwingController.run(request);
assert.strictEqual(thrown.started, false);
assert.strictEqual(throwingFeedback[0].messageKey, 'toast_error');

assert.deepStrictEqual(
  surface.getResponseDescriptor({ reason: 'aggregate-search-not-found' }),
  {
    fallback: 'This aggregate search contains removed or disabled sources. Update it in Settings.',
    isError: true,
    messageKey: 'aggregate_search_sources_unavailable_error'
  }
);

console.log('aggregate search surface tests passed');
