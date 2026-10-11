import { useEffect } from "react";
import { definePluginApp, useSettings } from "@get-bb/plugin-sdk/app";
import { config, mountKeys, parseChars } from "./keys.ts";

// Content scripts get no React context, so this invisible overlay copies the
// plugin settings into the shared hint config whenever they change.
function SettingsBridge() {
  const { values } = useSettings();
  useEffect(() => {
    config.chars = parseChars(values?.hintCharacters);
    config.enabled = values?.vimKeys !== false;
  }, [values?.hintCharacters, values?.vimKeys]);
  return null;
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "vim-keys",
    mount({ signal }) {
      return mountKeys(signal);
    },
  });
  app.slots.experimental_appOverlay({ id: "settings-bridge", component: SettingsBridge });
});
