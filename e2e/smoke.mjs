// End-to-end smoke test against a running bb with bbium installed.
//   BB_URL=http://localhost:38886 npm run e2e
// BB_THREAD=/projects/<id>/threads/<id> adds scroll checks on a long thread.
// Uses the system Chrome (playwright-core has no bundled browser).
// It never clicks a button: it only focuses the composer by label. It types one
// `f` into the composer and deletes it again.
import { chromium } from "playwright-core";

const url = process.env.BB_URL ?? "http://localhost:38886";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
}

const hints = () => page.locator("[data-bbium-root] .bbium-hint").count();
const focus = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a?.isContentEditable ? "editor" : (a?.tagName.toLowerCase() ?? "none");
  });
const composerText = () =>
  page.evaluate(() => [...document.querySelectorAll(".ProseMirror[contenteditable=true]")].at(-1)?.textContent ?? "");
// bb blurs its composer on Esc; the check fails if that ever changes.
const leaveEditor = async () => {
  await page.keyboard.press("Escape");
  return (await focus()) !== "editor";
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  // bb may autofocus the composer on load; a bare `i` would then land in the draft.
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("i");
  check("Esc leaves the composer", await leaveEditor());

  await page.keyboard.press("f");
  const count = await hints();
  check("f shows hints", count > 0, `${count} labels`);
  await page.keyboard.press("Escape");
  check("Esc closes hints", (await hints()) === 0);
  const revealed = await page.evaluate(
    () => [...document.querySelectorAll("*")].filter((e) => e.style.getPropertyPriority("opacity") === "important" || e.style.getPropertyPriority("pointer-events") === "important").length,
  );
  check("hover-only controls are hidden again", revealed === 0, `${revealed} still shown`);

  await page.keyboard.press("Alt+KeyF");
  check("Alt+F is not handled", (await hints()) === 0);

  await page.keyboard.press("i");
  check("i focuses the composer", (await focus()) === "editor");

  const before = await composerText();
  await page.keyboard.press("f");
  let typed;
  try {
    typed = await composerText();
  } finally {
    // Focus is still in the composer: remove the test `f` from the real draft.
    await page.keyboard.press("Backspace");
  }
  check("f in the composer types, no hints", (await hints()) === 0 && typed === before + "f", JSON.stringify({ before, typed, h: await hints() }));

  // Label of the composer: hints sit at the target's top-left corner.
  await leaveEditor();
  await page.keyboard.press("f");
  const label = await page.evaluate(() => {
    const editor = [...document.querySelectorAll(".ProseMirror[contenteditable=true]")].at(-1);
    if (!editor) return null;
    const r = editor.getBoundingClientRect();
    const hint = [...document.querySelectorAll("[data-bbium-root] .bbium-hint")].find((n) => {
      const h = n.getBoundingClientRect();
      return n.style.display !== "none" && Math.abs(h.left - Math.max(r.left, 0)) < 2 && Math.abs(h.top - Math.max(r.top, 0)) < 2;
    });
    return hint?.textContent ?? null;
  });
  check("composer has a label", !!label, label ?? "");
  if (label) {
    for (const c of label) await page.keyboard.press(c);
    check("typing the label focuses the composer", (await focus()) === "editor");
    check("hints close after activation", (await hints()) === 0);
  }

  await leaveEditor();
  const draft = await composerText();
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  check("gg is handled, not typed", (await hints()) === 0 && (await composerText()) === draft);

  if (process.env.BB_THREAD) {
    await page.goto(new URL(process.env.BB_THREAD, url).href, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await leaveEditor();
    const scrollTop = () =>
      page.evaluate(() => {
        let best = null;
        let area = 0;
        for (const el of document.body.querySelectorAll("*")) {
          if (!/auto|scroll/.test(getComputedStyle(el).overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
          const r = el.getBoundingClientRect();
          if (r.width * r.height > area) [best, area] = [el, r.width * r.height];
        }
        return best ? Math.round(best.scrollTop) : -1;
      });
    const start = await scrollTop();
    await page.keyboard.press("k");
    await page.waitForTimeout(600);
    const afterK = await scrollTop();
    check("k scrolls up", afterK < start, `${start} -> ${afterK}`);
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await page.waitForTimeout(1500);
    check("gg stays at the top", (await scrollTop()) === 0);
    await page.keyboard.press("Shift+KeyG");
    await page.waitForTimeout(1500);
    check("G scrolls down", (await scrollTop()) > 0);
  }

  check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
}

console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
