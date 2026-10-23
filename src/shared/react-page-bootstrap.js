(function() {
  const currentScript = document.currentScript;
  if (!currentScript || !currentScript.src) {
    return;
  }

  const reactEntryPath = currentScript.dataset.reactEntry;
  const pageEntryPath = currentScript.dataset.pageEntry;
  const stateKey = currentScript.dataset.reactState;
  if (!reactEntryPath || !pageEntryPath || !stateKey) {
    return;
  }

  const runtime = globalThis;
  const root = document.documentElement;
  const reactEntryUrl = new URL(reactEntryPath, currentScript.src).href;
  const pageEntryUrl = new URL(pageEntryPath, currentScript.src).href;
  const bootstrapState = {
    reactReady: false
  };
  let pageStarted = false;

  runtime[stateKey] = bootstrapState;
  root.dataset.lumnoReactRuntime = 'loading';

  function startPage() {
    if (pageStarted) {
      return;
    }
    pageStarted = true;
    root.dataset.lumnoReactRuntime = 'react';

    const pageScript = document.createElement('script');
    pageScript.src = pageEntryUrl;
    pageScript.dataset.lumnoPageRuntime = currentScript.dataset.pageRuntime || 'page';
    document.body.appendChild(pageScript);
  }

  import(reactEntryUrl).then(() => {
    if (!bootstrapState.reactReady) {
      throw new Error('React entry loaded without marking the page ready.');
    }
    startPage();
  }).catch((error) => {
    root.dataset.lumnoReactRuntime = 'error';
    console.error('[Lumno] React page failed to start.', error);
  });
})();
