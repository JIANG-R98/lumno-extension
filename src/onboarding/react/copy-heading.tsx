import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

interface TitleCycleItem {
  label?: string;
  tone?: string;
}

interface TitleCycle {
  items?: readonly TitleCycleItem[];
  prefix?: string;
}

interface TitleLogo {
  label?: string;
  src?: string;
}

export interface CopyHeadingRenderModel {
  cycleFirstDelayMs: number;
  cycleIntervalMs: number;
  eyebrow: string;
  reducedMotion: boolean;
  swapDurationMs: number;
  title: string;
  titleCycle?: TitleCycle | null;
  titleLines: readonly string[];
  titleLogo?: TitleLogo | null;
}

export interface CopyHeadingController {
  render(model: CopyHeadingRenderModel): void;
  destroy(): void;
}

export interface CopyHeadingControllerOptions {
  onTitleFitNeeded(): void;
}

interface NormalizedTitleCycleItem {
  label: string;
  tone: string;
}

interface NormalizedCopyHeadingModel extends CopyHeadingRenderModel {
  eyebrow: string;
  title: string;
  titleCycle: {
    items: NormalizedTitleCycleItem[];
    prefix: string;
  } | null;
  titleLines: string[];
  titleLogo: {
    label: string;
    src: string;
  } | null;
}

type SwapPhase = 'idle' | 'exit' | 'enter-start';

function normalizeModel(
  model: CopyHeadingRenderModel
): NormalizedCopyHeadingModel {
  const cycleItems = Array.isArray(model.titleCycle?.items)
    ? model.titleCycle.items.flatMap((item) => {
        const label = String(item?.label || '');
        const tone = String(item?.tone || '');
        return label && tone ? [{ label, tone }] : [];
      })
    : [];
  const logoSrc = String(model.titleLogo?.src || '');

  return {
    cycleFirstDelayMs: Math.max(0, Number(model.cycleFirstDelayMs) || 0),
    cycleIntervalMs: Math.max(1, Number(model.cycleIntervalMs) || 1),
    eyebrow: String(model.eyebrow || ''),
    reducedMotion: Boolean(model.reducedMotion),
    swapDurationMs: Math.max(0, Number(model.swapDurationMs) || 0),
    title: String(model.title || ''),
    titleCycle: cycleItems.length > 0
      ? {
          items: cycleItems,
          prefix: String(model.titleCycle?.prefix || '')
        }
      : null,
    titleLines: Array.isArray(model.titleLines)
      ? model.titleLines.map((line) => String(line || ''))
      : [],
    titleLogo: logoSrc
      ? {
          label: String(model.titleLogo?.label || '').trim(),
          src: logoSrc
        }
      : null
  };
}

function TitleLogoMark({
  logo
}: {
  logo: NormalizedCopyHeadingModel['titleLogo'];
}) {
  if (!logo) {
    return null;
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className="title-logo-mark"
      decoding="async"
      loading="eager"
      src={logo.src}
      title={logo.label || undefined}
    />
  );
}

function TitleLine({
  logo,
  text
}: {
  logo: NormalizedCopyHeadingModel['titleLogo'];
  text: string;
}) {
  return (
    <span className={logo ? 'title-line title-line--with-logo' : 'title-line'}>
      {text}
      <TitleLogoMark logo={logo} />
    </span>
  );
}

function StaticTitle({ model }: { model: NormalizedCopyHeadingModel }) {
  if (model.titleLines.length === 0) {
    return <>{model.title}</>;
  }
  return (
    <>
      {model.titleLines.map((line, index) => (
        <Fragment key={`${line}-${index}`}>
          {index > 0 ? (
            <br aria-hidden="true" className="title-break" />
          ) : null}
          <TitleLine
            logo={
              index === model.titleLines.length - 1 ? model.titleLogo : null
            }
            text={line}
          />
        </Fragment>
      ))}
    </>
  );
}

// One empty list for every title without a cycle, so the cycle effect does
// not see a new list on each render.
const NO_TITLE_CYCLE_ITEMS: NormalizedTitleCycleItem[] = [];

