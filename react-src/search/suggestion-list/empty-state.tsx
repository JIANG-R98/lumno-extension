// The empty state, and the captions for help center groups.
import type { NormalizedOptions, Suggestion } from './types';
import { surfaceClass } from './surface-options';

export function EmptyState({
  options,
  message
}: {
  options: NormalizedOptions;
  message: string;
}) {
  return (
    <div
      className={surfaceClass(options, 'x-nt-empty-state')}
      data-theme={
        options.surface === 'overlay'
          ? options.container
              .closest<HTMLElement>('[data-theme]')
              ?.getAttribute('data-theme') || undefined
          : undefined
      }
    >
      <span
        className={surfaceClass(
          options,
          'x-nt-empty-state__icon'
        )}
        dangerouslySetInnerHTML={{
          __html: options.getRiSvg(
            'ri-file-3-line',
            'ri-size-16'
          )
        }}
      />
      <span
        className={surfaceClass(
          options,
          'x-nt-empty-state__text'
        )}
      >
        {options.sanitizeDisplayText(message)}
      </span>
    </div>
  );
}

// Help center pages that only loosely match the query sit under a "recommended reading"
// caption; when nothing matches, the ways to ask instead sit under their own.
function getHelpGroupCaption(
  suggestion: Suggestion | undefined
): [string, string] | null {
  if (suggestion && suggestion.type === 'helpArticle' && suggestion.recommended) {
    return ['help_center_recommended', '推荐阅读'];
  }
  if (suggestion && suggestion.type === 'helpFeedback') {
    return ['help_center_no_results', '没有找到相关内容，欢迎与开发者联系'];
  }
  return null;
}

export function getHelpGroupCaptionStart(
  suggestions: Suggestion[],
  index: number
): [string, string] | null {
  const caption = getHelpGroupCaption(suggestions[index]);
  const previous = getHelpGroupCaption(suggestions[index - 1]);
  return caption && (!previous || previous[0] !== caption[0]) ? caption : null;
}
