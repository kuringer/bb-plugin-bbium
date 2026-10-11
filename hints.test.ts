import { test } from "node:test";
import assert from "node:assert/strict";
import { makeLabels, readingOrder } from "./hints.ts";
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