function RotatingTitle({
  model,
  options
}: {
  model: NormalizedCopyHeadingModel;
  options: CopyHeadingControllerOptions;
}) {
  const items = model.titleCycle?.items || NO_TITLE_CYCLE_ITEMS;
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<SwapPhase>('idle');
  const activeIndexRef = useRef(0);
  const intervalRef = useRef(0);
  const firstTimeoutRef = useRef(0);
  const swapTimeoutRef = useRef(0);
  const enterTimeoutRef = useRef(0);
  const rotatorRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const currentItem = items[activeIndex] || items[0];

  function setRotatorWidth(label: string): void {
    const rotator = rotatorRef.current;
    const measure = measureRef.current;
    if (!rotator || !measure) {
      return;
    }
    measure.textContent = label;
    const style = window.getComputedStyle(rotator);
    const padding = (Number.parseFloat(style.paddingLeft) || 0) +
      (Number.parseFloat(style.paddingRight) || 0);
    const width = Math.ceil(measure.getBoundingClientRect().width + padding);
    if (width > 0) {
      rotator.style.width = `${width}px`;
    }
  }

  useLayoutEffect(() => {
    if (currentItem) {
      setRotatorWidth(currentItem.label);
    }
    options.onTitleFitNeeded();
  }, [activeIndex, currentItem, options]);

  useLayoutEffect(() => {
    options.onTitleFitNeeded();
  }, [options, phase]);

  useEffect(() => {
    if (model.reducedMotion || items.length < 2) {
      return undefined;
    }

    const advance = (): void => {
      const nextIndex = (activeIndexRef.current + 1) % items.length;
      const nextItem = items[nextIndex];
      setRotatorWidth(nextItem.label);
      options.onTitleFitNeeded();
      setPhase('exit');
      if (swapTimeoutRef.current) {
        window.clearTimeout(swapTimeoutRef.current);
      }
      swapTimeoutRef.current = window.setTimeout(() => {
        swapTimeoutRef.current = 0;
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        setPhase('enter-start');
        enterTimeoutRef.current = window.setTimeout(() => {
          enterTimeoutRef.current = 0;
          setPhase('idle');
        }, 16);
      }, model.swapDurationMs);
    };

    firstTimeoutRef.current = window.setTimeout(() => {
      firstTimeoutRef.current = 0;
      advance();
      intervalRef.current = window.setInterval(
        advance,
        model.cycleIntervalMs
      );
    }, model.cycleFirstDelayMs);

    return () => {
      if (firstTimeoutRef.current) {
        window.clearTimeout(firstTimeoutRef.current);
      }
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      if (swapTimeoutRef.current) {
        window.clearTimeout(swapTimeoutRef.current);
      }
      if (enterTimeoutRef.current) {
        window.clearTimeout(enterTimeoutRef.current);
      }
    };
  }, [items, model, options]);

  if (!currentItem || !model.titleCycle) {
    return <StaticTitle model={model} />;
  }

  const textClassName = [
    'title-rotator__text',
    't-text-swap',
    phase === 'exit' ? 'is-exit' : '',
    phase === 'enter-start' ? 'is-enter-start' : ''
  ].filter(Boolean).join(' ');
  const secondLine = model.titleLines[1] || '';

  return (
    <>
      <span className="title-line title-line--rotating">
        {model.titleCycle.prefix}
        <span
          aria-hidden="true"
          className="title-rotator t-resize"
          data-title-rotator=""
          data-tone={currentItem.tone}
          ref={rotatorRef}
        >
          <span
            className={textClassName}
            data-title-rotator-text=""
          >
            {currentItem.label}
          </span>
          <span
            aria-hidden="true"
            className="title-rotator__measure"
            data-title-rotator-measure=""
            ref={measureRef}
          >
            {currentItem.label}
          </span>
        </span>
      </span>
      {secondLine ? (
        <>
          <br aria-hidden="true" className="title-break" />
          <TitleLine logo={model.titleLogo} text={secondLine} />
        </>
      ) : null}
    </>
  );
}

function TitleCopyView({
  model,
  options
}: {
  model: NormalizedCopyHeadingModel;
  options: CopyHeadingControllerOptions;
}) {
  return model.titleCycle ? (
    <RotatingTitle model={model} options={options} />
  ) : (
    <StaticTitle model={model} />
  );
}

export function createCopyHeadingController(
  hosts: {
    eyebrow: HTMLElement | null;
    title: HTMLElement | null;
  },
  options: CopyHeadingControllerOptions
): CopyHeadingController {
  const eyebrowHost = hosts.eyebrow;
  const titleHost = hosts.title;
  const eyebrowRoot: Root | null = eyebrowHost ? createRoot(eyebrowHost) : null;
  const titleRoot: Root | null = titleHost ? createRoot(titleHost) : null;
  let destroyed = false;
  let revision = 0;

  eyebrowHost?.setAttribute('data-react-island', 'onboarding-eyebrow');
  titleHost?.setAttribute('data-react-island', 'onboarding-title-copy');

  function render(model: CopyHeadingRenderModel): void {
    if (destroyed) {
      return;
    }
    const normalizedModel = normalizeModel(model);
    revision += 1;
    if (eyebrowHost) {
      eyebrowHost.dataset.empty = normalizedModel.eyebrow ? 'false' : 'true';
    }
    if (titleHost) {
      titleHost.dataset.empty = normalizedModel.title ? 'false' : 'true';
      if (normalizedModel.titleLines.length > 0 && normalizedModel.title) {
        titleHost.setAttribute('aria-label', normalizedModel.title);
      } else {
        titleHost.removeAttribute('aria-label');
      }
    }

    flushSync(() => {
      eyebrowRoot?.render(normalizedModel.eyebrow);
      titleRoot?.render(
        <TitleCopyView
          key={revision}
          model={normalizedModel}
          options={options}
        />
      );
    });
    options.onTitleFitNeeded();
  }

  return Object.freeze({
    render,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      flushSync(() => {
        eyebrowRoot?.unmount();
        titleRoot?.unmount();
      });
    }
  });
}

export function createCopyHeadingApi() {
  return Object.freeze({
    implementation: 'react',
    createCopyHeadingController
  });
}
