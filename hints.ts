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

export type LabelBox = { left: number; top: number; width: number; height: number };

const LABEL_GAP = 1;

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

/**
 * Shift labels so none covers another. Nearby targets (Snooze next to Done,
 * a toggle inside a sidebar row, Show more above a message toolbar) put their
 * labels on the same pixels. In order, each label that hits a placed one moves
 * the shortest distance to a free spot next to the labels it hits; a label
 * with no free spot nearby stays put. Returns one offset per box.
 */
export function spreadLabels(boxes: LabelBox[], bounds: { width: number; height: number }): { dx: number; dy: number }[] {
  const placed: LabelBox[] = [];
  return boxes.map((box) => {
    const free = (c: LabelBox) =>
      c.left >= 0 && c.top >= 0 && c.left + c.width <= bounds.width && c.top + c.height <= bounds.height && !placed.some((p) => overlaps(c, p));
    // The first spot may stick out of the window (edge labels); only a move must stay inside.
    let best: LabelBox | null = placed.some((p) => overlaps(box, p)) ? null : box;
    // Search outward: a spot beside one label can hit the next one.
    let frontier = [box];
    for (let round = 0; !best && round < 3 && frontier.length; round++) {
      const next: LabelBox[] = [];
      for (const from of frontier) {
        for (const p of placed) {
          if (!overlaps(from, p)) continue;
          next.push(
            { ...from, left: p.left + p.width + LABEL_GAP },
            { ...from, left: p.left - from.width - LABEL_GAP },
            { ...from, top: p.top + p.height + LABEL_GAP },
            { ...from, top: p.top - from.height - LABEL_GAP },
          );
        }
      }
      const dist = (c: LabelBox) => Math.abs(c.left - box.left) + Math.abs(c.top - box.top);
      for (const c of next) if (free(c) && (!best || dist(c) < dist(best))) best = c;
      frontier = next.sort((a, b) => dist(a) - dist(b)).slice(0, 16);
    }
    const at = best ?? box;
    placed.push(at);
    return { dx: at.left - box.left, dy: at.top - box.top };
  });
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

/** A visible text fragment, rather than the union box of a wrapped inline. */
function visibleRect(el: HTMLElement, clip?: Clip): DOMRect | null {
  if (!clip) {
    clip = { top: 0, left: 0, bottom: innerHeight, right: innerWidth };
    // Render and activation also need the visible part of scroll containers.
    for (let child: HTMLElement = el, parent = el.parentElement; parent; child = parent, parent = parent.parentElement) {
      if (getComputedStyle(child).position === "fixed") break;
      const style = getComputedStyle(parent);
      const r = parent.getBoundingClientRect();
      if (style.overflowX !== "visible") {
        clip.left = Math.max(clip.left, r.left);
        clip.right = Math.min(clip.right, r.right);
      }
      if (style.overflowY !== "visible") {
        clip.top = Math.max(clip.top, r.top);
        clip.bottom = Math.min(clip.bottom, r.bottom);
      }
    }
  }
  // A wrapped inline's bounding-box center can lie between its text fragments.
  // Clip each fragment before hit-testing, so a partially visible line works too.
  for (const r of el.getClientRects()) {
    const left = Math.max(r.left, clip.left, 0);
    const top = Math.max(r.top, clip.top, 0);
    const right = Math.min(r.right, clip.right, innerWidth);
    const bottom = Math.min(r.bottom, clip.bottom, innerHeight);
    if (right <= left || bottom <= top) continue;
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    // An ancestor hit is still rejected: overlays and inert controls stay out.
    if (hit && el.contains(hit)) return new DOMRect(left, top, right - left, bottom - top);
  }
  return null;
}

function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
}

type Clip = { top: number; left: number; bottom: number; right: number };

function outside(r: DOMRect, c: Clip): boolean {
  // A zero-size box (display: contents, empty wrappers) says nothing about its children.
  if (r.width === 0 && r.height === 0) return false;
  return r.bottom < c.top || r.top > c.bottom || r.right < c.left || r.left > c.right;
}

/**
 * One recursive pass over the DOM. A subtree that lies outside the visible part
 * of its scroll container is skipped whole: bb's sidebar keeps every thread
 * row in the DOM (16k nodes with 400 threads), and only a few are on screen.
 * Styles that make an element unclickable are checked before the hit test,
 * which costs ~0.5 ms per call on a large page.
 */
