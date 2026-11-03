// The open photo takes the whole screen on a phone: Android keeps the
// status bar and the gesture bar even with viewport-fit=cover, and in
// landscape they sit over the top and bottom of the photo. The Fullscreen
// API hides both while a photo is open.
//
// Only on touch devices (a desktop browser going fullscreen would be a
// surprise), and only from a tap: requestFullscreen needs a recent user
// activation, so a deep-linked photo simply stays in the normal window.

let ours = false;
let pending: number | undefined;

function canUse(): boolean {
  return (
    typeof document !== "undefined" &&
    document.fullscreenEnabled &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/**
 * Goes fullscreen after `delayMs`, unless exitPhotoFullscreen comes first.
 * The delay lets the open animation land: hiding the bars resizes the
 * viewport, which mid-flight shifts where the photo appears to fly from.
 * A tap's user activation lasts long enough to cover it.
 */
export function enterPhotoFullscreenAfter(delayMs: number): void {
  window.clearTimeout(pending);
  pending = window.setTimeout(enter, delayMs);
}

function enter(): void {
  pending = undefined;
  if (!canUse() || document.fullscreenElement) return;
  document.documentElement
    .requestFullscreen({ navigationUI: "hide" })
    .then(() => {
      ours = true;
    })
    .catch(() => {
      // No user activation left, or the browser refused: stay windowed.
    });
}

/** Resolves once the system bars are back, so callers can measure the restored layout. */
export async function exitPhotoFullscreen(): Promise<void> {
  window.clearTimeout(pending);
  pending = undefined;
  if (!ours) return;
  ours = false;
  if (!document.fullscreenElement) return;
  await document.exitFullscreen().catch(() => {});
}

/**
 * Calls `onLeft` when fullscreen ends without exitPhotoFullscreen, which on
 * Android is the back gesture: it leaves fullscreen and is used up doing
 * so, so the caller closes the photo itself to keep back a single press.
 */
export function onPhotoFullscreenLeft(onLeft: () => void): () => void {
  function onChange() {
    if (ours && !document.fullscreenElement) {
      ours = false;
      onLeft();
    }
  }
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}
