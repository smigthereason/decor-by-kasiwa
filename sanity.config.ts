"use client";

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";

import { schema } from "./sanity/schemaTypes";
import { structure } from "./sanity/structure";

export default defineConfig({
  name: "default",
  title: "Decor by Kasiwa",

  projectId: "g34n810u",
  dataset: "production",

  basePath: "/studio",

  plugins: [
    structureTool({ structure }),
    visionTool(),
  ],

  schema,

  document: {
    actions: (previousActions, context) => {
      if (context.schemaType !== "customerUser") {
        return previousActions;
      }

      return previousActions.filter(
        (action) => action.action !== "schedule",
      );
    },
  },
});
