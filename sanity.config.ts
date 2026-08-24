"use client";

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schema } from "./sanity/schemaTypes";
import { dataset, projectId } from "./sanity/env";

export default defineConfig({
  name: "default",
  title: "Decor by Kasiwa",
  projectId: projectId || "placeholder",
  dataset,
  basePath: "/studio",
  plugins: [structureTool(), visionTool()],
  schema,
});
