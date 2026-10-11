// bb-plugin-bbium: keyboard behavior lives in the frontend app overlay (app.tsx, keys.ts).
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
    scrollStep: {
      type: "number",
      label: "Scroll step (px)",
      description: "Distance for j/k. d/u always scroll half a screen.",
      default: 70,
    },
    theme: {
      type: "select",
      label: "Hint theme",
      options: ["keycap", "vimium", "bb", "mono"],
      description: "keycap: bb-style key chips with the typed letters in the accent color. vimium: yellow labels. bb: the app accent color, follows light/dark. mono: text color on background.",
      default: "keycap",
    },
    customCss: {
      type: "string",
      label: "Custom CSS",
      description: "Applied after the theme. Set --bbium-* variables on [data-bbium-root] or style .bbium-hint directly. See the bbium skill for the full list.",
      experimental_multiline: true,
      default: "",
    },
  });
}
