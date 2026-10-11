import { useEffect } from "react";
import { definePluginApp, useSettings } from "@get-bb/plugin-sdk/app";
import { config, mountHints, parseChars } from "./hints";

// Content scripts get no React context, so this invisible overlay copies the
// plugin settings into the shared hint config whenever they change.
function SettingsBridge() {
  const { values } = useSettings();
  useEffect(() => {
    config.chars = parseChars(values?.hintCharacters);
    config.plainF = values?.plainF !== false;
  }, [values?.hintCharacters, values?.plainF]);
  return null;
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "hint-mode",
    mount({ signal }) {
      return mountHints(signal);
    },
  });
  app.slots.experimental_appOverlay({ id: "settings-bridge", component: SettingsBridge });
});
