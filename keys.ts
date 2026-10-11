// Normal-mode keys for bb, active while focus is outside a text field.
// bb's composer already blurs itself on Esc, so Esc then a key below works.
//
//   f        hints: type a label to click or focus an element
//   j / k    scroll down / up
//   d / u    scroll half a screen down / up
//   gg / G   scroll to top / bottom
//   i        focus the composer

import { createHints, isEditable } from "./hints.ts";
import { rememberScrollTarget, scrollBy, type ScrollCommand } from "./scroll.ts";

export const DEFAULT_CHARS = "sadfjklewcmpgh";

export type KeyConfig = { chars: string; enabled: boolean };

// Read on every keystroke; app.tsx updates it from plugin settings.
export const config: KeyConfig = { chars: DEFAULT_CHARS, enabled: true };

/** Lowercase, unique a-z characters; falls back to the default below 2. */
export function parseChars(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_CHARS;
  const unique = [...new Set(raw.toLowerCase().replace(/[^a-z]/g, ""))].join("");
  return unique.length >= 2 ? unique : DEFAULT_CHARS;
}

const SCROLL_KEYS: Record<string, ScrollCommand> = {
  j: "down",
  k: "up",
  d: "halfDown",
  u: "halfUp",
  G: "bottom",
};

const G_TIMEOUT_MS = 800;

function focusComposer(): void {
  const editors = [...document.querySelectorAll<HTMLElement>("[contenteditable=true], textarea")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  });
  // The thread composer sits at the bottom; inline editors sit above it.
  editors.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
  editors[0]?.focus();
}

export function mountKeys(signal: AbortSignal): () => void {
  const hints = createHints(() => config.chars);
  let lastG = 0;

  function onKeyDown(e: KeyboardEvent) {
    if (hints.active()) return hints.onKey(e);
    if (!config.enabled || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isEditable(document.activeElement)) return;

    const key = e.key;
    let handled = true;
    if (key === "f") hints.enter();
    else if (key === "i") focusComposer();
    else if (key === "g") {
      if (e.timeStamp - lastG < G_TIMEOUT_MS) {
        scrollBy("top", false);
        lastG = 0;
      } else lastG = e.timeStamp;
    } else if (key in SCROLL_KEYS) scrollBy(SCROLL_KEYS[key], e.repeat);
    else handled = false;

    if (!handled) return;
    if (key !== "g") lastG = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // Capture phase on window so bb's own shortcuts never see these keystrokes.
  window.addEventListener("keydown", onKeyDown, { capture: true, signal });
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!e.isTrusted) return;
      hints.exit();
      rememberScrollTarget(e.target);
    },
    { capture: true, signal },
  );

  return () => hints.dispose();
}