// ponytail: an absolute or fixed child of a skipped row that sits on screen
// is missed; bb renders menus and popovers in portals, so none exist today.
function collectTargets(): { el: HTMLElement; rect: DOMRect }[] {
  const found: { el: HTMLElement; rect: DOMRect }[] = [];
  const viewport: Clip = { top: 0, left: 0, bottom: innerHeight, right: innerWidth };

  const visit = (el: Element, parentClip: Clip, parentPointer: boolean, inClickable: boolean) => {
    // SVG and MathML have no click(); their clickable HTML parent gets the label.
    if (!(el instanceof HTMLElement) || el.hasAttribute(ROOT_ATTR)) return;
    const style = getComputedStyle(el);
    if (style.display === "none") return;
    const clip = style.position === "fixed" ? viewport : parentClip;
    const rect = el.getBoundingClientRect();
    if (outside(rect, clip)) return;
    const pointer = style.cursor === "pointer";
    const clickable = el.matches(CLICKABLE);
    if (
      onScreen(rect) &&
      style.pointerEvents !== "none" &&
      style.visibility === "visible" &&
      (clickable
        ? !isDisabled(el)
        : // cursor is inherited, so only take the top of each pointer region,
          // and skip regions inside a semantic clickable.
          pointer && !parentPointer && !inClickable)
    ) {
      const visible = visibleRect(el, clip);
      if (visible) found.push({ el, rect: visible });
    }
    let childClip = clip;
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      childClip = {
        top: Math.max(clip.top, rect.top),
        left: Math.max(clip.left, rect.left),
        bottom: Math.min(clip.bottom, rect.bottom),
        right: Math.min(clip.right, rect.right),
      };
    }
    for (const child of el.children) visit(child, childClip, pointer, inClickable || clickable);
  };
  for (const child of document.body.children) visit(child, viewport, false, false);
  // Prefer the sortable row when both it and its thread link are available.
  const elements = new Set<Element>(found.map(({ el }) => el));
  const targets = found.filter(({ el }) => {
    if (!el.matches("a[href][data-sidebar-thread-id]")) return true;
    const row = el.closest('[data-sidebar-rename-row][role="button"][aria-roledescription="sortable"]');
    return !row || !elements.has(row);
  });
  // Drop a wrapper that starts at the same spot as a target inside it
  // (e.g. <a><button/></a>) to avoid two stacked labels.
  const deduped = targets.filter(
    (a) => !targets.some((b) => b !== a && a.el.contains(b.el) && sameCorner(a.rect, b.rect)),
  );
  return readingOrder(deduped.map((t) => t.rect)).map((i) => deduped[i]);
}

function sameCorner(a: DOMRect, b: DOMRect): boolean {
  return Math.abs(a.left - b.left) < 3 && Math.abs(a.top - b.top) < 3;
}

// A hover toolbar is small. A larger transparent element is a hidden panel or
// a fading overlay: making it hittable would cover the page.
const HOVER_BAR_MAX = { width: 480, height: 120 };

/**
 * Hover-only controls (message actions, sidebar Snooze and Settle) sit in an
 * `opacity: 0` wrapper, often also `pointer-events: none`. Without help they
 * fail the hit test or get a label the user cannot read. Show them and make
 * them hittable while hints are open; the returned function restores them.
 */
function revealHoverControls(): () => void {
  const saved: { el: HTMLElement; prop: string; value: string; priority: string }[] = [];
  const set = (el: HTMLElement, prop: string, value: string) => {
    saved.push({ el, prop, value: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) });
    el.style.setProperty(prop, value, "important");
  };
  // Read everything first, then write: a style write between reads forces a
  // fresh style and layout pass on the next read.
  const bars: { el: HTMLElement; inert: boolean }[] = [];
  const checked = new Set<Element>();
  for (const start of document.body.querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (start.closest(`[${ROOT_ATTR}]`) || !onScreen(start.getBoundingClientRect())) continue;
    // Ancestors above an already checked element are checked too.
    for (let el: HTMLElement | null = start; el && el !== document.body && !checked.has(el); el = el.parentElement) {
      checked.add(el);
      const style = getComputedStyle(el);
      if (parseFloat(style.opacity) >= 0.1) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > HOVER_BAR_MAX.width || rect.height > HOVER_BAR_MAX.height) continue;
      bars.push({ el, inert: style.pointerEvents === "none" });
    }
  }
  for (const { el, inert } of bars) {
    set(el, "opacity", "1");
    if (inert) set(el, "pointer-events", "auto");
  }
  return () => {
    for (const { el, prop, value, priority } of saved.reverse()) {
      if (value) el.style.setProperty(prop, value, priority);
      else el.style.removeProperty(prop);
    }
  };
}

