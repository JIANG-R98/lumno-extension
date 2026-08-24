(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LumnoCodexDebugSurface = api;
    api.start({
      windowObj: typeof window !== 'undefined' ? window : null,
      documentObj: typeof document !== 'undefined' ? document : null,
      chromeApi: typeof chrome !== 'undefined' ? chrome : null
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const CHANNEL = 'lumno.codex.debug';
  const VERSION = 1;
  const SURFACE_PORT_NAME = 'lumno-codex-debug-surface-v1';
  const MAX_QUERY_RESULTS = 50;
  const MAX_LOG_ENTRIES = 200;
  const MAX_PERFORMANCE_ENTRIES = 200;
  const STARTUP_SAMPLE_STORAGE_KEY = 'lumno.codex.newtab.startup-samples.v1';
  const MAX_STARTUP_SAMPLES = 12;
  const OFFICIAL_CODEX_EXTENSION_IDS = Object.freeze([
    'hehggadaopoacecdllhhajmbjkdcmajg',
    'lfkehkpjohcoelkpembgemeipeppanef'
  ]);

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
  }

  function truncate(value, maximum) {
    const stringValue = String(value == null ? '' : value);
    if (stringValue.length <= maximum) {
      return stringValue;
    }
    return `${stringValue.slice(0, Math.max(0, maximum - 1))}…`;
  }

  function roundMetric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
  }

  function getPerformanceNow(windowObj) {
    const performanceObj = windowObj && windowObj.performance;
    return performanceObj && typeof performanceObj.now === 'function'
      ? performanceObj.now()
      : Date.now();
  }

  function getPerformanceEntries(performanceObj, type) {
    if (!performanceObj || typeof performanceObj.getEntriesByType !== 'function') {
      return [];
    }
    try {
      return Array.from(performanceObj.getEntriesByType(type) || []);
    } catch (error) {
      return [];
    }
  }

  function sanitizePerformanceResourceName(value) {
    const rawValue = String(value || '');
    if (!rawValue) {
      return '';
    }
    if (/^(?:data:|blob:)/i.test(rawValue)) {
      return '[omitted-url]';
    }
    try {
      const url = new URL(rawValue);
      return `${url.protocol}//${url.host}${url.pathname}`;
    } catch (error) {
      return truncate(rawValue.split(/[?#]/)[0], 1000);
    }
  }

  function describePerformanceTargetElement(element) {
    if (!element || typeof element !== 'object') {
      return null;
    }
    const getAttribute = (name) => {
      if (typeof element.getAttribute !== 'function') {
        return '';
      }
      try {
        return truncate(element.getAttribute(name) || '', 120);
      } catch (error) {
        return '';
      }
    };
    const classes = (() => {
      try {
        return Array.from(element.classList || String(element.className || '').split(/\s+/))
          .map((value) => truncate(value, 80))
          .filter(Boolean)
          .slice(0, 6);
      } catch (error) {
        return [];
      }
    })();
    const attributes = {};
    [
      'data-action',
      'data-bookmark-id',
      'data-mode',
      'data-role',
      'data-shortcut-id',
      'type'
    ].forEach((name) => {
      const value = getAttribute(name);
      if (value) {
        attributes[name] = value;
      }
    });
    const descriptor = {
      tag: truncate(element.localName || element.tagName || '', 40).toLowerCase(),
      id: getAttribute('id'),
      classes,
      role: getAttribute('role'),
      attributes,
      cursorTooltipBound: getAttribute('data-cursor-tooltip-bound') === 'true'
    };
    return descriptor.tag || descriptor.id || classes.length > 0 ||
      Object.keys(attributes).length > 0
      ? descriptor
      : null;
  }

  function hasPerformanceContextMarker(descriptor) {
    if (!descriptor) {
      return false;
    }
    return Boolean(
      descriptor.id ||
      descriptor.role ||
      descriptor.cursorTooltipBound ||
      Object.keys(descriptor.attributes || {}).length > 0 ||
      (descriptor.classes || []).some((className) =>
        /(?:shortcut|bookmark|wallpaper|search|suggestion|toolbar|recent)/i.test(className)
      )
    );
  }

  function sanitizePerformanceEventTarget(target) {
    let element = target && target.nodeType === 1
      ? target
      : (target && target.parentElement) || null;
    if (!element) {
      return null;
    }
    const targetDescriptor = describePerformanceTargetElement(element);
    let contextDescriptor = hasPerformanceContextMarker(targetDescriptor)
      ? targetDescriptor
      : null;
    let depth = 0;
    while (!contextDescriptor && element && depth < 6) {
      element = element.parentElement || null;
      const descriptor = describePerformanceTargetElement(element);
      if (hasPerformanceContextMarker(descriptor)) {
        contextDescriptor = descriptor;
      }
      depth += 1;
    }
    if (!targetDescriptor && !contextDescriptor) {
      return null;
    }
    return {
      element: targetDescriptor,
      context: contextDescriptor && contextDescriptor !== targetDescriptor
        ? contextDescriptor
        : null
    };
  }

  function createStartupProfiler(windowObj, surfaceType) {
    const performanceObj = windowObj && windowObj.performance;
    if (surfaceType !== 'newtab' || !performanceObj ||
        typeof performanceObj.mark !== 'function' ||
        typeof performanceObj.measure !== 'function') {
      return null;
    }
    let previousMilestone = null;
    const taskCounts = new Map();

    function normalizeLabel(value) {
      return String(value || 'unknown')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'unknown';
    }

    function safeMark(name) {
      try {
        performanceObj.mark(name);
        return true;
      } catch (error) {
        return false;
      }
    }

    function safeMeasure(name, startMark, endMark) {
      try {
        performanceObj.measure(name, startMark, endMark);
        return true;
      } catch (error) {
        return false;
      }
    }

    function markMilestone(label) {
      const normalized = normalizeLabel(label);
      const markName = `lumno-newtab-milestone-${normalized}`;
      if (!safeMark(markName)) {
        return null;
      }
      if (previousMilestone) {
        safeMeasure(
          `lumno-newtab-phase-${previousMilestone.label}-to-${normalized}`,
          previousMilestone.markName,
          markName
        );
      }
      previousMilestone = { label: normalized, markName };
      return markName;
    }

    function observeTask(label, task) {
      const normalized = normalizeLabel(label);
      const count = (taskCounts.get(normalized) || 0) + 1;
      taskCounts.set(normalized, count);
      const suffix = count > 1 ? `-${count}` : '';
      const startMark = `lumno-newtab-task-${normalized}${suffix}-start`;
      const endMark = `lumno-newtab-task-${normalized}${suffix}-end`;
      if (!safeMark(startMark)) {
        return task;
      }
      const finish = () => {
        if (safeMark(endMark)) {
          safeMeasure(
            `lumno-newtab-task-${normalized}${suffix}`,
            startMark,
            endMark
          );
        }
      };
      Promise.resolve(task).then(finish, finish);
      return task;
    }

    return Object.freeze({ markMilestone, observeTask });
  }

  function createPerformanceCollector(windowObj, documentObj, surfaceType) {
    const performanceObj = windowObj && windowObj.performance;
    const longTasks = [];
    const events = [];
    const eventBursts = [];
    const layoutShifts = [];
    const observers = [];
    const activeBaselines = new Set();
    const observerSupport = {};
    const longTaskStats = { count: 0, duration: 0, maxDuration: 0, sequence: 0 };
    const eventStats = { count: 0, duration: 0, maxDuration: 0, sequence: 0 };
    const eventBurstStats = {
      count: 0,
      duration: 0,
      maxDuration: 0,
      maxInputDelay: 0,
      maxProcessingDuration: 0,
      maxPresentationDelay: 0,
      sequence: 0
    };
    let cumulativeLayoutShift = 0;
    let largestContentfulPaint = null;
    let readyAtMs = null;
    let readyObserver = null;

    function appendBounded(list, entry) {
      list.push(entry);
      if (list.length > MAX_PERFORMANCE_ENTRIES) {
        list.splice(0, list.length - MAX_PERFORMANCE_ENTRIES);
      }
    }

    function trackBaselineMaximum(name, value) {
      activeBaselines.forEach((baseline) => {
        baseline[name] = Math.max(Number(baseline[name]) || 0, Number(value) || 0);
      });
    }

    function updateEventBurstMaximums(burst) {
      eventBurstStats.maxDuration = Math.max(eventBurstStats.maxDuration, burst.duration);
      eventBurstStats.maxInputDelay = Math.max(
        eventBurstStats.maxInputDelay,
        burst.inputDelayMs
      );
      eventBurstStats.maxProcessingDuration = Math.max(
        eventBurstStats.maxProcessingDuration,
        burst.processingDurationMs
      );
      eventBurstStats.maxPresentationDelay = Math.max(
        eventBurstStats.maxPresentationDelay,
        burst.presentationDelayMs
      );
      trackBaselineMaximum('eventBurstLongestMs', burst.duration);
      trackBaselineMaximum('eventBurstLongestInputDelayMs', burst.inputDelayMs);
      trackBaselineMaximum(
        'eventBurstLongestProcessingDurationMs',
        burst.processingDurationMs
      );
      trackBaselineMaximum(
        'eventBurstLongestPresentationDelayMs',
        burst.presentationDelayMs
      );
    }

    function appendEventBurst(eventEntry) {
      const burstKey = [
        eventEntry.startTime,
        eventEntry.duration,
        eventEntry.interactionId
      ].join(':');
      const latestBurst = eventBursts[eventBursts.length - 1];
      if (latestBurst && latestBurst.key === burstKey) {
        latestBurst.entryCount += 1;
        if (!latestBurst.names.includes(eventEntry.name) && latestBurst.names.length < 12) {
          latestBurst.names.push(eventEntry.name);
        }
        if (eventEntry.processingStart > 0) {
          latestBurst.processingStart = latestBurst.processingStart > 0
            ? Math.min(latestBurst.processingStart, eventEntry.processingStart)
            : eventEntry.processingStart;
        }
        latestBurst.processingEnd = Math.max(
          latestBurst.processingEnd,
          eventEntry.processingEnd
        );
        if (!latestBurst.target && eventEntry.target) {
          latestBurst.target = eventEntry.target;
        }
        latestBurst.inputDelayMs = roundMetric(Math.max(
          0,
          latestBurst.processingStart - latestBurst.startTime
        ));
        latestBurst.processingDurationMs = roundMetric(Math.max(
          0,
          latestBurst.processingEnd - latestBurst.processingStart
        ));
        latestBurst.presentationDelayMs = roundMetric(Math.max(
          0,
          latestBurst.startTime + latestBurst.duration - latestBurst.processingEnd
        ));
        updateEventBurstMaximums(latestBurst);
        return;
      }
      eventBurstStats.count += 1;
      eventBurstStats.duration += eventEntry.duration;
      eventBurstStats.sequence += 1;
      const burst = {
        sequence: eventBurstStats.sequence,
        key: burstKey,
        names: [eventEntry.name],
        entryCount: 1,
        startTime: eventEntry.startTime,
        duration: eventEntry.duration,
        processingStart: eventEntry.processingStart,
        processingEnd: eventEntry.processingEnd,
        inputDelayMs: eventEntry.inputDelayMs,
        processingDurationMs: eventEntry.processingDurationMs,
        presentationDelayMs: eventEntry.presentationDelayMs,
        interactionId: eventEntry.interactionId,
        target: eventEntry.target
      };
      appendBounded(eventBursts, burst);
      updateEventBurstMaximums(burst);
    }

    function isSurfaceReady() {
      if (!documentObj) {
        return false;
      }
      if (surfaceType === 'newtab') {
        return Boolean(documentObj.body &&
          documentObj.body.getAttribute('data-nt-ready') === '1');
      }
      if (surfaceType === 'options') {
        return Boolean(documentObj.documentElement &&
          documentObj.documentElement.getAttribute('data-lumno-options-ready') === 'true');
      }
      return documentObj.readyState === 'complete';
    }

    function captureReadyTime() {
      if (readyAtMs !== null || !isSurfaceReady()) {
        return false;
      }
      readyAtMs = roundMetric(getPerformanceNow(windowObj));
      if (readyObserver) {
        readyObserver.disconnect();
        readyObserver = null;
      }
      return true;
    }

    function observe(type, observeOptions, onEntries) {
      const PerformanceObserverClass = windowObj && windowObj.PerformanceObserver;
      if (typeof PerformanceObserverClass !== 'function') {
        return false;
      }
      const supportedTypes = Array.isArray(PerformanceObserverClass.supportedEntryTypes)
        ? PerformanceObserverClass.supportedEntryTypes
        : null;
      if (supportedTypes && !supportedTypes.includes(type)) {
        return false;
      }
      try {
        const observer = new PerformanceObserverClass((list) => {
          const entries = list && typeof list.getEntries === 'function'
            ? list.getEntries()
            : [];
          onEntries(Array.from(entries || []));
        });
        observer.observe(observeOptions);
        observers.push(observer);
        return true;
      } catch (error) {
        return false;
      }
    }

    observerSupport.longtask = observe('longtask', { type: 'longtask', buffered: true }, (entries) => {
      entries.forEach((entry) => {
        const duration = roundMetric(entry.duration);
        longTaskStats.count += 1;
        longTaskStats.duration += duration;
        longTaskStats.maxDuration = Math.max(longTaskStats.maxDuration, duration);
        trackBaselineMaximum('longTaskLongestMs', duration);
        longTaskStats.sequence += 1;
        appendBounded(longTasks, {
          sequence: longTaskStats.sequence,
          name: String(entry.name || 'longtask'),
          startTime: roundMetric(entry.startTime),
          duration
        });
      });
    });
    observerSupport.event = observe('event', {
      type: 'event',
      buffered: true,
      durationThreshold: 16
    }, (entries) => {
      entries.forEach((entry) => {
        const duration = roundMetric(entry.duration);
        const startTime = roundMetric(entry.startTime);
        const processingStart = roundMetric(entry.processingStart);
        const processingEnd = roundMetric(entry.processingEnd);
        eventStats.count += 1;
        eventStats.duration += duration;
        eventStats.maxDuration = Math.max(eventStats.maxDuration, duration);
        trackBaselineMaximum('eventLongestMs', duration);
        eventStats.sequence += 1;
        const eventEntry = {
          sequence: eventStats.sequence,
          name: String(entry.name || 'event'),
          startTime,
          duration,
          processingStart,
          processingEnd,
          inputDelayMs: roundMetric(Math.max(0, processingStart - startTime)),
          processingDurationMs: roundMetric(Math.max(0, processingEnd - processingStart)),
          presentationDelayMs: roundMetric(Math.max(
            0,
            startTime + duration - processingEnd
          )),
          interactionId: Number(entry.interactionId) || 0,
          target: sanitizePerformanceEventTarget(entry.target)
        };
        appendBounded(events, eventEntry);
        appendEventBurst(eventEntry);
      });
    });
    observerSupport.layoutShift = observe('layout-shift', { type: 'layout-shift', buffered: true }, (entries) => {
      entries.forEach((entry) => {
        const value = roundMetric(entry.value);
        const hadRecentInput = Boolean(entry.hadRecentInput);
        if (!hadRecentInput) {
          cumulativeLayoutShift += value;
        }
        appendBounded(layoutShifts, {
          startTime: roundMetric(entry.startTime),
          value,
          hadRecentInput
        });
      });
    });
    observerSupport.largestContentfulPaint = observe(
      'largest-contentful-paint',
      { type: 'largest-contentful-paint', buffered: true },
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) {
          return;
        }
        largestContentfulPaint = {
          startTime: roundMetric(entry.startTime),
          renderTime: roundMetric(entry.renderTime),
          loadTime: roundMetric(entry.loadTime),
          size: roundMetric(entry.size)
        };
      }
    );

    captureReadyTime();
    const MutationObserverClass = windowObj && windowObj.MutationObserver;
    if (readyAtMs === null && typeof MutationObserverClass === 'function') {
      readyObserver = new MutationObserverClass(captureReadyTime);
      if (documentObj && documentObj.documentElement) {
        readyObserver.observe(documentObj.documentElement, {
          attributes: true,
          attributeFilter: ['data-lumno-options-ready']
        });
      }
      if (documentObj && documentObj.body) {
        readyObserver.observe(documentObj.body, {
          attributes: true,
          attributeFilter: ['data-nt-ready']
        });
      }
    }

    function getBaseline() {
      const baseline = {
        longTaskCount: longTaskStats.count,
        longTaskDuration: longTaskStats.duration,
        longTaskSequence: longTaskStats.sequence,
        longTaskLongestMs: 0,
        eventCount: eventStats.count,
        eventDuration: eventStats.duration,
        eventSequence: eventStats.sequence,
        eventLongestMs: 0,
        eventBurstCount: eventBurstStats.count,
        eventBurstDuration: eventBurstStats.duration,
        eventBurstSequence: eventBurstStats.sequence,
        eventBurstLongestMs: 0,
        eventBurstLongestInputDelayMs: 0,
        eventBurstLongestProcessingDurationMs: 0,
        eventBurstLongestPresentationDelayMs: 0,
        cumulativeLayoutShift
      };
      activeBaselines.add(baseline);
      return baseline;
    }

    function getDelta(baseline) {
      const start = baseline && typeof baseline === 'object' ? baseline : {};
      activeBaselines.delete(start);
      const newLongTasks = longTasks.filter((entry) =>
        entry.sequence > (Number(start.longTaskSequence) || 0)
      );
      const newEvents = events.filter((entry) =>
        entry.sequence > (Number(start.eventSequence) || 0)
      );
      const newEventBursts = eventBursts.filter((entry) =>
        entry.sequence > (Number(start.eventBurstSequence) || 0)
      );
      return {
        longTasks: {
          count: Math.max(0, longTaskStats.count - (Number(start.longTaskCount) || 0)),
          totalDurationMs: roundMetric(
            longTaskStats.duration - (Number(start.longTaskDuration) || 0)
          ),
          longestMs: roundMetric(Math.max(
            Number(start.longTaskLongestMs) || 0,
            ...newLongTasks.map((entry) => entry.duration)
          ))
        },
        events: {
          count: Math.max(0, eventStats.count - (Number(start.eventCount) || 0)),
          totalDurationMs: roundMetric(
            eventStats.duration - (Number(start.eventDuration) || 0)
          ),
          longestMs: roundMetric(Math.max(
            Number(start.eventLongestMs) || 0,
            ...newEvents.map((entry) => entry.duration)
          ))
        },
        eventBursts: {
          count: Math.max(0, eventBurstStats.count - (Number(start.eventBurstCount) || 0)),
          rawEntryCount: Math.max(0, eventStats.count - (Number(start.eventCount) || 0)),
          totalDurationMs: roundMetric(
            eventBurstStats.duration - (Number(start.eventBurstDuration) || 0)
          ),
          longestMs: roundMetric(Math.max(
            Number(start.eventBurstLongestMs) || 0,
            ...newEventBursts.map((entry) => entry.duration)
          )),
          longestInputDelayMs: roundMetric(
            Number(start.eventBurstLongestInputDelayMs) || 0
          ),
          longestProcessingDurationMs: roundMetric(
            Number(start.eventBurstLongestProcessingDurationMs) || 0
          ),
          longestPresentationDelayMs: roundMetric(
            Number(start.eventBurstLongestPresentationDelayMs) || 0
          )
        },
        cumulativeLayoutShift: roundMetric(
          cumulativeLayoutShift - (Number(start.cumulativeLayoutShift) || 0)
        )
      };
    }

    function snapshot(params) {
      captureReadyTime();
      const config = params && typeof params === 'object' ? params : {};
      const maximum = clamp(config.maxEntries, 0, 100, 20);
      const navigation = getPerformanceEntries(performanceObj, 'navigation')[0] || null;
      const paintEntries = getPerformanceEntries(performanceObj, 'paint').map((entry) => ({
        name: String(entry.name || ''),
        startTime: roundMetric(entry.startTime)
      }));
      const resources = getPerformanceEntries(performanceObj, 'resource');
      const slowestResources = resources
        .map((entry) => ({
          name: sanitizePerformanceResourceName(entry.name),
          initiatorType: String(entry.initiatorType || ''),
          startTime: roundMetric(entry.startTime),
          duration: roundMetric(entry.duration),
          transferSize: Math.max(0, Number(entry.transferSize) || 0)
        }))
        .sort((left, right) => right.duration - left.duration)
        .slice(0, maximum);
      const userTiming = [
        ...getPerformanceEntries(performanceObj, 'mark'),
        ...getPerformanceEntries(performanceObj, 'measure')
      ].filter((entry) => /^lumno-/i.test(String(entry.name || ''))).map((entry) => ({
        entryType: String(entry.entryType || ''),
        name: String(entry.name || ''),
        startTime: roundMetric(entry.startTime),
        duration: roundMetric(entry.duration)
      }));
      const rootElement = documentObj && documentObj.documentElement;
      const body = documentObj && documentObj.body;
      const memory = performanceObj && performanceObj.memory;
      const result = {
        surfaceType,
        capturedAtMs: roundMetric(getPerformanceNow(windowObj)),
        environment: {
          hardwareConcurrency: Math.max(0, Number(windowObj.navigator &&
            windowObj.navigator.hardwareConcurrency) || 0),
          deviceMemoryGb: Math.max(0, Number(windowObj.navigator &&
            windowObj.navigator.deviceMemory) || 0),
          visibilityState: String(documentObj && documentObj.visibilityState || ''),
          viewport: {
            width: Number(windowObj.innerWidth) || 0,
            height: Number(windowObj.innerHeight) || 0,
            devicePixelRatio: Number(windowObj.devicePixelRatio) || 1
          }
        },
        document: {
          readyState: String(documentObj && documentObj.readyState || ''),
          nodeCount: documentObj && typeof documentObj.querySelectorAll === 'function'
            ? documentObj.querySelectorAll('*').length
            : 0,
          bookmarkCards: documentObj && typeof documentObj.querySelectorAll === 'function'
            ? documentObj.querySelectorAll('.x-nt-bookmark-card').length
            : 0,
          shortcutTiles: documentObj && typeof documentObj.querySelectorAll === 'function'
            ? documentObj.querySelectorAll('.x-nt-shortcut-tile').length
            : 0,
          suggestionRows: documentObj && typeof documentObj.querySelectorAll === 'function'
            ? documentObj.querySelectorAll('.x-nt-suggestion-item, .x-ov-suggestion-item').length
            : 0
        },
        startup: {
          readyAtMs,
          ready: isSurfaceReady(),
          storage: {
            requests: Number(rootElement && rootElement.getAttribute(
              'data-lumno-newtab-bootstrap-storage-requests'
            )) || 0,
            reads: Number(rootElement && rootElement.getAttribute(
              'data-lumno-newtab-bootstrap-storage-reads'
            )) || 0,
            keys: String(rootElement && rootElement.getAttribute(
              'data-lumno-newtab-bootstrap-storage-keys'
            ) || '')
          },
          navigation: navigation ? {
            type: String(navigation.type || ''),
            duration: roundMetric(navigation.duration),
            responseEnd: roundMetric(navigation.responseEnd),
            domInteractive: roundMetric(navigation.domInteractive),
            domContentLoaded: roundMetric(navigation.domContentLoadedEventEnd),
            loadEnd: roundMetric(navigation.loadEventEnd)
          } : null,
          paints: paintEntries,
          largestContentfulPaint,
          userTiming
        },
        responsiveness: {
          longTasks: {
            count: longTaskStats.count,
            totalDurationMs: roundMetric(longTaskStats.duration),
            longestMs: roundMetric(longTaskStats.maxDuration),
            entries: (maximum > 0 ? longTasks.slice(-maximum) : [])
              .map(({ sequence, ...entry }) => entry)
          },
          events: {
            count: eventStats.count,
            totalDurationMs: roundMetric(eventStats.duration),
            longestMs: roundMetric(eventStats.maxDuration),
            entries: (maximum > 0 ? events.slice(-maximum) : [])
              .map(({ sequence, ...entry }) => entry)
          },
          eventBursts: {
            count: eventBurstStats.count,
            rawEntryCount: eventStats.count,
            totalDurationMs: roundMetric(eventBurstStats.duration),
            longestMs: roundMetric(eventBurstStats.maxDuration),
            longestInputDelayMs: roundMetric(eventBurstStats.maxInputDelay),
            longestProcessingDurationMs: roundMetric(
              eventBurstStats.maxProcessingDuration
            ),
            longestPresentationDelayMs: roundMetric(
              eventBurstStats.maxPresentationDelay
            ),
            entries: (maximum > 0 ? eventBursts.slice(-maximum) : [])
              .map(({ sequence, key, ...entry }) => entry)
          },
          observerSupport: { ...observerSupport },
          cumulativeLayoutShift: roundMetric(cumulativeLayoutShift),
          layoutShifts: maximum > 0 ? layoutShifts.slice(-maximum) : []
        },
        resources: {
          count: resources.length,
          totalDurationMs: roundMetric(resources.reduce(
            (total, entry) => total + (Number(entry.duration) || 0),
            0
          )),
          slowest: slowestResources
        },
        memory: memory ? {
          usedJsHeapBytes: Math.max(0, Number(memory.usedJSHeapSize) || 0),
          totalJsHeapBytes: Math.max(0, Number(memory.totalJSHeapSize) || 0),
          jsHeapLimitBytes: Math.max(0, Number(memory.jsHeapSizeLimit) || 0)
        } : null,
        pageState: {
          newtabReady: String(body && body.getAttribute('data-nt-ready') || ''),
          newtabEntry: String(body && body.getAttribute('data-nt-enter') || '')
        }
      };
      if (config.clear === true) {
        longTasks.length = 0;
        events.length = 0;
        eventBursts.length = 0;
        layoutShifts.length = 0;
        longTaskStats.count = 0;
        longTaskStats.duration = 0;
        longTaskStats.maxDuration = 0;
        eventStats.count = 0;
        eventStats.duration = 0;
        eventStats.maxDuration = 0;
        eventBurstStats.count = 0;
        eventBurstStats.duration = 0;
        eventBurstStats.maxDuration = 0;
        eventBurstStats.maxInputDelay = 0;
        eventBurstStats.maxProcessingDuration = 0;
        eventBurstStats.maxPresentationDelay = 0;
        cumulativeLayoutShift = 0;
      }
      return result;
    }

    function destroy() {
      activeBaselines.clear();
      observers.forEach((observer) => observer.disconnect());
      observers.length = 0;
      if (readyObserver) {
        readyObserver.disconnect();
        readyObserver = null;
      }
    }

    return Object.freeze({ destroy, getBaseline, getDelta, snapshot });
  }

  function summarizeStartupMetric(values) {
    const sorted = Array.isArray(values)
      ? values.filter((value) => Number.isFinite(value) && value >= 0).slice()
      : [];
    sorted.sort((left, right) => left - right);
    if (sorted.length === 0) {
      return { count: 0, minMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0 };
    }
    const percentile = (ratio) => sorted[
      Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
    ];
    return {
      count: sorted.length,
      minMs: roundMetric(sorted[0]),
      medianMs: roundMetric(percentile(0.5)),
      p95Ms: roundMetric(percentile(0.95)),
      maxMs: roundMetric(sorted[sorted.length - 1])
    };
  }

  function createStartupSampler(windowObj, documentObj, performanceCollector, surfaceType) {
    if (surfaceType !== 'newtab' || !windowObj || !documentObj || !performanceCollector) {
      return null;
    }
    let fallbackSamples = [];
    let pollTimer = null;
    let settleTimer = null;
    let captured = false;
    let destroyed = false;
    const pollStartedAt = Date.now();

    function getSharedStartupStorage() {
      try {
        return windowObj.localStorage || null;
      } catch (error) {
        return null;
      }
    }

    function readSamples() {
      const storage = getSharedStartupStorage();
      if (!storage || typeof storage.getItem !== 'function') {
        return fallbackSamples.slice();
      }
      try {
        const parsed = JSON.parse(storage.getItem(STARTUP_SAMPLE_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.slice(-MAX_STARTUP_SAMPLES) : [];
      } catch (error) {
        return [];
      }
    }

    function writeSamples(samples) {
      const bounded = Array.isArray(samples)
        ? samples.slice(-MAX_STARTUP_SAMPLES)
        : [];
      fallbackSamples = bounded;
      const storage = getSharedStartupStorage();
      if (!storage || typeof storage.setItem !== 'function') {
        return false;
      }
      try {
        storage.setItem(STARTUP_SAMPLE_STORAGE_KEY, JSON.stringify(bounded));
        return true;
      } catch (error) {
        return false;
      }
    }

    function getLargestContentfulPaintMs(sample) {
      const lcp = sample && sample.startup && sample.startup.largestContentfulPaint;
      return lcp && Number.isFinite(Number(lcp.startTime))
        ? Number(lcp.startTime)
        : Number.NaN;
    }

    function getOptionalMetric(value) {
      return value !== null && value !== undefined && Number.isFinite(Number(value))
        ? Number(value)
        : Number.NaN;
    }

    function getReport() {
      const samples = readSamples();
      const navigationTypes = samples.reduce((counts, sample) => {
        const rawType = sample && sample.startup && sample.startup.navigation
          ? sample.startup.navigation.type
          : '';
        const type = truncate(rawType || 'unknown', 24);
        counts[type] = (counts[type] || 0) + 1;
        return counts;
      }, {});
      return {
        version: 1,
        surfaceType: 'newtab',
        kind: 'cold-start-series',
        sampleCount: samples.length,
        navigationTypes,
        summary: {
          readyAtMs: summarizeStartupMetric(samples.map((sample) =>
            getOptionalMetric(sample.startup && sample.startup.readyAtMs)
          )),
          largestContentfulPaintMs: summarizeStartupMetric(
            samples.map(getLargestContentfulPaintMs)
          ),
          domInteractiveMs: summarizeStartupMetric(samples.map((sample) =>
            getOptionalMetric(sample.startup && sample.startup.navigation &&
              sample.startup.navigation.domInteractive)
          )),
          longTaskTotalMs: summarizeStartupMetric(samples.map((sample) =>
            getOptionalMetric(sample.longTasks && sample.longTasks.totalDurationMs)
          )),
          longestTaskMs: summarizeStartupMetric(samples.map((sample) =>
            getOptionalMetric(sample.longTasks && sample.longTasks.longestMs)
          ))
        },
        samples
      };
    }

    function capture() {
      if (destroyed || captured) {
        return null;
      }
      const snapshot = performanceCollector.snapshot({ maxEntries: 100 });
      if (!snapshot.startup.ready) {
        return null;
      }
      captured = true;
      const longTaskEntries = snapshot.responsiveness.longTasks.entries || [];
      const longTaskSnapshot = snapshot.responsiveness.longTasks;
      const sample = {
        capturedAtUnixMs: Date.now(),
        capturedAtMs: snapshot.capturedAtMs,
        environment: snapshot.environment,
        startup: snapshot.startup,
        longTasks: {
          count: longTaskSnapshot.count,
          totalDurationMs: longTaskSnapshot.totalDurationMs,
          longestMs: longTaskSnapshot.longestMs,
          entries: longTaskEntries
        },
        document: snapshot.document,
        resources: snapshot.resources,
        memory: snapshot.memory
      };
      const samples = readSamples();
      samples.push(sample);
      writeSamples(samples);
      return sample;
    }

    function pollForReady() {
      pollTimer = null;
      if (destroyed || captured) {
        return;
      }
      const body = documentObj.body;
      if (body && body.getAttribute('data-nt-ready') === '1') {
        settleTimer = windowObj.setTimeout(() => {
          settleTimer = null;
          capture();
        }, 1000);
        return;
      }
      if (Date.now() - pollStartedAt >= 15000) {
        return;
      }
      pollTimer = windowObj.setTimeout(pollForReady, 50);
    }

    function clear() {
      fallbackSamples = [];
      const storage = getSharedStartupStorage();
      if (storage && typeof storage.removeItem === 'function') {
        try {
          storage.removeItem(STARTUP_SAMPLE_STORAGE_KEY);
        } catch (error) {
          // The in-memory fallback is already clear.
        }
      }
      return getReport();
    }

    function execute(params) {
      const action = String(params && params.action || 'report');
      if (action === 'report' || action === 'list') {
        return getReport();
      }
      if (action === 'capture') {
        capture();
        return getReport();
      }
      if (action === 'clear') {
        return clear();
      }
      if (action === 'status') {
        return { captured, sampleCount: readSamples().length };
      }
      const error = new Error('Unsupported startup sample action.');
      error.code = 'unsupported_startup_sample_action';
      throw error;
    }

    function destroy() {
      destroyed = true;
      if (pollTimer !== null) {
        windowObj.clearTimeout(pollTimer);
        pollTimer = null;
      }
      if (settleTimer !== null) {
        windowObj.clearTimeout(settleTimer);
        settleTimer = null;
      }
    }

    pollForReady();
    return Object.freeze({ capture, clear, destroy, execute, getReport });
  }

  function summarizeFrameDurations(values) {
    const durations = Array.isArray(values)
      ? values.filter((value) => Number.isFinite(value) && value >= 0).slice()
      : [];
    durations.sort((left, right) => left - right);
    if (durations.length === 0) {
      return {
        count: 0,
        minMs: 0,
        medianMs: 0,
        p95Ms: 0,
        maxMs: 0,
        framesOver20Ms: 0,
        framesOver32Ms: 0,
        framesOver50Ms: 0,
        referenceFrameBudgetMs: roundMetric(1000 / 60),
        estimatedDroppedFramesAt60Hz: 0
      };
    }
    const percentile = (ratio) => durations[
      Math.min(durations.length - 1, Math.floor(durations.length * ratio))
    ];
    return {
      count: durations.length,
      minMs: roundMetric(durations[0]),
      medianMs: roundMetric(percentile(0.5)),
      p95Ms: roundMetric(percentile(0.95)),
      maxMs: roundMetric(durations[durations.length - 1]),
      framesOver20Ms: durations.filter((duration) => duration > 20).length,
      framesOver32Ms: durations.filter((duration) => duration > 32).length,
      framesOver50Ms: durations.filter((duration) => duration > 50).length,
      referenceFrameBudgetMs: roundMetric(1000 / 60),
      estimatedDroppedFramesAt60Hz: durations.reduce((total, duration) => {
        return total + Math.max(0, Math.floor(duration / (1000 / 60)) - 1);
      }, 0)
    };
  }

  function createPerformanceRecorder(windowObj, performanceCollector, surfaceType) {
    const MAX_FRAME_SAMPLES = 10000;
    let activeRecording = null;
    let latestReport = null;

    function cancelRecordingTimers(recording) {
      if (!recording) {
        return;
      }
      if (recording.timer !== null) {
        windowObj.clearTimeout(recording.timer);
        recording.timer = null;
      }
      if (recording.cancelFrame) {
        recording.cancelFrame();
        recording.cancelFrame = null;
        recording.frameRequestId = null;
      }
    }

    function requestRecordingFrame(recording) {
      if (!recording || activeRecording !== recording) {
        return;
      }
      const onFrame = (frameTime) => {
        recording.frameRequestId = null;
        recording.cancelFrame = null;
        if (activeRecording !== recording) {
          return;
        }
        const now = Number.isFinite(Number(frameTime))
          ? Number(frameTime)
          : getPerformanceNow(windowObj);
        if (recording.frameDurations.length < MAX_FRAME_SAMPLES) {
          recording.frameDurations.push(Math.max(0, now - recording.lastFrameAt));
        }
        recording.lastFrameAt = now;
        if (now - recording.startedAt >= recording.durationLimitMs) {
          finish('duration');
          return;
        }
        requestRecordingFrame(recording);
      };
      if (typeof windowObj.requestAnimationFrame === 'function') {
        recording.frameRequestId = windowObj.requestAnimationFrame(onFrame);
        recording.cancelFrame = () => {
          if (typeof windowObj.cancelAnimationFrame === 'function') {
            windowObj.cancelAnimationFrame(recording.frameRequestId);
          }
        };
        return;
      }
      recording.frameRequestId = windowObj.setTimeout(
        () => onFrame(getPerformanceNow(windowObj)),
        16
      );
      recording.cancelFrame = () => windowObj.clearTimeout(recording.frameRequestId);
    }

    function getStatus() {
      if (!activeRecording) {
        return {
          active: false,
          latestReport: latestReport ? {
            durationMs: latestReport.durationMs,
            finishedBy: latestReport.finishedBy,
            scenario: latestReport.scenario
          } : null
        };
      }
      return {
        active: true,
        durationLimitMs: activeRecording.durationLimitMs,
        elapsedMs: roundMetric(getPerformanceNow(windowObj) - activeRecording.startedAt),
        frameSamples: activeRecording.frameDurations.length,
        scenario: activeRecording.scenario
      };
    }

    function finish(reason) {
      const recording = activeRecording;
      if (!recording) {
        return latestReport;
      }
      activeRecording = null;
      cancelRecordingTimers(recording);
      const finishedAt = getPerformanceNow(windowObj);
      const finalSnapshot = performanceCollector.snapshot({
        maxEntries: recording.maxEntries
      });
      const initialHeap = recording.initialSnapshot.memory &&
        recording.initialSnapshot.memory.usedJsHeapBytes;
      const finalHeap = finalSnapshot.memory && finalSnapshot.memory.usedJsHeapBytes;
      latestReport = Object.freeze({
        version: 1,
        surfaceType,
        scenario: recording.scenario,
        startedAtUnixMs: recording.startedAtUnixMs,
        durationLimitMs: recording.durationLimitMs,
        durationMs: roundMetric(finishedAt - recording.startedAt),
        finishedBy: String(reason || 'manual'),
        frames: summarizeFrameDurations(recording.frameDurations),
        performanceDelta: performanceCollector.getDelta(recording.baseline),
        changes: {
          domNodes: finalSnapshot.document.nodeCount -
            recording.initialSnapshot.document.nodeCount,
          usedJsHeapBytes: Number.isFinite(initialHeap) && Number.isFinite(finalHeap)
            ? finalHeap - initialHeap
            : null
        },
        initial: recording.initialSnapshot,
        final: finalSnapshot
      });
      if (typeof recording.onComplete === 'function') {
        try {
          recording.onComplete(latestReport);
        } catch (error) {
          // The report remains available even if a development panel callback fails.
        }
      }
      return latestReport;
    }

    function start(params, onComplete) {
      if (activeRecording) {
        finish('restarted');
      }
      const config = params && typeof params === 'object' ? params : {};
      const durationLimitMs = clamp(config.durationMs, 1000, 60000, 15000);
      const startedAt = getPerformanceNow(windowObj);
      activeRecording = {
        baseline: performanceCollector.getBaseline(),
        cancelFrame: null,
        durationLimitMs,
        frameDurations: [],
        frameRequestId: null,
        initialSnapshot: performanceCollector.snapshot({ maxEntries: 0 }),
        lastFrameAt: startedAt,
        maxEntries: clamp(config.maxEntries, 0, 100, 30),
        onComplete,
        scenario: truncate(config.scenario || 'mixed', 64),
        startedAt,
        startedAtUnixMs: Date.now(),
        timer: null
      };
      const recording = activeRecording;
      recording.timer = windowObj.setTimeout(() => finish('duration'), durationLimitMs);
      requestRecordingFrame(recording);
      return getStatus();
    }

    function clear() {
      if (activeRecording) {
        finish('cleared');
      }
      latestReport = null;
      return getStatus();
    }

    function destroy() {
      const recording = activeRecording;
      activeRecording = null;
      cancelRecordingTimers(recording);
      latestReport = null;
    }

    function execute(params) {
      const config = params && typeof params === 'object' ? params : {};
      const action = String(config.action || 'status');
      if (action === 'start') {
        return start(config);
      }
      if (action === 'stop') {
        return finish('manual');
      }
      if (action === 'latest') {
        return latestReport;
      }
      if (action === 'clear') {
        return clear();
      }
      if (action === 'status') {
        return getStatus();
      }
      const error = new Error('Unsupported performance recording action.');
      error.code = 'unsupported_recording_action';
      throw error;
    }

    return Object.freeze({
      clear,
      destroy,
      execute,
      finish,
      getLatestReport: () => latestReport,
      getStatus,
      start
    });
  }

  function createPerformancePanel(
    windowObj,
    documentObj,
    performanceRecorder,
    performanceCollector,
    startupSampler
  ) {
    const scenarioInstructions = Object.freeze({
      mixed: 'Type in search, move across shortcuts, page bookmarks, then open the wallpaper panel.',
      search: 'Focus search, type and erase several queries, and move through suggestions with the keyboard.',
      shortcuts: 'Move across shortcut tiles, then drag one without dropping it in an unintended position.',
      bookmarks: 'Page bookmarks, open nested folders, use breadcrumbs, and exercise the cascade menu.',
      wallpaper: 'Open the wallpaper panel, switch tabs or choices, scroll it, and close it.'
    });
    let host = null;
    let shadowRoot = null;
    let panelOpen = false;
    let latestPanelReport = null;

    function formatReport(report) {
      if (!report) {
        const startupReport = startupSampler ? startupSampler.getReport() : null;
        return startupReport
          ? `No interaction recording yet.\nCold-start samples: ${startupReport.sampleCount}/${MAX_STARTUP_SAMPLES}. Open a fresh New Tab to add a sample, then use “Copy startups”.`
          : 'No recording yet.';
      }
      const frames = report.frames || {};
      const delta = report.performanceDelta || {};
      const longTasks = delta.longTasks || {};
      const events = delta.events || {};
      const eventBursts = delta.eventBursts || {};
      const changes = report.changes || {};
      const startup = report.final && report.final.startup || {};
      const heapDelta = Number.isFinite(changes.usedJsHeapBytes)
        ? `${Math.round(changes.usedJsHeapBytes / 1024)} KiB`
        : 'unavailable';
      return [
        `Scenario: ${report.scenario}`,
        `Duration: ${report.durationMs} ms (${report.finishedBy})`,
        `Startup ready: ${startup.readyAtMs == null ? 'unavailable' : `${startup.readyAtMs} ms`} · storage reads/requests ${startup.storage ? `${startup.storage.reads}/${startup.storage.requests}` : 'unavailable'}`,
        `Frames: ${frames.count || 0} · p95 ${frames.p95Ms || 0} ms · max ${frames.maxMs || 0} ms`,
        `Over 20/32/50 ms: ${frames.framesOver20Ms || 0}/${frames.framesOver32Ms || 0}/${frames.framesOver50Ms || 0}`,
        `Estimated dropped frames (60 Hz): ${frames.estimatedDroppedFramesAt60Hz || 0}`,
        `Long tasks: ${longTasks.count || 0} · longest ${longTasks.longestMs || 0} ms`,
        `Event bursts: ${eventBursts.count || 0} · raw entries ${eventBursts.rawEntryCount || events.count || 0} · max processing ${eventBursts.longestProcessingDurationMs || 0} ms · max total ${eventBursts.longestMs || events.longestMs || 0} ms`,
        `CLS delta: ${delta.cumulativeLayoutShift || 0}`,
        `DOM node delta: ${changes.domNodes || 0}`,
        `Used heap delta: ${heapDelta}`
      ].join('\n');
    }

    function getElement(selector) {
      return shadowRoot ? shadowRoot.querySelector(selector) : null;
    }

    function updateScenarioInstructions() {
      const select = getElement('[data-role="scenario"]');
      const instructions = getElement('[data-role="instructions"]');
      if (!select || !instructions) {
        return;
      }
      instructions.textContent = scenarioInstructions[select.value] || scenarioInstructions.mixed;
    }

    function updateControls() {
      const status = performanceRecorder.getStatus();
      const startButton = getElement('[data-action="start"]');
      const stopButton = getElement('[data-action="stop"]');
      const statusElement = getElement('[data-role="status"]');
      if (startButton) {
        startButton.disabled = status.active;
      }
      if (stopButton) {
        stopButton.disabled = !status.active;
      }
      if (statusElement) {
        statusElement.textContent = status.active ? 'Recording' : 'Idle';
        statusElement.setAttribute('data-active', status.active ? 'true' : 'false');
      }
    }

    function renderReport(report) {
      latestPanelReport = report || performanceRecorder.getLatestReport();
      const output = getElement('[data-role="output"]');
      if (output) {
        output.textContent = formatReport(latestPanelReport);
      }
      updateControls();
    }

    function startRecording() {
      const scenarioElement = getElement('[data-role="scenario"]');
      const durationElement = getElement('[data-role="duration"]');
      const scenario = String(scenarioElement && scenarioElement.value || 'mixed');
      const durationMs = Number(durationElement && durationElement.value) || 15000;
      latestPanelReport = null;
      performanceRecorder.start({ durationMs, maxEntries: 40, scenario }, renderReport);
      const output = getElement('[data-role="output"]');
      if (output) {
        output.textContent = [
          `Recording “${scenario}” for up to ${Math.round(durationMs / 1000)} seconds.`,
          scenarioInstructions[scenario] || scenarioInstructions.mixed,
          'You can close this panel while recording and reopen it with the same shortcut.'
        ].join('\n');
      }
      updateControls();
    }

    function stopRecording() {
      renderReport(performanceRecorder.finish('manual'));
    }

    async function copyJsonValue(payload, copiedStatus) {
      if (!payload) {
        return false;
      }
      const value = JSON.stringify(payload, null, 2);
      try {
        if (windowObj.navigator && windowObj.navigator.clipboard &&
            typeof windowObj.navigator.clipboard.writeText === 'function') {
          await windowObj.navigator.clipboard.writeText(value);
        } else {
          const textarea = getElement('[data-role="copy-buffer"]');
          if (!textarea || typeof documentObj.execCommand !== 'function') {
            return false;
          }
          textarea.value = value;
          textarea.hidden = false;
          textarea.select();
          const copied = documentObj.execCommand('copy');
          textarea.hidden = true;
          if (!copied) {
            return false;
          }
        }
        const statusElement = getElement('[data-role="status"]');
        if (statusElement) {
          statusElement.textContent = copiedStatus || 'Copied';
        }
        return true;
      } catch (error) {
        return false;
      }
    }

    async function copyLatestReport() {
      const report = latestPanelReport || performanceRecorder.getLatestReport();
      return copyJsonValue(report, 'Copied');
    }

    async function copyStartupSamples() {
      if (!startupSampler) {
        return false;
      }
      const report = startupSampler.getReport();
      const copied = await copyJsonValue(report, `Copied ${report.sampleCount} startups`);
      if (copied) {
        const output = getElement('[data-role="output"]');
        if (output) {
          output.textContent = [
            `Cold-start samples: ${report.sampleCount}`,
            `Ready p50/p95: ${report.summary.readyAtMs.medianMs}/${report.summary.readyAtMs.p95Ms} ms`,
            `LCP p50/p95: ${report.summary.largestContentfulPaintMs.medianMs}/${report.summary.largestContentfulPaintMs.p95Ms} ms`,
            `Longest task p50/p95: ${report.summary.longestTaskMs.medianMs}/${report.summary.longestTaskMs.p95Ms} ms`
          ].join('\n');
        }
      }
      return copied;
    }

    function downloadLatestReport() {
      const report = latestPanelReport || performanceRecorder.getLatestReport();
      const URLClass = windowObj.URL;
      const BlobClass = windowObj.Blob;
      if (!report || !URLClass || typeof URLClass.createObjectURL !== 'function' ||
          typeof BlobClass !== 'function') {
        return false;
      }
      const blob = new BlobClass([JSON.stringify(report, null, 2)], {
        type: 'application/json'
      });
      const url = URLClass.createObjectURL(blob);
      const anchor = documentObj.createElement('a');
      anchor.download = `lumno-newtab-performance-${Date.now()}.json`;
      anchor.href = url;
      anchor.click();
      windowObj.setTimeout(() => URLClass.revokeObjectURL(url), 0);
      return true;
    }

    function clearReport() {
      performanceRecorder.clear();
      performanceCollector.snapshot({ clear: true, maxEntries: 0 });
      latestPanelReport = null;
      renderReport(null);
    }

    function handlePanelClick(event) {
      const target = event && event.target && typeof event.target.closest === 'function'
        ? event.target.closest('[data-action]')
        : null;
      if (!target) {
        return;
      }
      const action = String(target.getAttribute('data-action') || '');
      if (action === 'start') {
        startRecording();
      } else if (action === 'stop') {
        stopRecording();
      } else if (action === 'copy') {
        copyLatestReport();
      } else if (action === 'copy-startups') {
        copyStartupSamples();
      } else if (action === 'download') {
        downloadLatestReport();
      } else if (action === 'clear') {
        clearReport();
      } else if (action === 'clear-startups') {
        if (startupSampler) {
          startupSampler.clear();
          renderReport(latestPanelReport);
        }
      } else if (action === 'close') {
        close();
      }
    }

    function ensureMounted() {
      if (host || !documentObj || !documentObj.documentElement) {
        return host;
      }
      host = documentObj.createElement('div');
      host.setAttribute('data-lumno-performance-panel-host', '');
      host.hidden = true;
      host.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'width:min(360px,calc(100vw - 32px))'
      ].join(';');
      shadowRoot = host.attachShadow({ mode: 'open' });
      shadowRoot.innerHTML = `
        <style>
          :host { all: initial; color-scheme: dark; }
          * { box-sizing: border-box; }
          .panel {
            background: #111827;
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 12px;
            box-shadow: 0 18px 50px rgba(0, 0, 0, 0.34);
            color: #f9fafb;
            font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 14px;
          }
          .header, .row, .actions { align-items: center; display: flex; gap: 8px; }
          .header { justify-content: space-between; margin-bottom: 12px; }
          h2 { font-size: 14px; line-height: 1.2; margin: 0; }
          .status { color: #9ca3af; margin-left: auto; }
          .status[data-active="true"] { color: #34d399; }
          label { color: #d1d5db; display: grid; flex: 1; gap: 4px; }
          select, button {
            background: #1f2937;
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 7px;
            color: #f9fafb;
            font: inherit;
            min-height: 30px;
          }
          select { padding: 4px 8px; width: 100%; }
          button { cursor: pointer; padding: 4px 10px; }
          button:hover { background: #374151; }
          button:focus-visible, select:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
          button:disabled { cursor: default; opacity: 0.45; }
          .close { min-height: 26px; padding: 2px 8px; }
          .instructions { color: #9ca3af; margin: 10px 0; }
          .actions { flex-wrap: wrap; margin-top: 10px; }
          .primary { background: #2563eb; border-color: #3b82f6; }
          .output {
            background: #030712;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: #d1d5db;
            margin: 12px 0 0;
            max-height: 210px;
            overflow: auto;
            padding: 10px;
            white-space: pre-wrap;
          }
          .hint { color: #6b7280; margin: 10px 0 0; }
          [data-role="copy-buffer"] { left: -10000px; position: fixed; top: 0; }
        </style>
        <section class="panel" role="dialog" aria-label="Lumno New Tab performance recorder">
          <div class="header">
            <h2>Lumno Performance</h2>
            <span class="status" data-role="status">Idle</span>
            <button class="close" data-action="close" type="button" aria-label="Close">Close</button>
          </div>
          <div class="row">
            <label>Scenario
              <select data-role="scenario">
                <option value="mixed">Mixed flow</option>
                <option value="search">Search</option>
                <option value="shortcuts">Shortcuts</option>
                <option value="bookmarks">Bookmarks</option>
                <option value="wallpaper">Wallpaper</option>
              </select>
            </label>
            <label>Duration
              <select data-role="duration">
                <option value="10000">10 seconds</option>
                <option value="15000" selected>15 seconds</option>
                <option value="30000">30 seconds</option>
              </select>
            </label>
          </div>
          <p class="instructions" data-role="instructions"></p>
          <div class="actions">
            <button class="primary" data-action="start" type="button">Start</button>
            <button data-action="stop" type="button" disabled>Stop</button>
            <button data-action="copy" type="button">Copy JSON</button>
            <button data-action="copy-startups" type="button">Copy startups</button>
            <button data-action="download" type="button">Download</button>
            <button data-action="clear" type="button">Clear</button>
            <button data-action="clear-startups" type="button">Clear startups</button>
          </div>
          <pre class="output" data-role="output">No recording yet.</pre>
          <textarea data-role="copy-buffer" hidden aria-hidden="true"></textarea>
          <p class="hint">Toggle: Ctrl/⌘ + Alt + Shift + P</p>
        </section>`;
      shadowRoot.addEventListener('click', handlePanelClick);
      const scenarioElement = getElement('[data-role="scenario"]');
      if (scenarioElement) {
        scenarioElement.addEventListener('change', updateScenarioInstructions);
      }
      ['click', 'pointerdown', 'pointerup', 'keydown', 'keyup'].forEach((eventName) => {
        host.addEventListener(eventName, (event) => event.stopPropagation());
      });
      documentObj.documentElement.appendChild(host);
      updateScenarioInstructions();
      renderReport(performanceRecorder.getLatestReport());
      return host;
    }

    function open() {
      ensureMounted();
      if (!host) {
        return getStatus();
      }
      panelOpen = true;
      host.hidden = false;
      host.setAttribute('aria-hidden', 'false');
      renderReport(performanceRecorder.getLatestReport());
      return getStatus();
    }

    function close() {
      panelOpen = false;
      if (host) {
        host.hidden = true;
        host.setAttribute('aria-hidden', 'true');
      }
      return getStatus();
    }

    function toggle() {
      return panelOpen ? close() : open();
    }

    function getStatus() {
      return {
        mounted: Boolean(host),
        open: Boolean(panelOpen && host && !host.hidden),
        recording: performanceRecorder.getStatus(),
        startupSamples: startupSampler
          ? startupSampler.execute({ action: 'status' })
          : null
      };
    }

    function execute(params) {
      const action = String(params && params.action || 'status');
      if (action === 'open') {
        return open();
      }
      if (action === 'close') {
        return close();
      }
      if (action === 'toggle') {
        return toggle();
      }
      if (action === 'status') {
        return getStatus();
      }
      const error = new Error('Unsupported performance panel action.');
      error.code = 'unsupported_panel_action';
      throw error;
    }

    function handleShortcut(event) {
      const keyMatches = String(event && event.key || '').toLowerCase() === 'p' ||
        String(event && event.code || '') === 'KeyP';
      if (!keyMatches || !event.altKey || !event.shiftKey ||
          (!event.ctrlKey && !event.metaKey)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }

    function destroy() {
      windowObj.removeEventListener('keydown', handleShortcut, true);
      if (host) {
        host.remove();
      }
      host = null;
      shadowRoot = null;
      panelOpen = false;
      latestPanelReport = null;
    }

    windowObj.addEventListener('keydown', handleShortcut, true);
    return Object.freeze({ close, destroy, execute, getStatus, open, toggle });
  }

  function getManifest(chromeApi) {
    try {
      if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getManifest === 'function') {
        return chromeApi.runtime.getManifest() || {};
      }
    } catch (error) {
      return {};
    }
    return {};
  }

  function isDevelopmentBridgeEnabled(chromeApi) {
    const manifest = getManifest(chromeApi);
    const externallyConnectable = manifest.externally_connectable || {};
    const clientIds = Array.isArray(externallyConnectable.ids) ? externallyConnectable.ids : [];
    return Boolean(
      String(manifest.key || '').trim() &&
      clientIds.some((id) => OFFICIAL_CODEX_EXTENSION_IDS.includes(String(id || '')))
    );
  }

  function inferSurfaceType(locationLike, documentObj) {
    const bodyType = documentObj && documentObj.body && documentObj.body.dataset
      ? String(documentObj.body.dataset.lumnoPage || '').trim()
      : '';
    if (bodyType) {
      return bodyType;
    }
    let pathname = '';
    let protocol = '';
    try {
      pathname = String(locationLike && locationLike.pathname || '').toLowerCase();
      protocol = String(locationLike && locationLike.protocol || '').toLowerCase();
    } catch (error) {
      pathname = '';
    }
    if (pathname.includes('/newtab/lumno-newtab.html')) {
      return 'newtab-fallback';
    }
    if (pathname === '/newtab.html' || pathname.includes('/newtab/')) {
      return 'newtab';
    }
    if (pathname.includes('/options/')) {
      return 'options';
    }
    if (pathname.includes('/onboarding/')) {
      return 'onboarding';
    }
    return protocol === 'chrome-extension:' ? 'extension-page' : 'overlay';
  }

  function createSurfaceId(windowObj) {
    try {
      if (windowObj && windowObj.crypto && typeof windowObj.crypto.randomUUID === 'function') {
        return windowObj.crypto.randomUUID();
      }
    } catch (error) {
      // Fall through to a local, page-lifetime identifier.
    }
    return `surface-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function stringifyLogValue(value) {
    if (value instanceof Error) {
      return truncate(value.stack || value.message || String(value), 4000);
    }
    if (typeof value === 'string') {
      return truncate(value, 4000);
    }
    if (value == null || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return truncate(JSON.stringify(value), 4000);
    } catch (error) {
      return truncate(String(value), 4000);
    }
  }

  function getElementValue(element) {
    if (!element) {
      return null;
    }
    const tagName = String(element.tagName || '').toLowerCase();
    const inputType = tagName === 'input' ? String(element.type || '').toLowerCase() : '';
    if (inputType === 'password') {
      return '[redacted]';
    }
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return truncate(element.value, 5000);
    }
    if (element.isContentEditable) {
      return truncate(element.textContent || '', 5000);
    }
    return null;
  }

  function getElementAttributes(element) {
    const attributes = {};
    if (!element || !element.attributes) {
      return attributes;
    }
    Array.from(element.attributes).slice(0, 40).forEach((attribute) => {
      const name = String(attribute.name || '').toLowerCase();
      if (!name || name.startsWith('on') || name === 'style' || name === 'srcdoc') {
        return;
      }
      if (
        name === 'id' ||
        name === 'class' ||
        name === 'role' ||
        name === 'name' ||
        name === 'type' ||
        name === 'href' ||
        name === 'src' ||
        name === 'title' ||
        name === 'placeholder' ||
        name === 'tabindex' ||
        name === 'disabled' ||
        name === 'checked' ||
        name === 'selected' ||
        name.startsWith('aria-') ||
        name.startsWith('data-')
      ) {
        const rawValue = String(attribute.value || '');
        attributes[name] = /^(?:data:|blob:)/i.test(rawValue)
          ? '[omitted-url]'
          : truncate(rawValue, 1000);
      }
    });
    return attributes;
  }

  function getElementRect(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      x: Number(rect.x) || 0,
      y: Number(rect.y) || 0,
      width: Number(rect.width) || 0,
      height: Number(rect.height) || 0,
      top: Number(rect.top) || 0,
      right: Number(rect.right) || 0,
      bottom: Number(rect.bottom) || 0,
      left: Number(rect.left) || 0
    };
  }

  function isElementVisible(element, windowObj) {
    if (!element || element.hidden) {
      return false;
    }
    try {
      const style = windowObj && typeof windowObj.getComputedStyle === 'function'
        ? windowObj.getComputedStyle(element)
        : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) {
        return false;
      }
    } catch (error) {
      // Geometry below remains a useful fallback in partial DOM implementations.
    }
    const tagName = String(element.tagName || '').toLowerCase();
    if (tagName === 'html' || tagName === 'body') {
      return true;
    }
    const rect = getElementRect(element);
    return Boolean(rect && (rect.width > 0 || rect.height > 0));
  }

  function describeElement(element, windowObj) {
    if (!element) {
      return null;
    }
    return {
      tag: String(element.tagName || '').toLowerCase(),
      id: String(element.id || ''),
      classes: element.classList ? Array.from(element.classList).slice(0, 30) : [],
      role: String(element.getAttribute && element.getAttribute('role') || ''),
      text: truncate(element.innerText || element.textContent || '', 2000),
      value: getElementValue(element),
      checked: typeof element.checked === 'boolean' ? element.checked : null,
      disabled: Boolean(element.disabled),
      visible: isElementVisible(element, windowObj),
      rect: getElementRect(element),
      attributes: getElementAttributes(element)
    };
  }

  function queryElements(documentObj, selector, maximum) {
    const normalizedSelector = String(selector || '').trim();
    if (!normalizedSelector || normalizedSelector.length > 1000) {
      throw new Error('A non-empty CSS selector of at most 1000 characters is required.');
    }
    const all = Array.from(documentObj.querySelectorAll(normalizedSelector));
    return {
      all,
      selected: all.slice(0, clamp(maximum, 1, MAX_QUERY_RESULTS, 20))
    };
  }

  function resolveActionElement(documentObj, params) {
    const query = queryElements(documentObj, params && params.selector, MAX_QUERY_RESULTS);
    const index = clamp(params && params.index, 0, Math.max(0, query.all.length - 1), 0);
    const element = query.all[index] || null;
    if (!element) {
      const error = new Error('No element matches the requested selector and index.');
      error.code = 'element_not_found';
      throw error;
    }
    return element;
  }

  function setNativeValue(element, value, windowObj) {
    const tagName = String(element.tagName || '').toLowerCase();
    const prototype = tagName === 'input'
      ? windowObj.HTMLInputElement && windowObj.HTMLInputElement.prototype
      : (tagName === 'textarea'
        ? windowObj.HTMLTextAreaElement && windowObj.HTMLTextAreaElement.prototype
        : (tagName === 'select' ? windowObj.HTMLSelectElement && windowObj.HTMLSelectElement.prototype : null));
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(element, value);
      return;
    }
    element.value = value;
  }

  function setNativeChecked(element, checked, windowObj) {
    const prototype = windowObj.HTMLInputElement && windowObj.HTMLInputElement.prototype;
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'checked');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(element, checked);
      return;
    }
    element.checked = checked;
  }

  function dispatchInputEvents(element, windowObj) {
    element.dispatchEvent(new windowObj.Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new windowObj.Event('change', { bubbles: true, composed: true }));
  }

  function performAction(documentObj, windowObj, params) {
    const action = String(params && params.action || '').trim();
    const element = resolveActionElement(documentObj, params);
    if (action === 'click') {
      if (typeof element.click !== 'function') {
        throw new Error('The target element does not support click().');
      }
      element.click();
    } else if (action === 'focus') {
      if (typeof element.focus !== 'function') {
        throw new Error('The target element does not support focus().');
      }
      element.focus({ preventScroll: Boolean(params.preventScroll) });
    } else if (action === 'scrollIntoView') {
      if (typeof element.scrollIntoView !== 'function') {
        throw new Error('The target element does not support scrollIntoView().');
      }
      element.scrollIntoView({
        behavior: 'instant',
        block: String(params.block || 'center'),
        inline: String(params.inline || 'nearest')
      });
    } else if (action === 'fill') {
      const tagName = String(element.tagName || '').toLowerCase();
      if (tagName !== 'input' && tagName !== 'textarea' && !element.isContentEditable) {
        throw new Error('fill is only supported for inputs, textareas, and contenteditable elements.');
      }
      const value = truncate(params.value, 100000);
      if (element.isContentEditable && tagName !== 'input' && tagName !== 'textarea') {
        element.textContent = value;
      } else {
        setNativeValue(element, value, windowObj);
      }
      dispatchInputEvents(element, windowObj);
    } else if (action === 'setChecked') {
      const tagName = String(element.tagName || '').toLowerCase();
      const inputType = String(element.type || '').toLowerCase();
      if (tagName !== 'input' || (inputType !== 'checkbox' && inputType !== 'radio')) {
        throw new Error('setChecked is only supported for checkbox and radio inputs.');
      }
      const checked = Boolean(params.checked);
      if (element.checked !== checked) {
        setNativeChecked(element, checked, windowObj);
        dispatchInputEvents(element, windowObj);
      }
    } else if (action === 'selectOption') {
      if (String(element.tagName || '').toLowerCase() !== 'select') {
        throw new Error('selectOption is only supported for select elements.');
      }
      setNativeValue(element, String(params.value == null ? '' : params.value), windowObj);
      dispatchInputEvents(element, windowObj);
    } else if (action === 'key') {
      const init = {
        key: String(params.key || ''),
        code: String(params.code || ''),
        altKey: Boolean(params.altKey),
        ctrlKey: Boolean(params.ctrlKey),
        metaKey: Boolean(params.metaKey),
        shiftKey: Boolean(params.shiftKey),
        bubbles: true,
        cancelable: true,
        composed: true
      };
      element.dispatchEvent(new windowObj.KeyboardEvent('keydown', init));
      element.dispatchEvent(new windowObj.KeyboardEvent('keyup', init));
    } else {
      const error = new Error('Unsupported surface action.');
      error.code = 'unsupported_action';
      throw error;
    }
    return describeElement(element, windowObj);
  }

  function sanitizeSnapshotClone(rootElement) {
    const clone = rootElement.cloneNode(true);
    if (!clone.querySelectorAll) {
      return clone;
    }
    const omittedSelector = 'script, style, noscript, template';
    if (typeof clone.matches === 'function' && clone.matches(omittedSelector)) {
      const placeholder = clone.ownerDocument.createElement('span');
      placeholder.setAttribute(
        'data-lumno-omitted-element',
        String(clone.tagName || '').toLowerCase()
      );
      placeholder.textContent = '[omitted-element]';
      return placeholder;
    }
    clone.querySelectorAll(omittedSelector).forEach((element) => element.remove());
    [clone, ...clone.querySelectorAll('*')].forEach((element) => {
      Array.from(element.attributes || []).forEach((attribute) => {
        const name = String(attribute.name || '').toLowerCase();
        const value = String(attribute.value || '');
        if (name.startsWith('on') || name === 'srcdoc') {
          element.removeAttribute(attribute.name);
          return;
        }
        if ((name === 'src' || name === 'href') && /^(?:data:|blob:)/i.test(value)) {
          element.setAttribute(attribute.name, '[omitted-url]');
        }
      });
      if (String(element.tagName || '').toLowerCase() === 'input' &&
          String(element.type || '').toLowerCase() === 'password') {
        element.setAttribute('value', '[redacted]');
      }
    });
    return clone;
  }

  function createSnapshot(documentObj, windowObj, params, surfaceType) {
    const selector = String(params && params.selector || 'body').trim();
    let rootElement = null;
    try {
      rootElement = selector === ':document' ? documentObj.documentElement : documentObj.querySelector(selector);
    } catch (error) {
      const invalidError = new Error('The snapshot selector is not valid CSS.');
      invalidError.code = 'invalid_selector';
      throw invalidError;
    }
    if (!rootElement) {
      const error = new Error('The snapshot root element was not found.');
      error.code = 'element_not_found';
      throw error;
    }
    const clone = sanitizeSnapshotClone(rootElement);
    const maxMarkup = clamp(params && params.maxMarkup, 1000, 500000, 120000);
    const maxText = clamp(params && params.maxText, 1000, 100000, 40000);
    const markup = truncate(clone.outerHTML || '', maxMarkup);
    const text = truncate(clone.innerText || clone.textContent || '', maxText);
    return {
      surfaceType,
      url: String(windowObj.location && windowObj.location.href || ''),
      title: String(documentObj.title || ''),
      readyState: String(documentObj.readyState || ''),
      viewport: {
        width: Number(windowObj.innerWidth) || 0,
        height: Number(windowObj.innerHeight) || 0,
        devicePixelRatio: Number(windowObj.devicePixelRatio) || 1
      },
      selector,
      truncated: markup.endsWith('…') || text.endsWith('…'),
      markup,
      text,
      activeElement: describeElement(documentObj.activeElement, windowObj)
    };
  }

  function createSurfaceAgent(options) {
    const agentOptions = options && typeof options === 'object' ? options : {};
    const windowObj = agentOptions.windowObj;
    const documentObj = agentOptions.documentObj;
    const chromeApi = agentOptions.chromeApi;
    if (!windowObj || !documentObj || !chromeApi || !chromeApi.runtime) {
      return null;
    }
    if (!isDevelopmentBridgeEnabled(chromeApi)) {
      return null;
    }
    if (windowObj.__lumnoCodexDebugSurfaceAgentV1) {
      return windowObj.__lumnoCodexDebugSurfaceAgentV1;
    }
    if (typeof chromeApi.runtime.connect !== 'function') {
      return null;
    }

    const surfaceId = createSurfaceId(windowObj);
    const surfaceType = inferSurfaceType(windowObj.location, documentObj);
    const startupProfiler = createStartupProfiler(windowObj, surfaceType);
    if (startupProfiler) {
      windowObj.__lumnoCodexDebugStartupProfilerV1 = startupProfiler;
    }
    const performanceCollector = createPerformanceCollector(windowObj, documentObj, surfaceType);
    const performanceRecorder = createPerformanceRecorder(
      windowObj,
      performanceCollector,
      surfaceType
    );
    const startupSampler = createStartupSampler(
      windowObj,
      documentObj,
      performanceCollector,
      surfaceType
    );
    const performancePanel = surfaceType === 'newtab'
      ? createPerformancePanel(
        windowObj,
        documentObj,
        performanceRecorder,
        performanceCollector,
        startupSampler
      )
      : null;
    const logs = [];
    let port = null;
    let reconnectTimer = null;
    let closed = false;

    function pushLog(level, values) {
      logs.push({
        at: Date.now(),
        level,
        message: Array.from(values || []).map(stringifyLogValue).join(' ')
      });
      if (logs.length > MAX_LOG_ENTRIES) {
        logs.splice(0, logs.length - MAX_LOG_ENTRIES);
      }
    }

    function captureConsole() {
      const consoleObj = windowObj.console;
      if (!consoleObj || consoleObj.__lumnoCodexDebugWrapped) {
        return;
      }
      ['warn', 'error'].forEach((level) => {
        const original = typeof consoleObj[level] === 'function' ? consoleObj[level].bind(consoleObj) : null;
        if (!original) {
          return;
        }
        consoleObj[level] = function(...args) {
          pushLog(level, args);
          return original(...args);
        };
      });
      try {
        Object.defineProperty(consoleObj, '__lumnoCodexDebugWrapped', {
          value: true,
          configurable: false,
          enumerable: false
        });
      } catch (error) {
        consoleObj.__lumnoCodexDebugWrapped = true;
      }
      windowObj.addEventListener('error', (event) => {
        pushLog('error', [event && (event.error || event.message) || 'Window error']);
      }, true);
      windowObj.addEventListener('unhandledrejection', (event) => {
        pushLog('error', [event && event.reason || 'Unhandled promise rejection']);
      }, true);
    }

    function createRegistration(type) {
      return {
        channel: CHANNEL,
        version: VERSION,
        type: type || 'surface.register',
        surfaceId,
        url: String(windowObj.location && windowObj.location.href || ''),
        title: String(documentObj.title || ''),
        readyState: String(documentObj.readyState || ''),
        pageType: surfaceType
      };
    }

    function postRegistration(type) {
      if (!port) {
        return;
      }
      const message = createRegistration(type);
      try {
        port.postMessage(message);
      } catch (error) {
        // The disconnect listener schedules reconnection while the page remains alive.
      }
    }

    function createSuccess(result) {
      return { ok: true, result };
    }

    function createFailure(error) {
      return {
        ok: false,
        error: {
          code: error && error.code ? String(error.code) : 'surface_error',
          message: error && error.message ? String(error.message) : 'The Lumno debug surface request failed.'
        }
      };
    }

    function waitFor(params) {
      const timeoutMs = clamp(params && params.timeoutMs, 0, 3000, 2000);
      const state = String(params && params.state || 'attached');
      const startedAt = Date.now();
      return new Promise((resolve, reject) => {
        function check() {
          let query = null;
          try {
            query = queryElements(documentObj, params && params.selector, 1);
          } catch (error) {
            reject(error);
            return;
          }
          const element = query.all[0] || null;
          const matched = state === 'detached'
            ? !element
            : (state === 'visible' ? isElementVisible(element, windowObj) : Boolean(element));
          if (matched) {
            resolve({
              state,
              elapsedMs: Date.now() - startedAt,
              element: describeElement(element, windowObj)
            });
            return;
          }
          if (Date.now() - startedAt >= timeoutMs) {
            const error = new Error('Timed out waiting for the requested element state.');
            error.code = 'wait_timeout';
            reject(error);
            return;
          }
          windowObj.setTimeout(check, 50);
        }
        check();
      });
    }

    function waitForAnimationFrames(params) {
      const frameCount = clamp(params && params.frames, 1, 4, 2);
      const timeoutMs = clamp(params && params.timeoutMs, 100, 2000, 750);
      const startedAt = getPerformanceNow(windowObj);
      let frameRequestId = null;
      let cancelPendingFrame = null;
      let timer = null;
      let settled = false;
      let completedFrames = 0;
      let firstFrameMs = null;

      return new Promise((resolve) => {
        function finish(timedOut) {
          if (settled) {
            return;
          }
          settled = true;
          if (timer !== null) {
            windowObj.clearTimeout(timer);
            timer = null;
          }
          if (cancelPendingFrame) {
            cancelPendingFrame();
            cancelPendingFrame = null;
            frameRequestId = null;
          }
          const elapsedMs = roundMetric(getPerformanceNow(windowObj) - startedAt);
          resolve({
            requestedFrames: frameCount,
            completedFrames,
            timedOut,
            elapsedMs,
            firstFrameMs,
            averageFrameMs: completedFrames > 0
              ? roundMetric(elapsedMs / completedFrames)
              : null
          });
        }

        function onFrame() {
          frameRequestId = null;
          cancelPendingFrame = null;
          if (settled) {
            return;
          }
          completedFrames += 1;
          if (firstFrameMs === null) {
            firstFrameMs = roundMetric(getPerformanceNow(windowObj) - startedAt);
          }
          if (completedFrames >= frameCount) {
            finish(false);
            return;
          }
          requestFrame();
        }

        function requestFrame() {
          if (typeof windowObj.requestAnimationFrame === 'function') {
            frameRequestId = windowObj.requestAnimationFrame(onFrame);
            cancelPendingFrame = () => {
              if (typeof windowObj.cancelAnimationFrame === 'function') {
                windowObj.cancelAnimationFrame(frameRequestId);
              }
            };
            return;
          }
          frameRequestId = windowObj.setTimeout(onFrame, 16);
          cancelPendingFrame = () => windowObj.clearTimeout(frameRequestId);
        }

        timer = windowObj.setTimeout(() => finish(true), timeoutMs);
        requestFrame();
      });
    }

    async function profileAction(params) {
      const baseline = performanceCollector.getBaseline();
      const startedAt = getPerformanceNow(windowObj);
      const element = performAction(documentObj, windowObj, params || {});
      const actionCompletedAt = getPerformanceNow(windowObj);
      const presentation = await waitForAnimationFrames(params || {});
      const completedAt = getPerformanceNow(windowObj);
      const syncDurationMs = roundMetric(actionCompletedAt - startedAt);
      return {
        action: String(params && params.action || ''),
        syncDurationMs,
        interactionToFirstFrameMs: presentation.firstFrameMs === null
          ? null
          : roundMetric(syncDurationMs + presentation.firstFrameMs),
        interactionToSettledFramesMs: roundMetric(completedAt - startedAt),
        presentation,
        performanceDelta: performanceCollector.getDelta(baseline),
        element,
        activeElement: describeElement(documentObj.activeElement, windowObj)
      };
    }

    function executeRequest(method, params) {
      if (method === 'surface.snapshot') {
        return createSnapshot(documentObj, windowObj, params, surfaceType);
      }
      if (method === 'surface.query') {
        const query = queryElements(documentObj, params && params.selector, params && params.limit);
        return {
          selector: String(params.selector),
          count: query.all.length,
          elements: query.selected.map((element) => describeElement(element, windowObj))
        };
      }
      if (method === 'surface.action') {
        const element = performAction(documentObj, windowObj, params || {});
        return {
          action: String(params && params.action || ''),
          element,
          activeElement: describeElement(documentObj.activeElement, windowObj)
        };
      }
      if (method === 'surface.profileAction') {
        return profileAction(params || {});
      }
      if (method === 'surface.performance') {
        return performanceCollector.snapshot(params || {});
      }
      if (method === 'surface.performanceRecording') {
        return performanceRecorder.execute(params || {});
      }
      if (method === 'surface.startupSamples') {
        if (!startupSampler) {
          const error = new Error('Startup samples are only available on the New Tab surface.');
          error.code = 'startup_samples_unavailable';
          throw error;
        }
        return startupSampler.execute(params || {});
      }
      if (method === 'surface.performancePanel') {
        if (!performancePanel) {
          const error = new Error('The performance panel is only available on the New Tab surface.');
          error.code = 'panel_unavailable';
          throw error;
        }
        return performancePanel.execute(params || {});
      }
      if (method === 'surface.waitFor') {
        return waitFor(params || {});
      }
      if (method === 'surface.logs') {
        const result = { entries: logs.slice() };
        if (params && params.clear) {
          logs.splice(0, logs.length);
        }
        return result;
      }
      const error = new Error('The requested surface method is not supported.');
      error.code = 'unknown_method';
      throw error;
    }

    function respondToRequest(request) {
      Promise.resolve()
        .then(() => executeRequest(String(request.method || ''), request.params || {}))
        .then((result) => createSuccess(result))
        .catch((error) => createFailure(error))
        .then((response) => {
          if (!port) {
            return;
          }
          try {
            port.postMessage({
              channel: CHANNEL,
              version: VERSION,
              type: 'surface.response',
              requestId: String(request.requestId || ''),
              response
            });
          } catch (error) {
            // The background timeout reports a disconnected surface to the client.
          }
        });
    }

    function scheduleReconnect() {
      if (closed || reconnectTimer) {
        return;
      }
      reconnectTimer = windowObj.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 500);
    }

    function connect() {
      if (closed || port) {
        return;
      }
      try {
        port = chromeApi.runtime.connect({ name: SURFACE_PORT_NAME });
      } catch (error) {
        scheduleReconnect();
        return;
      }
      if (!port || !port.onMessage || !port.onDisconnect) {
        port = null;
        scheduleReconnect();
        return;
      }
      port.onMessage.addListener((request) => {
        if (!request || request.channel !== CHANNEL || request.version !== VERSION ||
            request.type !== 'surface.request') {
          return;
        }
        respondToRequest(request);
      });
      port.onDisconnect.addListener(() => {
        port = null;
        scheduleReconnect();
      });
      postRegistration('surface.register');
    }

    const agent = Object.freeze({
      surfaceId,
      surfaceType,
      describeElement: (element) => describeElement(element, windowObj),
      executeRequest,
      getPerformanceSnapshot: (params) => performanceCollector.snapshot(params || {}),
      getPerformanceRecordingStatus: performanceRecorder.getStatus,
      getStartupPerformanceReport: startupSampler
        ? startupSampler.getReport
        : () => null,
      startupProfiler,
      getLogs: () => logs.slice()
    });
    windowObj.__lumnoCodexDebugSurfaceAgentV1 = agent;
    if (documentObj.documentElement && documentObj.documentElement.dataset) {
      documentObj.documentElement.dataset.lumnoCodexDebugReady = 'true';
      documentObj.documentElement.dataset.lumnoCodexDebugSurface = surfaceType;
    }
    captureConsole();
    windowObj.addEventListener('load', () => postRegistration('surface.update'), { once: true });
    windowObj.addEventListener('pagehide', () => {
      closed = true;
      if (performancePanel) {
        performancePanel.destroy();
      }
      performanceRecorder.destroy();
      if (startupSampler) {
        startupSampler.destroy();
      }
      performanceCollector.destroy();
      if (windowObj.__lumnoCodexDebugStartupProfilerV1 === startupProfiler) {
        delete windowObj.__lumnoCodexDebugStartupProfilerV1;
      }
      if (reconnectTimer) {
        windowObj.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (port && typeof port.disconnect === 'function') {
        try {
          port.disconnect();
        } catch (error) {
          // Page teardown is already in progress.
        }
      }
      port = null;
    }, { once: true });
    connect();
    return agent;
  }

  function start(options) {
    return createSurfaceAgent(options);
  }

  return Object.freeze({
    CHANNEL,
    VERSION,
    SURFACE_PORT_NAME,
    OFFICIAL_CODEX_EXTENSION_IDS,
    createPerformanceCollector,
    createPerformancePanel,
    createPerformanceRecorder,
    createStartupSampler,
    createStartupProfiler,
    createSurfaceAgent,
    describeElement,
    inferSurfaceType,
    isDevelopmentBridgeEnabled,
    start
  });
});
