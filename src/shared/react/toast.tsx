import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export interface ToastOptions {
  windowObj?: Pick<Window, 'setTimeout' | 'clearTimeout'>;
  duration?: number;
  // How long a task runs before its loading Toast appears, so quick ones only show their result.
  loadingDelay?: number;
}

export interface ToastShowOptions {
  error?: boolean;
  duration?: number;
}

export interface ToastTask {
  update(message: unknown): void;
  done(message?: unknown, options?: ToastShowOptions): void;
  fail(message?: unknown, options?: ToastShowOptions): void;
  cancel(): void;
}

export interface ToastController {
  show(message: unknown, options?: ToastShowOptions): void;
  hide(): void;
  begin(message: unknown, options?: { delay?: number }): ToastTask;
  destroy(): void;
}

type ToastTone = '' | 'error' | 'loading';

interface PendingTask {
  text: string;
  visible: boolean;
  delayTimer: number;
}

const NOOP_TASK: ToastTask = Object.freeze({
  update() {},
  done() {},
  fail() {},
  cancel() {}
});

function toDuration(value: unknown, fallback: number): number {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
}

export function createToastController(
  toastElement: HTMLElement | null,
  options: ToastOptions = {}
): ToastController {
  if (!toastElement) {
    return {
      show() {},
      hide() {},
      begin() {
        return NOOP_TASK;
      },
      destroy() {}
    };
  }
  const host: HTMLElement = toastElement;
  const windowObj = options.windowObj || window;
  const setTimer = windowObj.setTimeout.bind(windowObj);
  const clearTimer = windowObj.clearTimeout.bind(windowObj);
  const defaultDuration = toDuration(options.duration, 2200);
  const loadingDelay = toDuration(options.loadingDelay, 240);
  const reactRoot: Root = createRoot(host);
  host.setAttribute('data-react-island', 'toast');
  // Tasks still running, oldest first. The newest one that has passed its delay
  // owns the Toast whenever no result message is on screen.
  const tasks: PendingTask[] = [];
  let timer = 0;
  let messageShowing = false;
  let destroyed = false;

  function stopTimer(): void {
    if (timer) {
      clearTimer(timer);
      timer = 0;
    }
  }

  function render(text: string, tone: ToastTone): void {
    flushSync(() => {
      reactRoot.render(
        tone === 'loading' ? (
          <>
            <span aria-hidden="true" className="x-lumno-toast-spinner" />
            {text}
          </>
        ) : (
          text
        )
      );
    });
    if (tone) {
      host.setAttribute('data-tone', tone);
    } else {
      host.removeAttribute('data-tone');
    }
    host.setAttribute('data-show', 'true');
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
    stopTimer();
    messageShowing = false;
    if (destroyed) {
      return;
    }
    const task = visibleTask();
    if (task) {
      render(task.text, 'loading');
    } else {
      host.setAttribute('data-show', 'false');
    }
  }

  function show(message: unknown, showOptions: ToastShowOptions = {}): void {
    const text = String(message || '');
    if (destroyed || !text) {
      return;
    }
    stopTimer();
    messageShowing = true;
    render(text, showOptions.error ? 'error' : '');
    const duration = toDuration(showOptions.duration, defaultDuration);
    if (duration > 0) {
      timer = setTimer(() => {
        timer = 0;
        settle();
      }, duration);
    }
  }

  function begin(message: unknown, beginOptions: { delay?: number } = {}): ToastTask {
    if (destroyed) {
      return NOOP_TASK;
    }
    const delay = toDuration(beginOptions.delay, loadingDelay);
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

    function finish(resultMessage: unknown, resultOptions?: ToastShowOptions): void {
      if (finished) {
        return;
      }
      finished = true;
      if (task.delayTimer) {
        clearTimer(task.delayTimer);
        task.delayTimer = 0;
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
      task.delayTimer = setTimer(reveal, delay);
    } else {
      reveal();
    }

    return Object.freeze({
      update(nextMessage: unknown) {
        if (finished) {
          return;
        }
        task.text = String(nextMessage || '');
        if (isOnScreen()) {
          render(task.text, 'loading');
        }
      },
      done(resultMessage?: unknown, resultOptions?: ToastShowOptions) {
        finish(resultMessage, resultOptions);
      },
      fail(resultMessage?: unknown, resultOptions?: ToastShowOptions) {
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
          clearTimer(task.delayTimer);
        }
      });
      settle();
      destroyed = true;
      flushSync(() => {
        reactRoot.unmount();
      });
    }
  });
}

export function createToastApi() {
  return Object.freeze({
    implementation: 'react',
    createToastController(
      toastElement: HTMLElement | null,
      options?: ToastOptions
    ) {
      return createToastController(toastElement, options);
    }
  });
}
