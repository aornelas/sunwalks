// Motion 2 ("square opens"): the grid cell that was tapped hands off its
// rect + thumbnail to whichever photo view mounts next, without threading a
// new parameter through every onOpenDay prop in the tree. Set synchronously
// inside a click handler and consumed synchronously at the top of
// CalendarApp.openDetailFor, in the same tick — never held across a render.
export interface PhotoOrigin {
  rect: DOMRect;
  thumbSrc: string;
}

let pending: PhotoOrigin | null = null;

export function setPendingOrigin(rect: DOMRect, thumbSrc: string): void {
  pending = { rect, thumbSrc };
}

export function consumePendingOrigin(): PhotoOrigin | null {
  const p = pending;
  pending = null;
  return p;
}
