# Bbium

Vimium-style keyboard hints for [bb](https://getbb.app). Press `f`, type the label next to a button, link, thread or field, and bb clicks it. No mouse.

## Install

```sh
bb plugin install git:https://github.com/kuringer/bb-plugin-bbium
```

Reload the bb window once after install.

## Use

| Key | Action |
| --- | --- |
| `f` | Show hints (when focus is not in a text field) |
| `Alt+F` | Show hints from anywhere, also from the composer |
| label letters | Click or focus the element |
| `Backspace` | Remove the last typed letter |
| `Esc` or `Alt+F` | Close hints |

Hints follow their targets while the chat scrolls. Text fields get focus instead of a click.

## Settings

In bb: Plugins > Bbium.

- **Open hints with f** - turn off if a plain `f` gets in your way. `Alt+F` keeps working.
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

Logic: [`hints.ts`](hints.ts). Tests: [`hints.test.ts`](hints.test.ts).

## License

MIT
