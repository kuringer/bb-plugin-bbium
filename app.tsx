import { useEffect } from "react";
import { definePluginApp, useSettings } from "@get-bb/plugin-sdk/app";
import { applySettings, mountKeys } from "./keys.ts";

// Content scripts get no React context, so this invisible overlay pushes the
// plugin settings into the key handler and the hint stylesheet on change.
function SettingsBridge() {
  const { values } = useSettings();
  useEffect(() => applySettings(values), [values]);
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
