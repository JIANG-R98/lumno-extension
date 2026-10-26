// What the picker and the open clip keep between events.
import type { PickerState } from './types';

const state: PickerState = {
  active: false,
  root: null,
  highlight: null,
  currentTarget: null,
  currentStack: [],
  currentStackIndex: 0,
  currentTheme: null,
  session: null,
  teardownSelection: null,
  toastHost: null,
  toastElement: null,
  toastController: null,
  toastStyleGate: null,
  opening: false,
  ownerToken: '',
  runtimeMessageHandlerBound: false
};

export {
  state
};
