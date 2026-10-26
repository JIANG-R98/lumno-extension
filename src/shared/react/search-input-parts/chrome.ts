// What the search input's buttons share: the surface's tooltip, the hover
// look, the classes of the field's parts and the attributes that keep page
// translators out.
import { useLayoutEffect, useRef, useState } from 'react';

// The surface's tooltip that follows the pointer over the field's buttons.
interface SearchInputTooltip {
  bind(button: HTMLElement, getText: () => string): void;
  hide(): void;
}

const CLASSES = Object.freeze({
  clearAction:
    'x-lumno-search-input__clear _x_extension_input_clear_class_2026_ notranslate',
  container:
    'x-lumno-search-input x-lumno-search-input__container _x_extension_input_container_class_2026_ notranslate',
  divider:
    'x-lumno-search-input__divider _x_extension_input_divider_class_2026_ notranslate',
  icon:
    'x-lumno-search-input__icon _x_extension_input_icon_class_2026_ notranslate',
  input:
    'x-lumno-search-input__field _x_extension_input_class_2026_ notranslate',
  rightIcon:
    'x-lumno-search-input__right-icon _x_extension_input_right_icon_class_2026_ notranslate'
});
function noTranslateProps() {
  return {
    'data-no-translate': 'true',
    lang: 'zxx',
    notranslate: '',
    translate: 'no' as const
  };
}

// Binds the surface's tooltip to the button, reading its label as it is
// when the tooltip shows.
function useButtonTooltip<T extends HTMLElement>(tooltip: SearchInputTooltip | null, label: string) {
  const ref = useRef<T>(null);
  const latestLabel = useRef(label);
  latestLabel.current = label;
  useLayoutEffect(() => {
    if (tooltip && ref.current) {
      tooltip.bind(ref.current, () => latestLabel.current);
    }
  }, [tooltip]);
  return ref;
}

// Shows the hover look while the pointer is over the button; a press,
// leaving or losing focus ends it.
function useHoverActive() {
  const [active, setActive] = useState(false);
  const end = () => setActive(false);
  return {
    active,
    handlers: {
      onMouseEnter: () => setActive(true),
      onMouseLeave: end,
      onBlur: end,
      onPointerUp: end,
      onPointerCancel: end
    }
  };
}

export type { SearchInputTooltip };
export { CLASSES, noTranslateProps, useButtonTooltip, useHoverActive };
