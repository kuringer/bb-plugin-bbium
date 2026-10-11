import { useEffect, useRef } from "react";
import { definePluginApp, useSettings } from "@get-bb/plugin-sdk/app";
import { createKeys, parseSettings, type Keys } from "./keys.ts";

// An app overlay instead of a content script: it mounts once per bb window,
// outside route layouts, and has the React context that useSettings needs.
// It renders nothing; it owns the key handler's lifetime.
function KeyboardControl() {
  const { values } = useSettings();
  const keys = useRef<Keys | null>(null);

  useEffect(() => {
    const k = createKeys();
    keys.current = k;
    return () => {
      k.dispose();
      keys.current = null;
    };
  }, []);

  useEffect(() => keys.current?.apply(parseSettings(values)), [values]);

  return null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "keyboard-control", component: KeyboardControl });
});
