## What you get

Every clickable thing in bb gets a short letter label: sidebar threads, navigation, composer controls, model and project pickers, buttons in the chat. Type the label and bb clicks it. Labels near the top of the screen come first, and most stay one or two letters long. Vim-style keys scroll the chat and bring you back to the composer.

## Keys

Keys work when focus is outside a text field. In the composer, press `Esc` first. bb blurs the composer and the agent keeps running.

- `f` shows hints. Type a label to click the element. Text fields get focus instead.
- `j` and `k` scroll down and up. `d` and `u` scroll half a screen.
- `gg` and `G` jump to the top and the bottom.
- `i` puts the cursor back in the composer.

In hint mode, `Backspace` removes the last letter and `Esc` closes hints. Hints follow their targets while the chat scrolls during an agent run. Menus and selects open as they would on a mouse click.

## Settings

- **Vim keys** - turn all keys off.
- **Hint characters** - the letters used for labels, home row first.

## Limits

Content inside the built-in Browser panel gets no hints. Hints come from the bb page structure, so a bb update can change which elements get a label.
