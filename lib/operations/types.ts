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
  lineItems: OrderLine[];
};

export type InventoryItem = {
  id: string;
  sku: string;
  productId: string;
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
