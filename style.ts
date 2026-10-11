// Hint styling. Three layers, later wins:
//   1. structural CSS that reads --bbium-* variables (with fallbacks)
//   2. a theme preset that sets those variables
//   3. the user's Custom CSS setting, appended verbatim
// skills/bbium/SKILL.md documents the variables and selectors for agents.

export const ROOT_ATTR = "data-bbium-root";
const ROOT = `[${ROOT_ATTR}]`;

export const THEMES = ["vimium", "keycap", "bb", "mono"] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(raw: unknown): Theme {
  return THEMES.includes(raw as Theme) ? (raw as Theme) : "vimium";
}

const BASE = `
${ROOT} { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
${ROOT} .bbium-hint {
  position: absolute;
  transform: translate(var(--bbium-offset-x, 0px), var(--bbium-offset-y, 0px));
  padding: var(--bbium-padding, 1px 4px);
  border-radius: var(--bbium-radius, 3px);
  font-family: var(--bbium-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--bbium-font-size, 11px);
  font-weight: var(--bbium-font-weight, 600);
  line-height: 1.3;
  letter-spacing: var(--bbium-letter-spacing, .04em);
  text-transform: var(--bbium-text-transform, uppercase);
  color: var(--bbium-fg);
  background: var(--bbium-bg);
  border: 1px solid var(--bbium-border);
  border-bottom-width: var(--bbium-border-bottom, 1px);
  box-shadow: var(--bbium-shadow, 0 1px 3px rgba(0,0,0,.35));
  opacity: var(--bbium-opacity, 1);
  white-space: nowrap;
}
${ROOT} .bbium-hint.edge {
  transform: translate(calc(-50% + var(--bbium-offset-x, 0px)), calc(-80% + var(--bbium-offset-y, 0px)));
}
${ROOT} .bbium-hint .typed { opacity: var(--bbium-typed-opacity, .35); color: var(--bbium-typed-color, inherit); }
`;

const THEME_VARS: Record<Theme, string> = {
  vimium: "--bbium-bg: #fde77a; --bbium-fg: #1a1400; --bbium-border: #c9a227;",
  // bb's own key chip look: card surface, bb border, a keycap bottom edge.
  keycap:
    "--bbium-bg: var(--card, #fff); --bbium-fg: var(--foreground, #151419); --bbium-border: color-mix(in oklab, var(--foreground, #151419) 22%, transparent); --bbium-border-bottom: 2px; --bbium-shadow: 0 2px 6px rgba(0,0,0,.14); --bbium-font: var(--font-mono, ui-monospace, monospace); --bbium-font-weight: 600; --bbium-radius: 5px; --bbium-padding: 0 5px; --bbium-typed-color: var(--primary, #cc4710); --bbium-typed-opacity: 1;",
  // bb's own tokens, so the preset follows the app theme and light/dark mode.
  bb: "--bbium-bg: var(--primary, #cc4710); --bbium-fg: var(--primary-foreground, #fff); --bbium-border: transparent; --bbium-font: var(--font-mono, ui-monospace, monospace); --bbium-radius: var(--radius, 4px);",
  mono: "--bbium-bg: var(--foreground, #151419); --bbium-fg: var(--background, #fbfaf8); --bbium-border: transparent; --bbium-shadow: none; --bbium-font: var(--font-mono, ui-monospace, monospace);",
};

// Insert mode: while the composer has focus, keys type text and `f` is a
// letter. A ring and an INSERT badge on the composer make that visible.
export const COMPOSER = "[data-promptbox]";

const INSERT = `
${COMPOSER}:focus-within {
  box-shadow: 0 0 0 var(--bbium-insert-width, 2px) var(--bbium-insert-color) !important;
}
${COMPOSER}:focus-within::after {
  content: var(--bbium-insert-label, "INSERT \\00B7  ESC");
  display: var(--bbium-insert-badge, block);
  position: absolute;
  top: 0;
  right: 14px;
  transform: translateY(-50%);
  padding: 0 6px;
  border-radius: 4px;
  font: 600 10px/16px var(--bbium-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  letter-spacing: .06em;
  color: var(--bbium-insert-fg);
  background: var(--bbium-insert-color);
  pointer-events: none;
  z-index: 1;
}
`;

const INSERT_VARS: Record<Theme, string> = {
  vimium: "--bbium-insert-color: #e0b400; --bbium-insert-fg: #1a1400;",
  keycap: "--bbium-insert-color: var(--ring, #f36525); --bbium-insert-fg: var(--primary-foreground, #fff);",
  bb: "--bbium-insert-color: var(--primary, #cc4710); --bbium-insert-fg: var(--primary-foreground, #fff);",
  mono: "--bbium-insert-color: var(--foreground, #151419); --bbium-insert-fg: var(--background, #fbfaf8);",
};

/** `enabled` = vim keys on; without them there is no mode to show. */
export function buildCss(theme: Theme, customCss: string, enabled = true): string {
  const insert = enabled ? `${INSERT}\n${COMPOSER} { ${INSERT_VARS[theme]} }\n` : "";
  return `${BASE}\n${ROOT} { ${THEME_VARS[theme]} }\n${insert}/* Custom CSS */\n${customCss}\n`;
}
