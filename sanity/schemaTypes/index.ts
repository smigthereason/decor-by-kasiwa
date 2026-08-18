import type { SchemaTypeDefinition } from "sanity";
import { consultation } from "./consultation";
import { product } from "./product";
import { project } from "./project";
import { service } from "./service";
import { siteSettings } from "./siteSettings";

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [product, project, service, consultation, siteSettings],
};
