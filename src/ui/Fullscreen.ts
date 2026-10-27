type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

export async function enterFullscreen(): Promise<void> {
  const root = document.documentElement as FullscreenElement;
  try {
    if (root.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: 'hide' });
    } else {
      await root.webkitRequestFullscreen?.();
    }
  } catch {
    // Refused (iPhone Safari, or no user gesture): the page still fills the window
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (isFullscreen()) {
    try {
      await document.exitFullscreen();
    } catch {
      // Nothing to exit
    }
    return;
  }
  await enterFullscreen();
}

/**
 * Phones and tablets go full screen on the first tap, which is the tap on
 * Start / Join (browsers only allow it from a user gesture).
 */
export function enterFullscreenOnFirstTouch(): void {
  const handle = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') {
      return;
    }
    window.removeEventListener('pointerup', handle, true);
    void enterFullscreen();
  };
  window.addEventListener('pointerup', handle, true);
}
