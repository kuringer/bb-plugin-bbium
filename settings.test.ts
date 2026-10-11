import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHARS, DEFAULT_SCROLL_STEP, parseSettings } from "./keys.ts";
import { buildCss } from "./style.ts";

test("parseSettings: defaults for missing values", () => {
  assert.deepEqual(parseSettings(undefined), {
    enabled: true,
    chars: DEFAULT_CHARS,
    scrollStep: DEFAULT_SCROLL_STEP,
    theme: "vimium",
    customCss: "",
  });
});

test("parseSettings: keeps valid values", () => {
  const s = parseSettings({ vimKeys: false, hintCharacters: "ASDF", scrollStep: 120, theme: "bb", customCss: "x{}" });
  assert.deepEqual(s, { enabled: false, chars: "asdf", scrollStep: 120, theme: "bb", customCss: "x{}" });
});

test("parseSettings: rejects bad values", () => {
  const s = parseSettings({ scrollStep: -5, theme: "neon", customCss: 42 });
  assert.equal(s.scrollStep, DEFAULT_SCROLL_STEP);
  assert.equal(s.theme, "vimium");
  assert.equal(s.customCss, "");
  assert.equal(parseSettings({ scrollStep: "999999" }).scrollStep, 2000);
});

test("buildCss: custom CSS comes after the theme so it wins", () => {
  const css = buildCss("bb", "[data-bbium-root] { --bbium-bg: red; }");
  assert.ok(css.indexOf("var(--primary") < css.indexOf("--bbium-bg: red"));
  assert.match(css, /\.bbium-hint \.typed/);
});

test("buildCss: composer insert ring only while vim keys are on", () => {
  assert.match(buildCss("vimium", "", true), /\[data-promptbox\]:focus-within/);
  assert.doesNotMatch(buildCss("vimium", "", false), /data-promptbox/);
});
