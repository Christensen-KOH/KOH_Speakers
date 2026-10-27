// Set on <html> once on-screen touch controls are in use.
export const TOUCH_UI_CLASS = 'tk-has-touch';

/** True once on-screen controls are in use (for touch-specific wording). */
export function isTouchUi(): boolean {
  return document.documentElement.classList.contains(TOUCH_UI_CLASS);
}
