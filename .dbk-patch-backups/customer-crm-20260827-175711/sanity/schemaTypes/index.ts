import type { SchemaTypeDefinition } from "sanity";

import { branding } from "./branding";
import { category } from "./category";
import { collection } from "./collection";
import { consultation } from "./consultation";
import { customerUser } from "./customerUser";
import { product } from "./product";
import { project } from "./project";
import { service } from "./service";
import { shopSpace } from "./shopSpace";
import { shopStyle } from "./shopStyle";
import { siteSettings } from "./siteSettings";
import { commerceOrder } from "./commerceOrder";
import { inventoryRecord } from "./inventoryRecord";
import { shipment } from "./shipment";

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    inventoryRecord,
    shipment,
    commerceOrder,
    product,
    collection,
    category,
    shopSpace,
    shopStyle,

    customerUser,

    project,
    service,
    consultation,

    branding,
    siteSettings,
  ],
};
