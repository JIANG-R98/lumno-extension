import { createReactRootController, type ReactRootController } from '../shared/root-controller';

export interface FeedbackSupportItem {
  href: string;
  iconClass: string;
  key: string;
  label: string;
  labelKey: string;
}

export interface FeedbackSupportRenderModel {
  heading: string;
  headingKey: string;
  items: FeedbackSupportItem[];
}

export type FeedbackSupportController =
  ReactRootController<FeedbackSupportRenderModel>;

function FeedbackSupportView({ heading, headingKey, items }: FeedbackSupportRenderModel) {
  return (
    <section
      className="_x_extension_feedback_support_section_2026_unique_"
      aria-labelledby="_x_extension_feedback_support_heading_2026_unique_"
    >
      <div className="_x_extension_feedback_support_header_2026_unique_">
        <h2
          id="_x_extension_feedback_support_heading_2026_unique_"
          className="_x_extension_section_title_2024_unique_"
          data-i18n={headingKey}
        >
          {heading}
        </h2>
      </div>
      <nav
        className="_x_extension_feedback_support_links_2026_unique_"
        aria-labelledby="_x_extension_feedback_support_heading_2026_unique_"
      >
        {items.map((item) => (
          <a
            key={item.key}
            className="_x_extension_feedback_support_link_2026_unique_"
            data-feedback-support={item.key}
            href={item.href}
            rel="noreferrer noopener"
            target="_blank"
          >
            <i
              className={`ri-icon ri-size-20 ${item.iconClass}`}
              aria-hidden="true"
            />
            <span data-i18n={item.labelKey}>{item.label}</span>
            <i
              className="ri-icon ri-size-14 ri-external-link-line"
              aria-hidden="true"
            />
          </a>
        ))}
      </nav>
    </section>
  );
}

export function createFeedbackSupportController(
  host: HTMLElement | null
): FeedbackSupportController {
  if (host) {
    host.dataset.reactIsland = 'options-feedback-support';
  }
  return createReactRootController(host, (model) => (
    <FeedbackSupportView {...model} />
  ));
}

export function createFeedbackSupportApi() {
  return Object.freeze({
    implementation: 'react' as const,
    createFeedbackSupportController
  });
}
