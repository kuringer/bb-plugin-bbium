// Normal-mode keys for bb, active while focus is outside a text field.
// bb's composer already blurs itself on Esc, so Esc then a key below works.
//
//   f        hints: type a label to click or focus an element
//   j / k    scroll down / up
//   d / u    scroll half a screen down / up
//   gg / G   scroll to top / bottom
//   i        focus the composer

import { createHints, isEditable } from "./hints.ts";
import { cancelPin, rememberScrollTarget, scrollBy, type ScrollCommand } from "./scroll.ts";
import { buildCss, parseTheme, type Theme } from "./style.ts";

export const DEFAULT_CHARS = "sadfjklewcmpgh";
export const DEFAULT_SCROLL_STEP = 70;
const MAX_SCROLL_STEP = 2000;
export const G_TIMEOUT_MS = 800;

export type Config = { enabled: boolean; chars: string; scrollStep: number; theme: Theme; customCss: string };

/** Lowercase, unique a-z characters; falls back to the default below 2. */
export function parseChars(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_CHARS;
  const unique = [...new Set(raw.toLowerCase().replace(/[^a-z]/g, ""))].join("");
  return unique.length >= 2 ? unique : DEFAULT_CHARS;
}

/** Normalize raw plugin settings; bad values fall back to defaults. */
export function parseSettings(values: Record<string, unknown> | undefined): Config {
  const step = Number(values?.scrollStep);
  return {
    enabled: values?.vimKeys !== false,
    chars: parseChars(values?.hintCharacters),
    scrollStep: Number.isFinite(step) && step > 0 ? Math.min(Math.round(step), MAX_SCROLL_STEP) : DEFAULT_SCROLL_STEP,
    theme: parseTheme(values?.theme),
    customCss: typeof values?.customCss === "string" ? values.customCss : "",
  };
}

export type Action = { kind: "hints" } | { kind: "composer" } | { kind: "scroll"; command: ScrollCommand };

const SCROLL_KEYS: Record<string, ScrollCommand> = { j: "down", k: "up", d: "halfDown", u: "halfUp", G: "bottom" };
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

type KeyInput = Pick<KeyboardEvent, "key" | "altKey" | "metaKey" | "ctrlKey" | "isComposing" | "timeStamp">;

/**
 * Normal-mode routing without DOM access. `lastG` is the timestamp of a
 * pending first `g` (0 = none); any other key except a bare modifier cancels
 * it. `typing` = focus is in a text field or a typeahead popup. `handled` =
 * the key belongs to bbium and must not reach bb or the page.
 */
export function routeKey(
  e: KeyInput,
  lastG: number,
  typing: boolean,
): { action: Action | null; handled: boolean; lastG: number } {
  const ignore = { action: null, handled: false, lastG: MODIFIER_KEYS.has(e.key) ? lastG : 0 };
  if (typing || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return ignore;
  if (e.key === "g") {
    if (lastG && e.timeStamp - lastG < G_TIMEOUT_MS) return { action: { kind: "scroll", command: "top" }, handled: true, lastG: 0 };
    return { action: null, handled: true, lastG: e.timeStamp };
  }
  if (e.key === "f") return { action: { kind: "hints" }, handled: true, lastG: 0 };
  if (e.key === "i") return { action: { kind: "composer" }, handled: true, lastG: 0 };
  if (Object.hasOwn(SCROLL_KEYS, e.key)) return { action: { kind: "scroll", command: SCROLL_KEYS[e.key] }, handled: true, lastG: 0 };
  return ignore;
}

// Open menus and listboxes use letters for typeahead.
const TYPEAHEAD = "[role=menu],[role=listbox]";

/** Focus is somewhere that consumes letters; looks through shadow roots. */
function isTyping(e: KeyboardEvent): boolean {
  const target = e.composedPath()[0];
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return [target, active].some((el) => el instanceof Element && (isEditable(el) || !!el.closest(TYPEAHEAD)));
}

type EditorBox = { isProseMirror: boolean; inColumn: boolean; bottom: number };

/**
 * Index of the composer among visible editors. bb's composer is a ProseMirror
 * editor, so it beats a terminal textarea. Then an editor in the column where
 * the user last worked wins, so side-by-side panes focus their own composer.
 * Then the lowest one: inline message editors sit above the thread composer.
 */
export function pickComposer(editors: EditorBox[]): number {
  let best = -1;
  editors.forEach((e, i) => {
    const b = editors[best];
    if (
      !b ||
      (e.isProseMirror !== b.isProseMirror ? e.isProseMirror : e.inColumn !== b.inColumn ? e.inColumn : e.bottom > b.bottom)
    )
      best = i;
  });
  return best;
}

function focusComposer(anchor: Element | null): void {
  const editors = [...document.querySelectorAll<HTMLElement>("[contenteditable=true], textarea")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  });
  const a = anchor?.getBoundingClientRect();
  const x = a ? a.left + a.width / 2 : NaN;
  const i = pickComposer(
    editors.map((el) => {
      const r = el.getBoundingClientRect();
      return { isProseMirror: el.classList.contains("ProseMirror"), inColumn: x >= r.left && x <= r.right, bottom: r.bottom };
    }),
  );
  const editor = editors[i];
  if (!editor) return;
  editor.focus();
  // A plain DOM focus puts the caret at the start of a saved draft; continue typing at the end.
  if (editor instanceof HTMLTextAreaElement) editor.setSelectionRange(editor.value.length, editor.value.length);
  else {
    const sel = getSelection();
    sel?.selectAllChildren(editor);
    sel?.collapseToEnd();
  }
}

