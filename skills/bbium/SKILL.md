---
name: bbium
description: Configure the Bbium plugin - Vimium-style keys in bb (f hints, j/k d/u scroll, gg/G, i). Use to change hint colors, size, font, position, theme, hint letters, scroll step, or to turn the keys off. Triggers - bbium, hint style, hint colors, vim keys in bb, f hints look.
---

# Bbium settings

Bbium adds keyboard control to the bb app. Keys work when focus is outside a text field (`Esc` leaves the composer):
`f` hints, `j`/`k` scroll, `d`/`u` half a screen, `gg`/`G` top and bottom, `i` composer.

## Read and change settings

```sh
bb plugin config bbium                         # show all values
bb plugin config bbium set theme bb
bb plugin config bbium set scrollStep 120
bb plugin config bbium set customCss '[data-bbium-root] { --bbium-font-size: 13px; }'
bb plugin config bbium unset customCss         # back to default
```

Changes apply live in every open bb window. No reload.

| Key              | Type    | Default          | Meaning                                                                                                                                                              |
| ---------------- | ------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vimKeys`        | boolean | `true`           | Turn all keys on or off                                                                                                                                              |
| `hintCharacters` | string  | `sadfjklewcmpgh` | Label letters, home row first. Non a-z letters are dropped; fewer than 2 = default                                                                                   |
| `scrollStep`     | number  | `70`             | Pixels per `j`/`k` (max 2000)                                                                                                                                        |
| `theme`          | select  | `vimium`         | `vimium` yellow, `keycap` bb-style key chips (typed letters in the accent color), `bb` app accent, `mono` text color on background; all but vimium follow light/dark |
| `customCss`      | string  | empty            | CSS appended after the theme, so it wins                                                                                                                             |

## Style hints with customCss

Set variables on `[data-bbium-root]`. Each one has a default, so set only what changes.

| Variable                                | Default                     | Controls                                        |
| --------------------------------------- | --------------------------- | ----------------------------------------------- |
| `--bbium-bg`                            | theme                       | Label background                                |
| `--bbium-fg`                            | theme                       | Label text color                                |
| `--bbium-border`                        | theme                       | Border color                                    |
| `--bbium-shadow`                        | `0 1px 3px rgba(0,0,0,.35)` | Box shadow                                      |
| `--bbium-radius`                        | `3px`                       | Corner radius                                   |
| `--bbium-padding`                       | `1px 4px`                   | Padding                                         |
| `--bbium-font`                          | system monospace            | Font family                                     |
| `--bbium-font-size`                     | `11px`                      | Font size                                       |
| `--bbium-font-weight`                   | `600`                       | Font weight                                     |
| `--bbium-letter-spacing`                | `.04em`                     | Letter spacing                                  |
| `--bbium-text-transform`                | `uppercase`                 | `none` shows lowercase labels                   |
| `--bbium-opacity`                       | `1`                         | Whole label opacity                             |
| `--bbium-typed-opacity`                 | `.35`                       | Opacity of letters already typed                |
| `--bbium-typed-color`                   | `inherit`                   | Color of letters already typed                  |
| `--bbium-border-bottom`                 | `1px`                       | Bottom border width (keycap edge)               |
| `--bbium-offset-x` / `--bbium-offset-y` | `0px`                       | Shift labels from the element's top-left corner |

Insert mode: while the composer has focus, keys type text. The composer then gets a ring and an `INSERT · ESC` badge. Set these variables on `[data-promptbox]` (not on `[data-bbium-root]`):

| Variable               | Default          | Controls                         |
| ---------------------- | ---------------- | -------------------------------- |
| `--bbium-insert-color` | theme            | Ring and badge color             |
| `--bbium-insert-fg`    | theme            | Badge text color                 |
| `--bbium-insert-width` | `2px`            | Ring width; `0px` hides the ring |
| `--bbium-insert-badge` | `block`          | `none` hides the badge           |
| `--bbium-insert-label` | `"INSERT · ESC"` | Badge text, a CSS string         |

bb theme tokens work as values: `var(--primary)`, `var(--primary-foreground)`, `var(--foreground)`, `var(--background)`, `var(--accent)`, `var(--border)`, `var(--font-mono)`, `var(--font-sans)`, `var(--radius)`.

Selectors for anything the variables do not cover:

- `[data-bbium-root]` - fixed full-window layer that holds all labels
- `[data-bbium-root] .bbium-hint` - one label
- `[data-bbium-root] .bbium-hint .typed` - letters already typed

Example - larger lowercase labels in the bb accent color, nudged up:

```sh
bb plugin config bbium set theme bb
bb plugin config bbium set customCss '[data-bbium-root] { --bbium-font-size: 13px; --bbium-text-transform: none; --bbium-radius: 6px; --bbium-offset-y: -4px; }'
```

## Verify a style change

1. Run `bb plugin config bbium` and check the stored value.
2. Ask the user to press `Esc` then `f` in bb and confirm the look. Labels close with `Esc`.

CSS is not validated. A syntax error drops the broken rule, and the theme still applies.
