(function(root) {
  if (root.LumnoToast &&
      typeof root.LumnoToast.createToastController === 'function' &&
      typeof root.LumnoToast.createToastStyleGate === 'function') {
    return;
  }

  const TOAST_BOOTSTRAP_STYLES = Object.freeze({
    opacity: '0',
    'pointer-events': 'none',
    transform: 'translateX(-50%) translateY(-10px)',
    transition: 'none'
  });

  function createToastStyleGate(toastElement, options) {
    if (!toastElement || !toastElement.style) {
      return Object.freeze({
        destroy() {},
        isReady() { return false; },
        markReady() {}
      });
    }
    const config = options || {};
    const win = config.windowObj || root.window || root;
    const stylesheetElement = config.stylesheetElement || null;
    const requestFrame = win && typeof win.requestAnimationFrame === 'function'
      ? win.requestAnimationFrame.bind(win)
      : (callback) => win.setTimeout(callback, 16);
    const cancelFrame = win && typeof win.cancelAnimationFrame === 'function'
      ? win.cancelAnimationFrame.bind(win)
      : (frameId) => win.clearTimeout(frameId);
    let ready = false;
    let destroyed = false;
    let frameA = null;
    let frameB = null;
    let listeningForLoad = false;

    Object.keys(TOAST_BOOTSTRAP_STYLES).forEach((property) => {
      toastElement.style.setProperty(
        property,
        TOAST_BOOTSTRAP_STYLES[property]
      );
    });

    function stopListeningForLoad() {
      if (!listeningForLoad || !stylesheetElement ||
          typeof stylesheetElement.removeEventListener !== 'function') {
        return;
      }
      stylesheetElement.removeEventListener('load', markReady);
      listeningForLoad = false;
    }

    function releaseBootstrapStyles() {
      frameB = null;
      if (destroyed) {
        return;
      }
      Object.keys(TOAST_BOOTSTRAP_STYLES).forEach((property) => {
        toastElement.style.removeProperty(property);
      });
    }

    function markReady() {
      if (destroyed || ready) {
        return;
      }
      ready = true;
      stopListeningForLoad();
      frameA = requestFrame(() => {
        frameA = null;
        if (destroyed) {
          return;
        }
        frameB = requestFrame(releaseBootstrapStyles);
      });
    }

    if (stylesheetElement && typeof stylesheetElement.addEventListener === 'function') {
      stylesheetElement.addEventListener('load', markReady);
      listeningForLoad = true;
    }
    try {
      if (stylesheetElement && stylesheetElement.sheet) {
        markReady();
      }
    } catch (error) {
      // Keep the bootstrap styles until the stylesheet emits its load event.
    }

    return Object.freeze({
      destroy() {
        if (destroyed) {
          return;
        }
        destroyed = true;
        stopListeningForLoad();
        if (frameA !== null) {
          cancelFrame(frameA);
          frameA = null;
        }
        if (frameB !== null) {
          cancelFrame(frameB);
          frameB = null;
        }
      },
      isReady() {
        return ready;
      },
      markReady
    });
  }

  const NOOP_TASK = Object.freeze({ update() {}, done() {}, fail() {}, cancel() {} });

  function createToastController(toastElement, options) {
    if (!toastElement) {
      return Object.freeze({
        show() {},
        hide() {},
        begin() { return NOOP_TASK; },
        destroy() {}
      });
    }
    const config = options || {};
    const win = config.windowObj || root.window || root;
    const defaultDuration = Number.isFinite(Number(config.duration))
      ? Math.max(0, Number(config.duration))
      : 2200;
    const loadingDelay = Number.isFinite(Number(config.loadingDelay))
      ? Math.max(0, Number(config.loadingDelay))
      : 240;
    // Tasks still running, oldest first. The newest one that has passed its delay
    // owns the Toast whenever no result message is on screen.
    const tasks = [];
    let timer = 0;
    let messageShowing = false;
    let destroyed = false;

    function clearTimer() {
      if (timer && win && typeof win.clearTimeout === 'function') {
        win.clearTimeout(timer);
      }
      timer = 0;
    }

    function render(text, tone) {
      const doc = toastElement.ownerDocument;
      if (tone === 'loading' && doc && typeof toastElement.replaceChildren === 'function') {
        const spinner = doc.createElement('span');
        spinner.className = 'x-lumno-toast-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        toastElement.replaceChildren(spinner, doc.createTextNode(text));
      } else {
        toastElement.textContent = text;
      }
      if (tone) {
        toastElement.setAttribute('data-tone', tone);
      } else if (typeof toastElement.removeAttribute === 'function') {
        toastElement.removeAttribute('data-tone');
      } else {
        toastElement.setAttribute('data-tone', '');
      }
      toastElement.setAttribute('data-show', 'true');
    }

    function visibleTask() {
      for (let index = tasks.length - 1; index >= 0; index -= 1) {
        if (tasks[index].visible) {
          return tasks[index];
        }
      }
      return null;
    }

    // Falls back to the running task once a result message is gone.
    function settle() {
      clearTimer();
      messageShowing = false;
      if (destroyed) {
        return;
      }
      const task = visibleTask();
      if (task) {
        render(task.text, 'loading');
      } else {
        toastElement.setAttribute('data-show', 'false');
      }
    }

    function show(message, showOptions) {
      const text = String(message || '');
      if (destroyed || !text) {
        return;
      }
      const nextOptions = showOptions || {};
      clearTimer();
      messageShowing = true;
      render(text, nextOptions.error ? 'error' : '');
      const duration = Number.isFinite(Number(nextOptions.duration))
        ? Math.max(0, Number(nextOptions.duration))
        : defaultDuration;
      if (duration > 0 && win && typeof win.setTimeout === 'function') {
        timer = win.setTimeout(() => {
          timer = 0;
          settle();
        }, duration);
      }
    }

    function begin(message, beginOptions) {
      if (destroyed) {
        return NOOP_TASK;
      }
      const nextOptions = beginOptions || {};
      const delay = Number.isFinite(Number(nextOptions.delay))
        ? Math.max(0, Number(nextOptions.delay))
        : loadingDelay;
      const task = { text: String(message || ''), visible: false, delayTimer: 0 };
      let finished = false;

      function isOnScreen() {
        return task.visible && !messageShowing && visibleTask() === task;
      }

      function reveal() {
        task.delayTimer = 0;
        if (finished || destroyed) {
          return;
        }
        task.visible = true;
        if (isOnScreen()) {
          render(task.text, 'loading');
        }
      }

      function finish(resultMessage, resultOptions) {
        if (finished) {
          return;
        }
        finished = true;
        if (task.delayTimer && win && typeof win.clearTimeout === 'function') {
          win.clearTimeout(task.delayTimer);
        }
        const wasOnScreen = isOnScreen();
        tasks.splice(tasks.indexOf(task), 1);
        if (resultMessage) {
          show(resultMessage, resultOptions);
        } else if (wasOnScreen) {
          settle();
        }
      }

      tasks.push(task);
      if (delay > 0 && win && typeof win.setTimeout === 'function') {
        task.delayTimer = win.setTimeout(reveal, delay);
      } else {
        reveal();
      }

      return Object.freeze({
        update(nextMessage) {
          if (finished) {
            return;
          }
          task.text = String(nextMessage || '');
          if (isOnScreen()) {
            render(task.text, 'loading');
          }
        },
        done(resultMessage, resultOptions) {
          finish(resultMessage, resultOptions);
        },
        fail(resultMessage, resultOptions) {
          finish(resultMessage, Object.assign({}, resultOptions, { error: true }));
        },
        cancel() {
          finish('');
        }
      });
    }

    return Object.freeze({
      show,
      hide: settle,
      begin,
      destroy() {
        if (destroyed) {
          return;
        }
        tasks.splice(0).forEach((task) => {
          if (task.delayTimer && win && typeof win.clearTimeout === 'function') {
            win.clearTimeout(task.delayTimer);
          }
        });
        settle();
        destroyed = true;
      }
    });
  }

  root.LumnoToast = Object.freeze({
    implementation: 'dom',
    createToastController,
    createToastStyleGate
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
