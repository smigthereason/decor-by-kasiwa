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

export type PaymentStatus = "pending" | "paid" | "refunded" | "failed";

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

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  orders: number;
  lifetimeValue: number;
  lastOrderAt: string;
  role?: "CUSTOMER" | "ADMIN" | "STORE";
  status?: "ACTIVE" | "SUSPENDED";
  image?: string | null;
};

export type OrderLine = {
  id: string;
  productId: string;
  name: string;
  category: string;
  finish?: string;
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
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  assignedStore?: string;
  paymentReference?: string;
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
  available?: boolean;
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

export type OperationsSnapshot = {
  admin: AdminMetrics;
  store: StoreMetrics;
  products: InventoryItem[];
  customers: Customer[];
  orders: Order[];
  shipments: Shipment[];
  activity: ActivityEvent[];
  source: "sanity-live";
};
