// Scrolling for normal mode: j/k small steps, u/d half a screen, gg/G ends.
//
// Target: the scrollable area the user last clicked into, else the largest
// visible scrollable area (the chat in a thread, the page elsewhere).

let preferred: HTMLElement | null = null;
let cached: HTMLElement | null = null;

function isScrollable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight + 1) return false;
  const overflow = getComputedStyle(el).overflowY;
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

function usable(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.isConnected && el.clientHeight > 0 && isScrollable(el);
}

function scrollableAncestor(el: Element | null): HTMLElement | null {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (isScrollable(node)) return node;
  }
  return null;
}

function largestScrollable(): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestArea = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (!isScrollable(el)) continue;
    const r = el.getBoundingClientRect();
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    if (w > 0 && h > 0 && w * h > bestArea) {
      best = el;
      bestArea = w * h;
    }
  }
  return best;
}

/** Call on pointerdown so j/k follow the area the user works in. */
export function rememberScrollTarget(target: EventTarget | null): void {
  preferred = target instanceof Element ? scrollableAncestor(target) : null;
}

export function scrollTarget(): HTMLElement | null {
  if (usable(preferred)) return preferred;
  if (!usable(cached)) cached = largestScrollable();
  return cached;
}

export type ScrollCommand = "down" | "up" | "halfDown" | "halfUp" | "top" | "bottom";

export function scrollBy(command: ScrollCommand, step: number, repeat: boolean): void {
  const el = scrollTarget();
  if (!el) return;
  // Smooth animations stack badly under key repeat, so a held key jumps.
  const behavior: ScrollBehavior = repeat ? "auto" : "smooth";
  const half = Math.round(el.clientHeight / 2);
  switch (command) {
    case "down":
      return el.scrollBy({ top: step, behavior });
    case "up":
      return el.scrollBy({ top: -step, behavior });
    case "halfDown":
      return el.scrollBy({ top: half, behavior });
    case "halfUp":
      return el.scrollBy({ top: -half, behavior });
    case "top":
      return el.scrollTo({ top: 0, behavior });
    case "bottom":
      return el.scrollTo({ top: el.scrollHeight, behavior });
  }
}
