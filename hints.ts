// Hint mode: label every visible clickable element, type a label to click it.
// keys.ts opens it with `f`; Esc or a key that is not a label character closes it.

import { ROOT_ATTR } from "./style.ts";

/**
 * Prefix-free labels with the shortest mix of lengths (Vimium's algorithm):
 * with 14 characters and 20 targets, most labels stay one character long.
 */
export function makeLabels(count: number, chars: string): string[] {
  if (count <= 0) return [];
  const hints = [""];
  let offset = 0;
  while (hints.length - offset < count || hints.length === 1) {
    const hint = hints[offset++];
    for (const ch of chars) hints.push(ch + hint);
  }
  return hints
    .slice(offset, offset + count)
    .sort()
    .map((h) => [...h].reverse().join(""));
}

type Box = { top: number; left: number };

/** Reading order: rows of ~12px, then left to right. Returns indices. */
export function readingOrder(boxes: Box[]): number[] {
  const row = (b: Box) => Math.round(b.top / 12);
  return boxes.map((_, i) => i).sort((a, b) => row(boxes[a]) - row(boxes[b]) || boxes[a].left - boxes[b].left);
}

type Rect = { top: number; left: number; width: number; height: number; bottom: number };
export type Spot = { x: number; y: number; mode: "corner" | "edge" };

// Most of a label row (11px font, line-height 1.3, padding, border) sits above y.
const HALF_LABEL = 16;

/**
 * Where a label goes. A label on the corner of a small icon button covers the
 * whole icon, and a label fully above it covers the line of text above. So an
 * icon-only target gets its label centered on its top edge: the icon padding
 * takes most of the overlap and the glyph stays visible.
 */
export function labelSpot(rect: Rect, iconOnly: boolean): Spot {
  if (!iconOnly) return { x: Math.max(rect.left, 0), y: Math.max(rect.top, 0), mode: "corner" };
  return { x: Math.max(rect.left + rect.width / 2, 12), y: Math.max(rect.top, HALF_LABEL), mode: "edge" };
}

function isIconOnly(el: HTMLElement, rect: DOMRect): boolean {
  return rect.width <= 48 && rect.height <= 48 && !isEditable(el) && !el.textContent?.trim();
}

// Semantic clickables. React handlers on plain divs are invisible to the DOM,
// so collectTargets also adds the outermost `cursor: pointer` elements.
const CLICKABLE = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "textarea",
  "select",
  "summary",
  "[contenteditable=''],[contenteditable=true]",
  "[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]",
  "[role=option],[role=checkbox],[role=switch],[role=radio],[role=treeitem],[role=combobox]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function isEditable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file"].includes(type);
  }
  return false;
}

function onScreen(rect: DOMRect): boolean {
  return rect.width >= 2 && rect.height >= 2 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
}

function isUncovered(el: HTMLElement, rect: DOMRect): boolean {
  // Occlusion check: a modal or overlay above the element wins the hit test.
  const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1);
  const y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
  // The hit must land on the element itself: an ancestor hit means the element
  // is hidden, inert (pointer-events: none) or under a modal backdrop.
  const hit = document.elementFromPoint(x, y);
  return !!hit && el.contains(hit);
}

function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
}

/** Still worth clicking: attached, enabled, on screen and not covered. */
function isLive(el: HTMLElement): boolean {
  if (!el.isConnected || isDisabled(el)) return false;
  const rect = el.getBoundingClientRect();
  return onScreen(rect) && isUncovered(el, rect);
}

