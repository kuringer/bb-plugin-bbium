import { test } from "node:test";
import assert from "node:assert/strict";
import { G_TIMEOUT_MS, pickComposer, routeKey } from "./keys.ts";

const key = (k: string, extra: Partial<KeyboardEvent> = {}) => ({
  key: k,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  isComposing: false,
  timeStamp: 1000,
  ...extra,
});

test("routeKey: single keys map to actions", () => {
  assert.deepEqual(routeKey(key("f"), 0, false).action, { kind: "hints" });
  assert.deepEqual(routeKey(key("i"), 0, false).action, { kind: "composer" });
  assert.deepEqual(routeKey(key("j"), 0, false).action, { kind: "scroll", command: "down" });
  assert.deepEqual(routeKey(key("k"), 0, false).action, { kind: "scroll", command: "up" });
  assert.deepEqual(routeKey(key("d"), 0, false).action, { kind: "scroll", command: "halfDown" });
  assert.deepEqual(routeKey(key("u"), 0, false).action, { kind: "scroll", command: "halfUp" });
  assert.deepEqual(routeKey(key("G"), 0, false).action, { kind: "scroll", command: "bottom" });
});

test("routeKey: gg within the timeout scrolls to top", () => {
  const first = routeKey(key("g", { timeStamp: 1000 }), 0, false);
  assert.equal(first.action, null);
  assert.equal(first.handled, true);
  assert.equal(first.lastG, 1000);
  const second = routeKey(key("g", { timeStamp: 1000 + G_TIMEOUT_MS - 1 }), first.lastG, false);
  assert.deepEqual(second.action, { kind: "scroll", command: "top" });
  assert.equal(second.lastG, 0);
});

test("routeKey: a late second g starts a new gg", () => {
  const late = routeKey(key("g", { timeStamp: 1000 + G_TIMEOUT_MS }), 1000, false);
  assert.equal(late.action, null);
  assert.equal(late.lastG, 1000 + G_TIMEOUT_MS);
});

test("routeKey: another key cancels a pending g", () => {
  assert.equal(routeKey(key("j"), 1000, false).lastG, 0);
});

test("routeKey: ignores text fields, modifiers, IME and unknown keys", () => {
  for (const [e, editable] of [
    [key("j"), true],
    [key("j", { metaKey: true }), false],
    [key("j", { ctrlKey: true }), false],
    [key("j", { altKey: true }), false],
    [key("j", { isComposing: true }), false],
    [key("x"), false],
    [key("Escape"), false],
  ] as const) {
    const r = routeKey(e, 0, editable);
    assert.equal(r.handled, false, `${e.key} editable=${editable}`);
    assert.equal(r.action, null);
  }
});

test("pickComposer: ProseMirror beats a lower textarea, lowest editor wins a tie", () => {
  assert.equal(pickComposer([]), -1);
  assert.equal(
    pickComposer([
      { isProseMirror: true, bottom: 300 },
      { isProseMirror: false, bottom: 900 },
      { isProseMirror: true, bottom: 800 },
    ]),
    2,
  );
  assert.equal(pickComposer([{ isProseMirror: false, bottom: 100 }]), 0);
});
