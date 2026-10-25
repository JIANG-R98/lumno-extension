// The Toast the in-page surfaces share: short result messages, and loading
// messages for tasks that take a moment, shown only once the task has run
// past a short delay.
const TOAST_BOOTSTRAP_STYLES: Readonly<Record<string, string>> = Object.freeze({
  opacity: '0',
  'pointer-events': 'none',
  transform: 'translateX(-50%) translateY(-10px)',
  transition: 'none'
});

// The toast element, or a test double; the optional members may be missing.
interface ToastElement {
  style: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'>;
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute?(name: string): void;
  replaceChildren?(...nodes: Array<Node | string>): void;
  ownerDocument?: Document | null;
}

// The stylesheet the toast waits for before it may animate.
interface ToastStylesheet {
  sheet?: unknown;
  addEventListener?(type: 'load', listener: () => void): void;
  removeEventListener?(type: 'load', listener: () => void): void;
}

// The page window, or a test double with its timers.
interface ToastWindow {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timerId: number): void;
  requestAnimationFrame?(callback: () => void): number;
  cancelAnimationFrame?(frameId: number): void;
}

interface ToastStyleGateOptions {
  windowObj?: ToastWindow | null;
  stylesheetElement?: ToastStylesheet | null;
}

interface ToastStyleGate {
  destroy(): void;
  isReady(): boolean;
  markReady(): void;
}

interface ToastControllerOptions {
  windowObj?: ToastWindow | null;
  // How long a message stays, in milliseconds.
  duration?: number;
  // How long a task runs before its loading message shows.
  loadingDelay?: number;
}

interface ToastShowOptions {
  error?: boolean;
  duration?: number;
}

interface ToastBeginOptions {
  delay?: number;
}

// A running task's loading message; finishing it may show a result message.
interface ToastTask {
  update(message: string): void;
  done(message?: string, options?: ToastShowOptions | null): void;
  fail(message?: string, options?: ToastShowOptions | null): void;
  cancel(): void;
}

interface ToastController {
  show(message: string, options?: ToastShowOptions | null): void;
  hide(): void;
  begin(message: string, options?: ToastBeginOptions | null): ToastTask;
  destroy(): void;
}

