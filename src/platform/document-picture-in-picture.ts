// The Document Picture-in-Picture API (window.documentPictureInPicture,
// Chrome 116) and the page's permissions policy, which the DOM types here do
// not have yet: only the parts the web clip picker uses, read from the page
// as untrusted.

interface PictureInPictureWindowSize {
  width: number;
  height: number;
}

interface DocumentPictureInPicture {
  // Opens the floating window; browsers refuse without fresh user activation.
  requestWindow(size: PictureInPictureWindowSize): Promise<Window>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// The floating window is another realm, where instanceof Window fails, so it
// is recognized by its parts.
function isWindowLike(value: unknown): value is Window {
  return isRecord(value) && typeof value.close === 'function' && isRecord(value.document);
}

// window.documentPictureInPicture where the browser has it.
function readDocumentPictureInPicture(windowObj: Window): DocumentPictureInPicture | null {
  const api: unknown = Reflect.get(windowObj, 'documentPictureInPicture');
  if (!isRecord(api)) {
    return null;
  }
  const requestWindow = api.requestWindow;
  if (typeof requestWindow !== 'function') {
    return null;
  }
  return {
    // The call happens before the first await, while the activation lasts.
    async requestWindow(size) {
      const opened: unknown = await Reflect.apply(requestWindow, api, [size]);
      if (!isWindowLike(opened)) {
        throw new TypeError('Document Picture-in-Picture did not return a window');
      }
      return opened;
    }
  };
}

// Whether the page's permissions policy lets it use picture-in-picture; true
// where the browser cannot tell.
function allowsPictureInPicture(documentObj: Document): boolean {
  const policy: unknown = Reflect.get(documentObj, 'permissionsPolicy') || Reflect.get(documentObj, 'featurePolicy');
  if (!isRecord(policy)) {
    return true;
  }
  const allowsFeature = policy.allowsFeature;
  if (typeof allowsFeature !== 'function') {
    return true;
  }
  try {
    return Reflect.apply(allowsFeature, policy, ['picture-in-picture']) !== false;
  } catch (_error) {
    return true;
  }
}

export { allowsPictureInPicture, readDocumentPictureInPicture };
export type { DocumentPictureInPicture, PictureInPictureWindowSize };
