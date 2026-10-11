// bb-plugin-bbium: hint mode lives in the frontend content script (hints.ts).
// The server only declares settings; the frontend reads them via useSettings.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi) {
  bb.settings.define({
    plainF: {
      type: "boolean",
      label: "Open hints with f",
      description: "Press f when focus is outside a text field. Alt+F always works, also in the composer.",
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
