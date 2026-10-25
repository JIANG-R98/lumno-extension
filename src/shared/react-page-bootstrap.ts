// Starts a page that has React islands: loads the React entry named by
// data-react-entry, then the page script named by data-page-entry once the
// entry has marked the shared state (on globalThis[data-react-state]) ready.

// What the React entry finds on globalThis under the data-react-state name.
interface ReactBootstrapState {
  reactReady: boolean;
}

(function() {
  const currentScript = document.currentScript;
  // An SVG <script> has no src; this bundle is only ever an HTML one.
  if (!currentScript || !('src' in currentScript) || !currentScript.src) {
    return;
  }

  const reactEntryPath = currentScript.dataset.reactEntry;
  const pageEntryPath = currentScript.dataset.pageEntry;
  const stateKey = currentScript.dataset.reactState;
  const pageRuntime = currentScript.dataset.pageRuntime || 'page';
  if (!reactEntryPath || !pageEntryPath || !stateKey) {
    return;
  }

  const root = document.documentElement;
  const reactEntryUrl = new URL(reactEntryPath, currentScript.src).href;
  const pageEntryUrl = new URL(pageEntryPath, currentScript.src).href;
  const bootstrapState: ReactBootstrapState = {
    reactReady: false
  };
  let pageStarted = false;

  Reflect.set(globalThis, stateKey, bootstrapState);
  root.dataset.lumnoReactRuntime = 'loading';

  function startPage() {
    if (pageStarted) {
      return;
    }
    pageStarted = true;
    root.dataset.lumnoReactRuntime = 'react';

    const pageScript = document.createElement('script');
    pageScript.src = pageEntryUrl;
    pageScript.dataset.lumnoPageRuntime = pageRuntime;
    document.body.appendChild(pageScript);
  }

  import(reactEntryUrl).then(() => {
    if (!bootstrapState.reactReady) {
      throw new Error('React entry loaded without marking the page ready.');
    }
    startPage();
  }).catch((error: unknown) => {
    root.dataset.lumnoReactRuntime = 'error';
    console.error('[Lumno] React page failed to start.', error);
  });
})();
