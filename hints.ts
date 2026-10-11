// Vimium-style hint mode for the bb app shell.
//
// Trigger: `f` when focus is not in a text field (can be turned off), or
// Alt+F from anywhere - the composer usually holds focus, so a plain `f`
// would be typed there. Then type the label next to an element to click or
// focus it. Esc, Alt+F again, or a key that is not a label character cancels.

export const DEFAULT_CHARS = "sadfjklewcmpgh";
const ROOT_ATTR = "data-bbium-root";

export type HintConfig = { chars: string; plainF: boolean };

// Read by the key handler on every keystroke; app.tsx updates it from settings.
export const config: HintConfig = { chars: DEFAULT_CHARS, plainF: true };

/** Lowercase, unique a-z characters; falls back to the default below 2. */
export function parseChars(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_CHARS;
  const unique = [...new Set(raw.toLowerCase().replace(/[^a-z]/g, ""))].join("");
  return unique.length >= 2 ? unique : DEFAULT_CHARS;
}

/**
 * Prefix-free labels with the shortest mix of lengths (Vimium's algorithm):
 * with 14 characters and 20 targets, most labels stay one character long.
 */
export function makeLabels(count: number, chars = DEFAULT_CHARS): string[] {
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

function isEditable(el: Element | null): boolean {
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

const STYLE = `
[${ROOT_ATTR}] { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
[${ROOT_ATTR}] .bbium-hint {
  position: absolute; padding: 1px 4px; border-radius: 3px;
  font: 600 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em;
  text-transform: uppercase; color: #1a1400; background: #fde77a;
  border: 1px solid #c9a227; box-shadow: 0 1px 3px rgba(0,0,0,.35); white-space: nowrap;
}
[${ROOT_ATTR}] .bbium-hint .typed { opacity: .35; }
`;

type Hint = { label: string; el: HTMLElement; node: HTMLSpanElement; typed: HTMLSpanElement; rest: HTMLSpanElement };

export function mountHints(signal: AbortSignal): () => void {
  let root: HTMLDivElement | null = null;
  let hints: Hint[] = [];
  let typed = "";
  let frame = 0;

  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  function exit() {
    cancelAnimationFrame(frame);
    root?.remove();
    root = null;
    hints = [];
    typed = "";
  }

  function enter() {
    exit();
    const targets = collectTargets();
    if (targets.length === 0) return;
    const labels = makeLabels(targets.length, config.chars);
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
    if (!root) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  function swallow(e: KeyboardEvent) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  const isAltF = (e: KeyboardEvent) => e.altKey && !e.metaKey && !e.ctrlKey && e.code === "KeyF";

  function onHintKey(e: KeyboardEvent) {
    if (e.key === "Shift" || e.isComposing) return;
    // Let app and OS shortcuts (Cmd+R, Cmd+W...) through.
    if (e.metaKey || e.ctrlKey) return exit();
    swallow(e);
    if (e.key === "Backspace") {
      typed = typed.slice(0, -1);
      return render();
    }
    const ch = e.key.toLowerCase();
    if (isAltF(e) || e.key === "Escape" || ch.length !== 1 || !config.chars.includes(ch)) return exit();
    typed += ch;
    const matches = hints.filter((h) => h.label.startsWith(typed));
    if (matches.length === 0) return exit();
    const exact = matches.find((h) => h.label === typed);
    if (!exact) return render();
    exit();
    activate(exact.el);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (root) return onHintKey(e);
    if (e.isComposing) return;
    const plainF =
      config.plainF &&
      e.key === "f" &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !isEditable(document.activeElement);
    if (!isAltF(e) && !plainF) return;
    swallow(e);
    enter();
  }

  // Capture phase on window so bb's own shortcuts never see hint keystrokes.
  window.addEventListener("keydown", onKeyDown, { capture: true, signal });
  window.addEventListener("resize", scheduleRender, { signal });
  document.addEventListener("scroll", scheduleRender, { capture: true, passive: true, signal });
  window.addEventListener("blur", exit, { signal });
  document.addEventListener("pointerdown", (e) => root && e.isTrusted && exit(), { capture: true, signal });

  return () => {
    exit();
    style.remove();
  };
}
