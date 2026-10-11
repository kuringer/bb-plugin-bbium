import { test } from "node:test";
import assert from "node:assert/strict";
import { hintKey, labelSpot, makeLabels, readingOrder } from "./hints.ts";
import { DEFAULT_CHARS, parseChars } from "./keys.ts";

const prefixFree = (labels: string[]) =>
  labels.every((a, i) => labels.every((b, j) => i === j || !b.startsWith(a)));

test("makeLabels: unique and prefix-free for many counts", () => {
  for (const n of [1, 2, 13, 14, 15, 40, 69, 196, 197, 500]) {
    const labels = makeLabels(n, DEFAULT_CHARS);
    assert.equal(labels.length, n);
    assert.equal(new Set(labels).size, n);
    assert.ok(prefixFree(labels), `prefix collision at n=${n}`);
    assert.ok(labels.every((l) => [...l].every((c) => DEFAULT_CHARS.includes(c))));
  }
});

test("makeLabels: single characters when targets fit the alphabet", () => {
  assert.ok(makeLabels(14, DEFAULT_CHARS).every((l) => l.length === 1));
  assert.deepEqual(makeLabels(0, DEFAULT_CHARS), []);
});

test("makeLabels: mixes lengths instead of all-two-letter labels", () => {
  const labels = makeLabels(20, DEFAULT_CHARS);
  assert.ok(labels.some((l) => l.length === 1));
  assert.ok(labels.every((l) => l.length <= 2));
});

test("parseChars: normalizes and falls back", () => {
  assert.equal(parseChars("AsDfAs"), "asdf");
  assert.equal(parseChars("a1 b"), "ab");
  assert.equal(parseChars("x"), DEFAULT_CHARS);
  assert.equal(parseChars(undefined), DEFAULT_CHARS);
});

test("readingOrder: rows top to bottom, then left to right", () => {
  const boxes = [
    { top: 100, left: 50 },
    { top: 10, left: 300 },
    { top: 12, left: 20 },
    { top: 100, left: 10 },
  ];
  assert.deepEqual(readingOrder(boxes), [2, 1, 3, 0]);
});

const k = (key: string, extra: Partial<KeyboardEvent> = {}) => ({
  key,
  repeat: false,
  isComposing: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...extra,
});

test("hintKey: a held f does not pick the label f", () => {
  assert.deepEqual(hintKey(k("f", { repeat: true }), "", "fj", ["f", "j"]), { kind: "swallow" });
  assert.deepEqual(hintKey(k("f"), "", "fj", ["f", "j"]), { kind: "activate", label: "f" });
});

test("hintKey: prefixes, backspace, misses", () => {
  const labels = ["sa", "sd", "f"];
  assert.deepEqual(hintKey(k("s"), "", "sadf", labels), { kind: "typed", typed: "s" });
  assert.deepEqual(hintKey(k("D"), "s", "sadf", labels), { kind: "activate", label: "sd" });
  assert.deepEqual(hintKey(k("Backspace"), "s", "sadf", labels), { kind: "typed", typed: "" });
  assert.deepEqual(hintKey(k("s"), "s", "sadf", labels), { kind: "exit" });
  assert.deepEqual(hintKey(k("x"), "", "sadf", labels), { kind: "exit" });
  assert.deepEqual(hintKey(k("Escape"), "", "sadf", labels), { kind: "exit" });
});

test("hintKey: only labels still on screen match", () => {
  assert.deepEqual(hintKey(k("f"), "", "fj", ["j"]), { kind: "exit" });
});

test("hintKey: modifiers release, Shift and IME pass", () => {
  assert.deepEqual(hintKey(k("r", { metaKey: true }), "", "fj", ["f"]), { kind: "release" });
  assert.deepEqual(hintKey(k("Shift"), "", "fj", ["f"]), { kind: "pass" });
  assert.deepEqual(hintKey(k("f", { isComposing: true }), "", "fj", ["f"]), { kind: "pass" });
});

test("labelSpot: text targets keep the corner, icons get the label on their top edge", () => {
  const r = (top: number, left: number, size = 24) => ({ top, left, width: size, height: size, bottom: top + size });
  assert.deepEqual(labelSpot(r(100, -5, 200), false), { x: 0, y: 100, mode: "corner" });
  assert.deepEqual(labelSpot(r(100, 50), true), { x: 62, y: 100, mode: "edge" });
  // The centered label must stay inside the window.
  assert.deepEqual(labelSpot(r(0, 0, 10), true), { x: 12, y: 16, mode: "edge" });
});
