# Bbium

Vimium-style keys for [bb](https://getbb.app). Press `f`, type the label next to a button, link, thread or field, and bb clicks it. Scroll with `j`/`k` and `d`/`u`. No mouse.

## Install

```sh
bb plugin install git:https://github.com/kuringer/bb-plugin-bbium
```

Reload the bb window once after install.

## Use

Keys work when focus is outside a text field. In the composer, press `Esc` first: bb blurs the composer on Esc and does not stop the agent.

| Key | Action |
| --- | --- |
| `f` | Show hints, then type a label to click or focus that element |
| `j` / `k` | Scroll down / up |
| `d` / `u` | Scroll half a screen down / up |
| `gg` / `G` | Scroll to top / bottom |
| `i` | Focus the composer |

In hint mode: `Backspace` removes the last typed letter, `Esc` closes hints. Hints follow their targets while the chat scrolls.

Scroll keys move the area you last clicked into, else the largest scrollable area (the chat in a thread).

## Settings

In bb: Plugins > Bbium, or from the CLI (an agent can do this for you):

```sh
bb plugin config bbium set theme bb
bb plugin config bbium set customCss '[data-bbium-root] { --bbium-font-size: 13px; }'
```

Changes apply live, no reload.

| Setting | Default | Meaning |
| --- | --- | --- |
| `vimKeys` | `true` | Turn all keys on or off |
| `hintCharacters` | `sadfjklewcmpgh` | Label letters, home row first |
| `scrollStep` | `70` | Pixels per `j`/`k` |
| `theme` | `vimium` | `vimium` yellow, `bb` app accent (follows light/dark), `mono` |
| `customCss` | empty | CSS applied after the theme |

Hint styling uses CSS variables (`--bbium-bg`, `--bbium-fg`, `--bbium-font-size`, `--bbium-offset-y`...) on `[data-bbium-root]`. The full list is in [`skills/bbium/SKILL.md`](skills/bbium/SKILL.md). bb loads that skill for agents, so "make the hints bigger and blue" works in any thread.

## How it works

An app overlay (`experimental_appOverlay`, [`app.tsx`](app.tsx)) mounts once per bb window, renders nothing and installs one capture-phase key handler. It reads settings live with `useSettings`. Hint mode labels semantic controls (links, buttons, inputs, ARIA roles) and the outermost `cursor: pointer` elements that are visible and not covered. Activation sends the full pointer sequence, so Radix menus and selects open too. Hover-only controls (message and thread row actions) are shown while hints are open, and an icon-only button gets its label above the icon, so you can see what each label does.

Limits: content inside the built-in Browser panel (an iframe) gets no hints. Hint detection depends on bb's DOM, so a bb update can change which elements get a label.

## Develop

```sh
npm install
bb plugin install .   # path install
bb plugin dev         # rebuild and reload on save
npm run verify        # typecheck, tests, build
npm run e2e           # smoke test against a running bb (BB_URL, default http://localhost:38886; BB_THREAD=<thread path> adds scroll checks; needs Chrome)
```

Logic: [`keys.ts`](keys.ts) (key routing, settings), [`hints.ts`](hints.ts), [`scroll.ts`](scroll.ts), [`style.ts`](style.ts). Tests: [`hints.test.ts`](hints.test.ts), [`keys.test.ts`](keys.test.ts), [`settings.test.ts`](settings.test.ts), [`e2e/smoke.mjs`](e2e/smoke.mjs).

## License

MIT