// One pass over the DOM. The cheap geometry check runs first, so
// getComputedStyle and the hit test only run for on-screen elements.
function collectTargets(): { el: HTMLElement; rect: DOMRect }[] {
  const cursors = new Map<Element, string>();
  const cursor = (el: Element) => {
    let c = cursors.get(el);
    if (c === undefined) cursors.set(el, (c = getComputedStyle(el).cursor));
    return c;
  };
  const found: { el: HTMLElement; rect: DOMRect }[] = [];
  for (const el of document.body.querySelectorAll("*")) {
    // SVG and MathML have no click(); their clickable HTML parent gets the label.
    if (!(el instanceof HTMLElement) || el.hasAttribute(ROOT_ATTR)) continue;
    const rect = el.getBoundingClientRect();
    if (!onScreen(rect)) continue;
    if (el.matches(CLICKABLE)) {
      if (isDisabled(el)) continue;
    } else {
      // cursor is inherited, so only take the top of each pointer region, and
      // skip regions inside a semantic clickable.
      if (cursor(el) !== "pointer") continue;
      const parent = el.parentElement;
      if (parent && (cursor(parent) === "pointer" || parent.closest(CLICKABLE))) continue;
    }
    if (isUncovered(el, rect)) found.push({ el, rect });
  }
  // Drop a wrapper that starts at the same spot as a target inside it
  // (e.g. <a><button/></a>) to avoid two stacked labels.
  const deduped = found.filter(
    (a) => !found.some((b) => b !== a && a.el.contains(b.el) && sameCorner(a.rect, b.rect)),
  );
  return readingOrder(deduped.map((t) => t.rect)).map((i) => deduped[i]);
}

function sameCorner(a: DOMRect, b: DOMRect): boolean {
  return Math.abs(a.left - b.left) < 3 && Math.abs(a.top - b.top) < 3;
}

// Hover-only controls (message actions, sidebar row actions) sit in an
// `opacity: 0` wrapper. They pass the hit test, so they get a label, but the
// user cannot see what the label does. Show them while hints are open.
function revealHidden(els: HTMLElement[]): () => void {
  const saved: { el: HTMLElement; value: string; priority: string }[] = [];
  const checked = new Set<Element>();
  for (const start of els) {
    // Ancestors above an already checked element are checked too.
    for (let el: HTMLElement | null = start; el && el !== document.body && !checked.has(el); el = el.parentElement) {
      checked.add(el);
      if (parseFloat(getComputedStyle(el).opacity) >= 0.1) continue;
      saved.push({ el, value: el.style.getPropertyValue("opacity"), priority: el.style.getPropertyPriority("opacity") });
      el.style.setProperty("opacity", "1", "important");
    }
  }
  return () => {
    for (const { el, value, priority } of saved) {
      if (value) el.style.setProperty("opacity", value, priority);
      else el.style.removeProperty("opacity");
    }
  };
}

function activate(el: HTMLElement): void {
  // The page may have changed since the labels were drawn.
  if (!isLive(el)) return;
  if (isEditable(el)) {
    el.focus();
    return;
  }
  // Radix triggers (menus, selects) open on pointerdown, not click, so send
  // the full pointer sequence instead of el.click().
  const rect = el.getBoundingClientRect();
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  el.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerType: "mouse", isPrimary: true, buttons: 1 }));
  el.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
  if (el.tabIndex >= 0 || el.matches("a,button")) el.focus({ preventScroll: true });
  el.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerType: "mouse", isPrimary: true }));
  el.dispatchEvent(new MouseEvent("mouseup", init));
  el.click();
}

type HintKey = Pick<KeyboardEvent, "key" | "repeat" | "isComposing" | "metaKey" | "ctrlKey" | "altKey">;

export type HintStep =
  | { kind: "pass" } // not ours, hint mode stays (Shift, IME)
  | { kind: "release" } // close hints and let the key through (app shortcuts)
  | { kind: "swallow" } // consume, no change (key repeat)
  | { kind: "exit" } // consume and close (Esc, a non-label key)
  | { kind: "typed"; typed: string }
  | { kind: "activate"; label: string };

