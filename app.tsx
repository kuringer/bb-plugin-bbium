import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountHints } from "./hints";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "hint-mode",
    mount({ signal }) {
      return mountHints(signal);
    },
  });
});
