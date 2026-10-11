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

function isVisible(el: HTMLElement, rect: DOMRect): boolean {
  if (!onScreen(rect)) return false;
  // Occlusion check: a modal or overlay above the element wins the hit test.
  const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1);
  const y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
  const hit = document.elementFromPoint(x, y);
  return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
}

function collectTargets(): HTMLElement[] {
  const found = new Set<HTMLElement>();
  for (const el of document.querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (el.closest(`[${ROOT_ATTR}]`)) continue;
    if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
    found.add(el);
  }
  // cursor is inherited, so only take the top of each pointer region, and
  // skip regions inside an element we already have.
  for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
    if (found.has(el) || el.closest(`[${ROOT_ATTR}]`)) continue;
    if (getComputedStyle(el).cursor !== "pointer") continue;
    const parent = el.parentElement;
    if (parent && getComputedStyle(parent).cursor === "pointer") continue;
    if (parent?.closest(CLICKABLE)) continue;
    found.add(el);
  }
  const visible = [...found].filter((el) => isVisible(el, el.getBoundingClientRect()));
  // Drop a wrapper that starts at the same spot as a target inside it
  // (e.g. <a><button/></a>) to avoid two stacked labels.
  const deduped = visible.filter((el) => !visible.some((other) => other !== el && el.contains(other) && sameCorner(el, other)));
  const order = readingOrder(deduped.map((el) => el.getBoundingClientRect()));
  return order.map((i) => deduped[i]);
}

function sameCorner(a: HTMLElement, b: HTMLElement): boolean {
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  return Math.abs(ra.left - rb.left) < 3 && Math.abs(ra.top - rb.top) < 3;
}

function activate(el: HTMLElement): void {
  if (!el.isConnected) return;
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

type Hint = { label: string; el: HTMLElement; node: HTMLSpanElement; typed: HTMLSpanElement; rest: HTMLSpanElement };

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

  function exit() {
    cancelAnimationFrame(frame);
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
    const labels = makeLabels(targets.length, getChars());
    root = document.createElement("div");
    root.setAttribute(ROOT_ATTR, "");
    root.setAttribute("aria-hidden", "true");
    hints = targets.map((el, i) => {
      const node = document.createElement("span");
      node.className = "bbium-hint";
      const typedNode = node.appendChild(document.createElement("span"));
      typedNode.className = "typed";
      const rest = node.appendChild(document.createElement("span"));
      root!.appendChild(node);
      return { label: labels[i], el, node, typed: typedNode, rest };
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
      const show = h.el.isConnected && onScreen(rect) && h.label.startsWith(typed);
      h.node.style.display = show ? "" : "none";
      if (!show) continue;
      h.node.style.left = `${Math.max(rect.left, 0)}px`;
      h.node.style.top = `${Math.max(rect.top, 0)}px`;
      h.typed.textContent = typed;
      h.rest.textContent = h.label.slice(typed.length);
    }
  }

  function scheduleRender() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Shift" || e.isComposing) return;
    // Let app and OS shortcuts (Cmd+R, Cmd+W...) through.
    if (e.metaKey || e.ctrlKey || e.altKey) return exit();
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Backspace") {
      typed = typed.slice(0, -1);
      return render();
    }
    const ch = e.key.toLowerCase();
    if (ch.length !== 1 || !getChars().includes(ch)) return exit();
    typed += ch;
    const matches = hints.filter((h) => h.label.startsWith(typed));
    if (matches.length === 0) return exit();
    const exact = matches.find((h) => h.label === typed);
    if (!exact) return render();
    exit();
    activate(exact.el);
  }

  return {
    active: () => root !== null,
    enter,
    exit,
    onKey,
    dispose: exit,
  };
}
