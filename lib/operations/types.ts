export type StaffRole = "ADMIN" | "STORE" | "STORE_STAFF";

export type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "ready_for_store"
  | "picking"
  | "packed"
  | "dispatched"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "partially_paid" | "refunded" | "failed";

export type ShipmentStatus =
  | "awaiting_store"
  | "received"
  | "picking"
  | "packed"
  | "ready_dispatch"
  | "dispatched"
  | "delivered"
  | "exception";

export type StockStatus = "healthy" | "low" | "out";

export type RestockReason = "out_of_stock" | "low_stock" | "needs_restock";
export type RestockRequestStatus = "open" | "acknowledged" | "resolved";

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  address1?: string;
  address2?: string;
  city?: string;
  region?: string;
  country?: string;
  orders: number;
  lifetimeValue: number;
  lastOrderAt: string;
  role?: "CUSTOMER" | "STORE_STAFF" | "STORE" | "ADMIN";
  status?: "ACTIVE" | "SUSPENDED";
  source?: "GOOGLE" | "GUEST_CHECKOUT" | "ADMIN" | "POS";
  authenticated?: boolean;
  image?: string | null;
};

export type OrderLine = {
  id: string;
  productId: string;
  name: string;
  category: string;
  finish?: string;
  size?: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryLocation: string;
  createdAt: string;
  updatedAt?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  assignedStore?: string;
  paymentReference?: string;
  discountAmount?: number;
  amountPaid?: number;
  balanceDue?: number;
  cashTendered?: number;
  cashChangeDue?: number;
  refundedAmount?: number;
  receiptNumber?: string;
  paymentProvider?: string;
  providerReceiptNumber?: string;
  salesChannel?: "ONLINE" | "POS";
  fulfilmentType?: "DELIVERY" | "IN_STORE";
  soldByName?: string;
  soldByRole?: StaffRole;
  soldAt?: string;
  paymentChannel?: string;
  dispatchedAt?: string;
  dispatchedByName?: string;
  deliveredAt?: string;
  deliveredByName?: string;
  lineItems: OrderLine[];
};

export type InventoryItem = {
  id: string;
  sku: string;
  productId: string;
  slug?: string;
  name: string;
  category: string;
  finish?: string;
  location: string;
  onHand: number;
  reserved: number;
  incoming: number;
  reorderPoint: number;
  unitCost: number;
  retailPrice: number;
  image?: string;
  shortDescription?: string;
  description?: string;
  available?: boolean;
  bestSeller?: boolean;
};

export type Shipment = {
  id: string;
  shipmentNumber: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  destination: string;
  carrier?: string;
  trackingNumber?: string;
  createdAt: string;
  updatedAt: string;
  status: ShipmentStatus;
  itemCount: number;
  totalUnits: number;
  notes?: string;
  dispatchedAt?: string;
  dispatchedByName?: string;
  deliveredAt?: string;
  deliveredByName?: string;
  deliveryConfirmationNote?: string;
};

export type RestockRequest = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  requestedById?: string;
  requestedByName: string;
  reason: RestockReason;
  note?: string;
  status: RestockRequestStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedByName?: string;
};

export type ActivityEvent = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
  type: "order" | "inventory" | "shipment" | "customer";
};

export type AdminMetrics = {
  revenue: number;
  openOrders: number;
  fulfilmentQueue: number;
  lowStock: number;
};

export type StoreMetrics = {
  awaitingReceipt: number;
  beingPicked: number;
  readyToDispatch: number;
  lowStock: number;
};

export type BackofficeNotifications = {
  newOrders: number;
  deliveries: number;
  restockRequests: number;
};

export type OperationsSnapshot = {
  admin: AdminMetrics;
  store: StoreMetrics;
  products: InventoryItem[];
  customers: Customer[];
  orders: Order[];
  shipments: Shipment[];
  restockRequests: RestockRequest[];
  activity: ActivityEvent[];
  viewerRole?: StaffRole;
  source: "sanity-live";
};
