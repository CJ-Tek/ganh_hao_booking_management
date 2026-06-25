"use client";

import { useEffect } from "react";

/** Opt-in marker for surfaces that implement their own pinch zoom (e.g. floor-map canvas). */
export const PWA_ALLOW_PINCH_ZOOM_ATTR = "data-allow-pinch-zoom";

function isInsidePinchZoomSurface(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(`[${PWA_ALLOW_PINCH_ZOOM_ATTR}]`));
}

/**
 * Blocks browser-level pinch/double-tap zoom in the installed PWA.
 * Viewport meta handles most cases; this covers iOS Safari gaps.
 */
export function PwaZoomGuard() {
  useEffect(() => {
    const blockGesture = (event: Event) => {
      event.preventDefault();
    };

    const blockMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        return;
      }
      if (isInsidePinchZoomSurface(event.target)) {
        return;
      }
      event.preventDefault();
    };

    let lastTouchEnd = 0;
    const blockDoubleTapZoom = (event: TouchEvent) => {
      if (isInsidePinchZoomSurface(event.target)) {
        return;
      }
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    };

    document.addEventListener("gesturestart", blockGesture, { passive: false });
    document.addEventListener("gesturechange", blockGesture, { passive: false });
    document.addEventListener("gestureend", blockGesture, { passive: false });
    document.addEventListener("touchmove", blockMultiTouchZoom, { passive: false });
    document.addEventListener("touchend", blockDoubleTapZoom, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("gestureend", blockGesture);
      document.removeEventListener("touchmove", blockMultiTouchZoom);
      document.removeEventListener("touchend", blockDoubleTapZoom);
    };
  }, []);

  return null;
}
