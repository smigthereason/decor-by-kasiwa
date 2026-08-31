import type { SchemaTypeDefinition } from "sanity";

import { branding } from "./branding";
import { auditEvent } from "./auditEvent";
import { expenseTransaction } from "./expenseTransaction";
import { inventoryMovement } from "./inventoryMovement";
import { paymentTransaction } from "./paymentTransaction";
import { returnTransaction } from "./returnTransaction";
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
import { restockRequest } from "./restockRequest";
import { shopLook } from "./shopLook";

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    auditEvent,
    expenseTransaction,
    inventoryMovement,
    paymentTransaction,
    returnTransaction,
    inventoryRecord,
    shipment,
    restockRequest,
    commerceOrder,
    shopLook,
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