export type Keys = { apply(config: Config): void; dispose(): void };

/**
 * Install the key handler and hint stylesheet in this window. Keys stay off
 * until the first apply(), so a saved "off" setting holds while settings load.
 */
export function createKeys(): Keys {
  let config: Config = { ...parseSettings(undefined), enabled: false };
  const hints = createHints(() => config.chars);
  const listeners = new AbortController();
  const style = document.createElement("style");
  style.dataset.bbium = "";
  document.head.appendChild(style);
  let lastG = 0;
  let lastPointer: Element | null = null;

  function onKeyDown(e: KeyboardEvent) {
    // Any key, ours or native (PageDown, End...), ends a gg hold on the top.
    cancelPin();
    if (hints.active()) return hints.onKey(e);
    if (!config.enabled) return;
    const route = routeKey(e, lastG, isTyping(e));
    lastG = route.lastG;
    if (!route.handled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const action = route.action;
    if (action?.kind === "hints") {
      if (!e.repeat) hints.enter();
    } else if (action?.kind === "composer") {
      const active = document.activeElement;
      focusComposer(active && active !== document.body ? active : lastPointer?.isConnected ? lastPointer : null);
    } else if (action?.kind === "scroll") scrollBy(action.command, config.scrollStep, e.repeat);
  }

  function onPointerDown(e: PointerEvent) {
    // Synthetic pointer events come from hint activation itself.
    if (!e.isTrusted) return;
    hints.exit();
    cancelPin();
    lastG = 0;
    lastPointer = e.target instanceof Element ? e.target : null;
    rememberScrollTarget(e.target);
  }

  function onWheel(e: WheelEvent) {
    if (e.isTrusted) cancelPin();
  }

  // Capture phase on window so bb's own shortcuts never see these keystrokes.
  const opts = { capture: true, signal: listeners.signal };
  window.addEventListener("keydown", onKeyDown, opts);
  document.addEventListener("pointerdown", onPointerDown, opts);
  window.addEventListener("wheel", onWheel, { ...opts, passive: true });
  // A pending `g` belongs to the place it was typed in.
  const reset = () => {
    cancelPin();
    lastG = 0;
  };
  window.addEventListener("blur", reset, opts);
  document.addEventListener("focusin", reset, opts);

  return {
    apply(next) {
      config = next;
      if (!config.enabled) {
        hints.exit();
        cancelPin();
        lastG = 0;
      }
      style.textContent = buildCss(config.theme, config.customCss);
    },
    dispose() {
      listeners.abort();
      cancelPin();
      hints.exit();
      style.remove();
    },
  };
}
