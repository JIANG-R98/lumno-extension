// The cursor tooltip modules as one namespace, for the tests written against
// the module they were split from.
export { HOST_CLASS as hostClassName, TAG_CLASS as tagClassName } from '../../src/shared/ui/cursor-tooltip-model';
export { positionAtPoint } from '../../src/shared/ui/cursor-tooltip-points';
export { createController } from '../../src/shared/ui/cursor-tooltip';
export { isElementTextTruncated } from '../../src/shared/react/text-overflow';
