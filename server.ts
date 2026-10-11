// bb-plugin-bbium: keyboard behavior lives in the frontend content script (keys.ts).
// The server only declares settings; the frontend reads them via useSettings.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi) {
  bb.settings.define({
    vimKeys: {
      type: "boolean",
      label: "Vim keys",
      description: "f hints, j/k and d/u scroll, gg/G top and bottom, i composer. Active when focus is outside a text field (press Esc in the composer).",
      default: true,
    },
    hintCharacters: {
      type: "string",
      label: "Hint characters",
      description: "Letters used for labels, home row first. At least 2 unique letters a-z.",
      default: "sadfjklewcmpgh",
    },
  });
}