function readDelay(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function getWindow(windowObj: ToastWindow | null | undefined): ToastWindow {
  return windowObj || globalThis;
}

// Keeps the toast hidden and still until its stylesheet has loaded, so it
// does not flash unstyled or play its entry motion on page load.
function createToastStyleGate(
  toastElement: Pick<ToastElement, 'style'> | null | undefined,
  options?: ToastStyleGateOptions | null
): Readonly<ToastStyleGate> {
  if (!toastElement) {
    return Object.freeze({
      destroy() {},
      isReady() { return false; },
      markReady() {}
    });
  }
  const element = toastElement;
  const config: ToastStyleGateOptions = options || {};
  const win = getWindow(config.windowObj);
  const stylesheetElement = config.stylesheetElement || null;
  const requestFrame = (callback: () => void): number => (win.requestAnimationFrame
    ? win.requestAnimationFrame(callback)
    : win.setTimeout(callback, 16));
  const cancelFrame = (frameId: number): void => {
    if (win.cancelAnimationFrame) {
      win.cancelAnimationFrame(frameId);
    } else {
      win.clearTimeout(frameId);
    }
  };
  let ready = false;
  let destroyed = false;
  let frameA: number | null = null;
  let frameB: number | null = null;
  let listeningForLoad = false;

  Object.keys(TOAST_BOOTSTRAP_STYLES).forEach((property) => {
    element.style.setProperty(property, TOAST_BOOTSTRAP_STYLES[property]);
  });

  function stopListeningForLoad(): void {
    if (!listeningForLoad || !stylesheetElement || !stylesheetElement.removeEventListener) {
      return;
    }
    stylesheetElement.removeEventListener('load', markReady);
    listeningForLoad = false;
  }

  function releaseBootstrapStyles(): void {
    frameB = null;
    if (destroyed) {
      return;
    }
    Object.keys(TOAST_BOOTSTRAP_STYLES).forEach((property) => {
      element.style.removeProperty(property);
    });
  }

  function markReady(): void {
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

  if (stylesheetElement && stylesheetElement.addEventListener) {
    stylesheetElement.addEventListener('load', markReady);
    listeningForLoad = true;
  }
  try {
    if (stylesheetElement && stylesheetElement.sheet) {
      markReady();
    }
  } catch (_error) {
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

const NOOP_TASK: Readonly<ToastTask> = Object.freeze({ update() {}, done() {}, fail() {}, cancel() {} });

interface PendingTask {
  text: string;
  visible: boolean;
  delayTimer: number;
}

function createToastController(
  toastElement: ToastElement | null | undefined,
  options?: ToastControllerOptions | null
): Readonly<ToastController> {
  if (!toastElement) {
    return Object.freeze({
      show() {},
      hide() {},
      begin() { return NOOP_TASK; },
      destroy() {}
    });
  }
  const element = toastElement;
  const config: ToastControllerOptions = options || {};
  const win = getWindow(config.windowObj);
  const defaultDuration = readDelay(config.duration, 2200);
  const loadingDelay = readDelay(config.loadingDelay, 240);
  // Tasks still running, oldest first. The newest one that has passed its delay
  // owns the Toast whenever no result message is on screen.
  const tasks: PendingTask[] = [];
  let timer = 0;
  let messageShowing = false;
  let destroyed = false;

  function clearTimer(): void {
    if (timer) {
      win.clearTimeout(timer);
    }
    timer = 0;
  }

  function render(text: string, tone: 'loading' | 'error' | ''): void {
    const doc = element.ownerDocument;
    if (tone === 'loading' && doc && element.replaceChildren) {
      const spinner = doc.createElement('span');
      spinner.className = 'x-lumno-toast-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      element.replaceChildren(spinner, doc.createTextNode(text));
    } else {
      element.textContent = text;
    }
    if (tone) {
      element.setAttribute('data-tone', tone);
    } else if (element.removeAttribute) {
      element.removeAttribute('data-tone');
    } else {
      element.setAttribute('data-tone', '');
    }
    element.setAttribute('data-show', 'true');
  }

  function visibleTask(): PendingTask | null {
    for (let index = tasks.length - 1; index >= 0; index -= 1) {
      if (tasks[index].visible) {
        return tasks[index];
      }
    }
    return null;
  }

  // Falls back to the running task once a result message is gone.
  function settle(): void {
    clearTimer();
    messageShowing = false;
    if (destroyed) {
      return;
    }
    const task = visibleTask();
    if (task) {
      render(task.text, 'loading');
    } else {
      element.setAttribute('data-show', 'false');
    }
  }

  function show(message: string, showOptions?: ToastShowOptions | null): void {
    const text = String(message || '');
    if (destroyed || !text) {
      return;
    }
    const nextOptions: ToastShowOptions = showOptions || {};
    clearTimer();
    messageShowing = true;
    render(text, nextOptions.error ? 'error' : '');
    const duration = readDelay(nextOptions.duration, defaultDuration);
    if (duration > 0) {
      timer = win.setTimeout(() => {
        timer = 0;
        settle();
      }, duration);
    }
  }

  function begin(message: string, beginOptions?: ToastBeginOptions | null): Readonly<ToastTask> {
    if (destroyed) {
      return NOOP_TASK;
    }
    const nextOptions: ToastBeginOptions = beginOptions || {};
    const delay = readDelay(nextOptions.delay, loadingDelay);
    const task: PendingTask = { text: String(message || ''), visible: false, delayTimer: 0 };
    let finished = false;

    function isOnScreen(): boolean {
      return task.visible && !messageShowing && visibleTask() === task;
    }

    function reveal(): void {
      task.delayTimer = 0;
      if (finished || destroyed) {
        return;
      }
      task.visible = true;
      if (isOnScreen()) {
        render(task.text, 'loading');
      }
    }

    function finish(resultMessage?: string, resultOptions?: ToastShowOptions | null): void {
      if (finished) {
        return;
      }
      finished = true;
      if (task.delayTimer) {
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
    if (delay > 0) {
      task.delayTimer = win.setTimeout(reveal, delay);
    } else {
      reveal();
    }

    return Object.freeze({
      update(nextMessage: string) {
        if (finished) {
          return;
        }
        task.text = String(nextMessage || '');
        if (isOnScreen()) {
          render(task.text, 'loading');
        }
      },
      done(resultMessage?: string, resultOptions?: ToastShowOptions | null) {
        finish(resultMessage, resultOptions);
      },
      fail(resultMessage?: string, resultOptions?: ToastShowOptions | null) {
        finish(resultMessage, { ...resultOptions, error: true });
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
        if (task.delayTimer) {
          win.clearTimeout(task.delayTimer);
        }
      });
      settle();
      destroyed = true;
    }
  });
}

export type {
  ToastBeginOptions,
  ToastController,
  ToastControllerOptions,
  ToastElement,
  ToastShowOptions,
  ToastStyleGate,
  ToastStyleGateOptions,
  ToastStylesheet,
  ToastTask,
  ToastWindow
};
export { createToastController, createToastStyleGate };
export const implementation = 'dom';