/** One key in hint mode. `labels` = labels of the targets still on screen. */
export function hintKey(e: HintKey, typed: string, chars: string, labels: string[]): HintStep {
  if (e.key === "Shift" || e.isComposing) return { kind: "pass" };
  // Let app and OS shortcuts (Cmd+R, Cmd+W...) through.
  if (e.metaKey || e.ctrlKey || e.altKey) return { kind: "release" };
  // A held `f` repeats: those repeats must not pick a label.
  if (e.repeat) return { kind: "swallow" };
  if (e.key === "Backspace") return { kind: "typed", typed: typed.slice(0, -1) };
  const ch = e.key.toLowerCase();
  if (ch.length !== 1 || !chars.includes(ch)) return { kind: "exit" };
  const next = typed + ch;
  if (labels.includes(next)) return { kind: "activate", label: next };
  if (labels.some((l) => l.startsWith(next))) return { kind: "typed", typed: next };
  return { kind: "exit" };
}

type Hint = {
  label: string;
  el: HTMLElement;
  node: HTMLSpanElement;
  typed: HTMLSpanElement;
  rest: HTMLSpanElement;
  onScreen: boolean;
  iconOnly: boolean;
};

export type HintMode = {
  active(): boolean;
  enter(): void;
  exit(): void;
  onKey(e: KeyboardEvent): void;
  dispose(): void;
};

export function createHints(getChars: () => string): HintMode {
  let root: HTMLDivElement | null = null;
  let session: AbortController | null = null;
  let hints: Hint[] = [];
  let typed = "";
  let frame = 0;
  let unreveal: (() => void) | null = null;

  function exit() {
    cancelAnimationFrame(frame);
    unreveal?.();
    unreveal = null;
    session?.abort();
    session = null;
    root?.remove();
    root = null;
    hints = [];
    typed = "";
  }

  function enter() {
    exit();
    const targets = collectTargets();
    if (targets.length === 0) return;
    unreveal = revealHidden(targets.map((t) => t.el));
    const labels = makeLabels(targets.length, getChars());
    root = document.createElement("div");
    root.setAttribute(ROOT_ATTR, "");
    root.setAttribute("aria-hidden", "true");
    hints = targets.map(({ el, rect }, i) => {
      const node = document.createElement("span");
      node.className = "bbium-hint";
      const typedNode = node.appendChild(document.createElement("span"));
      typedNode.className = "typed";
      const rest = node.appendChild(document.createElement("span"));
      root!.appendChild(node);
      return { label: labels[i], el, node, typed: typedNode, rest, onScreen: true, iconOnly: isIconOnly(el, rect) };
    });
    document.body.appendChild(root);
    render();
    session = new AbortController();
    const { signal } = session;
    window.addEventListener("resize", scheduleRender, { signal });
    document.addEventListener("scroll", scheduleRender, { capture: true, passive: true, signal });
    window.addEventListener("blur", exit, { signal });
  }

  // Also runs on scroll and resize: the chat auto-scrolls while an agent
  // works, so hints follow their targets instead of closing.
  function render() {
    for (const h of hints) {
      const rect = h.el.getBoundingClientRect();
      h.onScreen = h.el.isConnected && onScreen(rect);
      const show = h.onScreen && h.label.startsWith(typed);
      h.node.style.display = show ? "" : "none";
      if (!show) continue;
      const spot = labelSpot(rect, h.iconOnly);
      h.node.className = spot.mode === "corner" ? "bbium-hint" : `bbium-hint ${spot.mode}`;
      h.node.style.left = `${spot.x}px`;
      h.node.style.top = `${spot.y}px`;
      h.typed.textContent = typed;
      h.rest.textContent = h.label.slice(typed.length);
    }
  }

  function scheduleRender() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  function onKey(e: KeyboardEvent) {
    const live = hints.filter((h) => h.onScreen);
    const step = hintKey(e, typed, getChars(), live.map((h) => h.label));
    if (step.kind === "pass") return;
    if (step.kind === "release") return exit();
    e.preventDefault();
    e.stopImmediatePropagation();
    if (step.kind === "exit") return exit();
    if (step.kind === "typed") {
      typed = step.typed;
      return render();
    }
    if (step.kind === "activate") {
      const el = live.find((h) => h.label === step.label)!.el;
      exit();
      activate(el);
    }
  }

  return {
    active: () => root !== null,
    enter,
    exit,
    onKey,
    dispose: exit,
  };
}
