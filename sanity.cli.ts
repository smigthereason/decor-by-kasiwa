import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: "g34n810u",
    dataset: "production",
  },

  deployment: {
    appId: "mu8hnwrwizl5ytgja5nc5zuz",
    autoUpdates: true,
  },
});