function activate(el: HTMLElement): void {
  // The page may have changed since the labels were drawn.
  if (!el.isConnected || isDisabled(el)) return;
  const rect = visibleRect(el);
  if (!rect) return;
  if (isEditable(el)) {
    el.focus();
    return;
  }
  // Radix triggers (menus, selects) open on pointerdown, not click, so send
  // the full pointer sequence instead of el.click().
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
  /** Label box relative to its spot, measured once it is first drawn. */
  size: { ox: number; oy: number; w: number; h: number } | null;
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
    unreveal = revealHoverControls();
    const targets = collectTargets();
    if (targets.length === 0) return exit();
    const labels = makeLabels(targets.length, getChars());
    const box = document.createElement("div");
    root = box;
    box.setAttribute(ROOT_ATTR, "");
    box.setAttribute("aria-hidden", "true");
    hints = targets.map(({ el, rect }, i) => {
      const node = document.createElement("span");
      node.className = "bbium-hint";
      const typedNode = node.appendChild(document.createElement("span"));
      typedNode.className = "typed";
      const rest = node.appendChild(document.createElement("span"));
      box.appendChild(node);
      return { label: labels[i], el, node, typed: typedNode, rest, onScreen: true, iconOnly: isIconOnly(el, rect), size: null };
    });
    document.body.appendChild(box);
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
    const live: { h: Hint; spot: Spot; rect: DOMRect }[] = [];
    for (const h of hints) {
      const rect = h.el.isConnected ? visibleRect(h.el) : null;
      h.onScreen = rect !== null;
      const show = h.onScreen && h.label.startsWith(typed);
      h.node.style.display = show ? "" : "none";
      if (!rect) continue;
      const spot = labelSpot(rect, h.iconOnly);
      live.push({ h, spot, rect });
      if (!show) continue;
      h.node.className = spot.mode === "corner" ? "bbium-hint" : `bbium-hint ${spot.mode}`;
      h.node.style.left = `${spot.x}px`;
      h.node.style.top = `${spot.y}px`;
      h.typed.textContent = typed;
      h.rest.textContent = h.label.slice(typed.length);
    }
    // One layout pass for labels drawn the first time. Hidden labels (filtered
    // out by typed letters) keep their place in the layout, so the rest stay put.
    for (const { h, spot } of live) {
      if (h.size || h.node.style.display === "none") continue;
      const r = h.node.getBoundingClientRect();
      h.size = { ox: r.left - spot.x, oy: r.top - spot.y, w: r.width, h: r.height };
    }
    const sized = live.flatMap(({ h, spot, rect }) => (h.size ? [{ h, spot, rect, size: h.size }] : []));
    const boxes = sized.map(({ spot, size }) => ({ left: spot.x + size.ox, top: spot.y + size.oy, width: size.w, height: size.h }));
    // Anchor the buttons in each message toolbar as a row. The scroll viewport
    // ends above the composer and can differ between open thread panels.
    const rows = new Map<Element, { buttons: number[]; top: number; bottom: number; limit: number }>();
    sized.forEach(({ h, rect }) => {
      if (h.el.getAttribute("aria-label") !== "Copy message") return;
      const column = h.el.closest("[data-message-column]");
      const toolbar = h.el.parentElement;
      if (!column || !toolbar) return;
      const buttons = sized.flatMap(({ h: other }, j) => (other.iconOnly && toolbar.contains(other.el) ? [j] : []));
      if (!buttons.length) return;
      const viewport = column.closest("[data-page-scroll-viewport]")?.getBoundingClientRect();
      rows.set(column, {
        buttons,
        top: Math.min(rect.top, ...buttons.map((j) => sized[j].rect.top)),
        bottom: Math.max(rect.bottom, ...buttons.map((j) => sized[j].rect.bottom)),
        limit: Math.min(innerHeight, viewport?.bottom ?? innerHeight),
      });
    });
    const gap = 2;
    for (const row of rows.values()) {
      if (row.bottom + gap + Math.max(...row.buttons.map((j) => boxes[j].height)) > row.limit) continue;
      for (const j of row.buttons) boxes[j].top = row.bottom + gap;
    }
    sized.forEach(({ h, rect }, i) => {
      if (!h.el.matches("a[href]")) return;
      const column = h.el.closest("[data-message-column]");
      const row = column && rows.get(column);
      if (!row || rect.bottom > row.top + gap || row.top - rect.bottom > boxes[i].height) return;
      const above = rect.top - boxes[i].height - gap;
      const viewportTop = column?.closest("[data-page-scroll-viewport]")?.getBoundingClientRect().top ?? 0;
      if (above >= Math.max(0, viewportTop)) boxes[i].top = above;
    });
    const moves = spreadLabels(boxes, { width: innerWidth, height: innerHeight });
    sized.forEach(({ h, spot }, i) => {
      const dy = boxes[i].top - (spot.y + sized[i].size.oy) + moves[i].dy;
      if (!moves[i].dx && !dy) return;
      h.node.style.left = `${spot.x + moves[i].dx}px`;
      h.node.style.top = `${spot.y + dy}px`;
    });
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
      const el = live.find((h) => h.label === step.label)?.el;
      if (!el) return;
      // Activate first: a revealed control fails the live check once hidden again.
      activate(el);
      exit();
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
