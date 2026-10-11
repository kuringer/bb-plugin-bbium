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

In bb: Plugins > Bbium.

- **Vim keys** - turn all keys off.
- **Hint characters** - letters for labels, home row first. Default `sadfjklewcmpgh`.

## How it works

A trusted frontend content script reads the bb app DOM. It labels semantic controls (links, buttons, inputs, ARIA roles) and the outermost `cursor: pointer` elements that are visible and not covered. Activation sends the full pointer sequence, so Radix menus and selects open too.

Limits: content inside the built-in Browser panel (an iframe) gets no hints. Hint detection depends on bb's DOM, so a bb update can change which elements get a label.

## Develop

```sh
npm install
bb plugin install .   # path install
bb plugin dev         # rebuild and reload on save
npm run verify        # typecheck, tests, build
```

Logic: [`keys.ts`](keys.ts) (key routing), [`hints.ts`](hints.ts), [`scroll.ts`](scroll.ts). Tests: [`hints.test.ts`](hints.test.ts).

## License

MIT
