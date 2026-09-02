import { createPopupApi } from './popup';

const runtime = globalThis as typeof globalThis & {
  LumnoPopupReactBootstrap?: { reactReady: boolean };
  LumnoPopupReact?: ReturnType<typeof createPopupApi>;
};

runtime.LumnoPopupReact = createPopupApi();
if (runtime.LumnoPopupReactBootstrap) {
  runtime.LumnoPopupReactBootstrap.reactReady = true;
}
