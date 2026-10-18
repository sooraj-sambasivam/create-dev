/** Shared between the lasso and the click-to-pin handler: a drag must not also count as a click. */
let suppressUntil = 0;

export const markLassoDrag = (now = Date.now()): void => { suppressUntil = now + 350; };

/** True (once per click) when the click that ends a lasso drag should be ignored. */
export const consumeLassoClick = (now = Date.now()): boolean => {
  if (now > suppressUntil) return false;
  suppressUntil = 0;
  return true;
};

/** Non-consuming check, for listeners that run before the pin handler. */
export const peekLassoClick = (now = Date.now()): boolean => now <= suppressUntil;

export const resetLassoGesture = (): void => { suppressUntil = 0; };

export const DRAG_THRESHOLD_PX = 6;

/** Where a plain press-and-drag must not start a lasso: form controls, editable text, our own UI. */
export function isLassoBlocked(target: Element | null): boolean {
  if (!target) return true;
  if (target.closest("[data-narrate-ignore],[data-tray-ignore]")) return true;
  if (target.closest("input,textarea,select,[contenteditable=''],[contenteditable='true'],[draggable='true'],.tl-container")) return true;
  return false;
}

/** A cursor that reads as a lasso loop (inline SVG; hot spot at the loop's centre-left). */
export const LASSO_CURSOR =
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><ellipse cx="13" cy="11" rx="9" ry="6.5" fill="rgba(62,123,240,0.12)" stroke="#fff" stroke-width="3.4"/><ellipse cx="13" cy="11" rx="9" ry="6.5" fill="none" stroke="#3E7BF0" stroke-width="1.8"/><path d="M6.5 15.5c-1.6 2.2-1 4.6 1.2 5.6" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M6.5 15.5c-1.6 2.2-1 4.6 1.2 5.6" fill="none" stroke="#3E7BF0" stroke-width="1.8" stroke-linecap="round"/></svg>',
  )}") 13 11, crosshair`;
