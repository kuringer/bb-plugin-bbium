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

type KeyInput = Pick<KeyboardEvent, "key" | "altKey" | "metaKey" | "ctrlKey" | "isComposing" | "timeStamp">;

/**
 * Normal-mode routing without DOM access. `lastG` is the timestamp of a
 * pending first `g` (0 = none). `handled` = the key belongs to bbium and must
 * not reach bb or the page.
 */
export function routeKey(
  e: KeyInput,
  lastG: number,
  editable: boolean,
): { action: Action | null; handled: boolean; lastG: number } {
  const ignore = { action: null, handled: false, lastG };
  if (editable || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return ignore;
  if (e.key === "g") {
    if (lastG && e.timeStamp - lastG < G_TIMEOUT_MS) return { action: { kind: "scroll", command: "top" }, handled: true, lastG: 0 };
    return { action: null, handled: true, lastG: e.timeStamp };
  }
  if (e.key === "f") return { action: { kind: "hints" }, handled: true, lastG: 0 };
  if (e.key === "i") return { action: { kind: "composer" }, handled: true, lastG: 0 };
  if (Object.hasOwn(SCROLL_KEYS, e.key)) return { action: { kind: "scroll", command: SCROLL_KEYS[e.key] }, handled: true, lastG: 0 };
  return ignore;
}

type EditorBox = { isProseMirror: boolean; bottom: number };

/**
 * Index of the composer among visible editors: bb's composer is a ProseMirror
 * editor, so it beats a terminal textarea; the lowest one is the thread
 * composer, inline message editors sit above it.
 */
export function pickComposer(editors: EditorBox[]): number {
  let best = -1;
  editors.forEach((e, i) => {
    const b = editors[best];
    if (!b || (e.isProseMirror && !b.isProseMirror) || (e.isProseMirror === b.isProseMirror && e.bottom > b.bottom)) best = i;
  });
  return best;
}

function focusComposer(): void {
  const editors = [...document.querySelectorAll<HTMLElement>("[contenteditable=true], textarea")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  });
  const i = pickComposer(
    editors.map((el) => ({ isProseMirror: el.classList.contains("ProseMirror"), bottom: el.getBoundingClientRect().bottom })),
  );
  editors[i]?.focus();
}

export type Keys = { apply(config: Config): void; dispose(): void };

/** Install the key handler and hint stylesheet in this window. */
export function createKeys(): Keys {
  let config = parseSettings(undefined);
  const hints = createHints(() => config.chars);
  const listeners = new AbortController();
  const style = document.createElement("style");
  style.dataset.bbium = "";
  document.head.appendChild(style);
  let lastG = 0;

  function onKeyDown(e: KeyboardEvent) {
    if (hints.active()) return hints.onKey(e);
    if (!config.enabled) return;
    const route = routeKey(e, lastG, isEditable(document.activeElement));
    lastG = route.lastG;
    if (!route.handled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const action = route.action;
    if (action?.kind === "hints") hints.enter();
    else if (action?.kind === "composer") focusComposer();
    else if (action?.kind === "scroll") scrollBy(action.command, config.scrollStep, e.repeat);
  }

  function onPointerDown(e: PointerEvent) {
    // Synthetic pointer events come from hint activation itself.
    if (!e.isTrusted) return;
    hints.exit();
    cancelPin();
    rememberScrollTarget(e.target);
  }

  function onWheel(e: WheelEvent) {
    if (e.isTrusted) cancelPin();
  }

  // Capture phase on window so bb's own shortcuts never see these keystrokes.
  window.addEventListener("keydown", onKeyDown, { capture: true, signal: listeners.signal });
  document.addEventListener("pointerdown", onPointerDown, { capture: true, signal: listeners.signal });
  window.addEventListener("wheel", onWheel, { capture: true, passive: true, signal: listeners.signal });

  return {
    apply(next) {
      config = next;
      if (!config.enabled) hints.exit();
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
