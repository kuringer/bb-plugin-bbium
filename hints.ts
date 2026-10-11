// Vimium-style hint mode for the bb app shell.
//
// Trigger: `f` when focus is not in an editable field, or Alt+F from anywhere
// (the composer usually holds focus, so a plain `f` would be typed there).
// Then type the label shown next to an element to click or focus it.
// Esc or any key that is not a label character cancels.

const ALPHABET = "sadfjklewcmpgh";
const ROOT_ATTR = "data-bbium-root";

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

export function makeLabels(count: number, alphabet = ALPHABET): string[] {
  if (count <= 0) return [];
  let length = 1;
  while (alphabet.length ** length < count) length++;
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    let n = i;
    let label = "";
    for (let j = 0; j < length; j++) {
      label = alphabet[n % alphabet.length] + label;
      n = Math.floor(n / alphabet.length);
    }
    labels.push(label);
  }
  return labels;
}

function isEditable(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file"].includes(type);
  }
  return false;
}

function isVisible(el: HTMLElement, rect: DOMRect): boolean {
  if (rect.width < 2 || rect.height < 2) return false;
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) return false;
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
    if (el.parentElement?.closest(CLICKABLE)) continue;
    found.add(el);
  }
  const visible: HTMLElement[] = [];
  for (const el of found) {
    if (isVisible(el, el.getBoundingClientRect())) visible.push(el);
  }
  // Drop a semantic wrapper whose only visible child target sits at the same
  // spot (e.g. <a><button/></a>) to avoid two stacked labels.
  return visible.filter((el) => !visible.some((other) => other !== el && el.contains(other) && sameBox(el, other)));
}

function sameBox(a: HTMLElement, b: HTMLElement): boolean {
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  return Math.abs(ra.left - rb.left) < 3 && Math.abs(ra.top - rb.top) < 3;
}

function activate(el: HTMLElement): void {
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

export function mountHints(signal: AbortSignal): () => void {
  let root: HTMLDivElement | null = null;
  let hints: { label: string; el: HTMLElement; node: HTMLSpanElement }[] = [];
  let typed = "";

  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  function exit() {
    root?.remove();
    root = null;
    hints = [];
    typed = "";
  }

  function enter() {
    exit();
    const targets = collectTargets();
    if (targets.length === 0) return;
    const labels = makeLabels(targets.length);
    root = document.createElement("div");
    root.setAttribute(ROOT_ATTR, "");
    hints = targets.map((el, i) => {
      const rect = el.getBoundingClientRect();
      const node = document.createElement("span");
      node.className = "bbium-hint";
      node.style.left = `${Math.max(rect.left, 0)}px`;
      node.style.top = `${Math.max(rect.top, 0)}px`;
      node.textContent = labels[i];
      root!.appendChild(node);
      return { label: labels[i], el, node };
    });
    document.body.appendChild(root);
  }

  function render() {
    for (const h of hints) {
      const match = h.label.startsWith(typed);
      h.node.style.display = match ? "" : "none";
      if (match) h.node.innerHTML = `<span class="typed">${typed}</span>${h.label.slice(typed.length)}`;
    }
  }

  function swallow(e: KeyboardEvent) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (root) {
      if (e.key === "Shift") return;
      swallow(e);
      if (e.key === "Backspace") {
        typed = typed.slice(0, -1);
        render();
        return;
      }
      const ch = e.key.toLowerCase();
      if (e.key === "Escape" || ch.length !== 1 || !ALPHABET.includes(ch)) return exit();
      typed += ch;
      const matches = hints.filter((h) => h.label.startsWith(typed));
      if (matches.length === 0) return exit();
      const exact = matches.find((h) => h.label === typed);
      if (exact) {
        const el = exact.el;
        exit();
        activate(el);
        return;
      }
      render();
      return;
    }

    const altF = e.altKey && !e.metaKey && !e.ctrlKey && e.code === "KeyF";
    const plainF =
      e.key === "f" && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && !isEditable(document.activeElement);
    if (!altF && !plainF) return;
    swallow(e);
    enter();
  }

  const onScrollOrResize = () => {
    if (root) exit();
  };

  // Capture phase on window so bb's own shortcuts never see hint keystrokes.
  window.addEventListener("keydown", onKeyDown, { capture: true, signal });
  window.addEventListener("resize", onScrollOrResize, { signal });
  document.addEventListener("scroll", onScrollOrResize, { capture: true, passive: true, signal });
  window.addEventListener("blur", exit, { signal });

  return () => {
    exit();
    style.remove();
  };
}
