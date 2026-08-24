export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  category: "Furniture" | "Lighting" | "Textiles" | "Decor";
  price: number;
  currency: "KES";
  demoPrice?: boolean;
  description: string;
  story: string;
  materials: string[];
  dimensions: string;
  care: string;
  stock: "In stock" | "Made to order" | "Low stock";
  colours: string[];
  heroImage: string;
  images: string[];
  related: string[];
};

export type CartLine = {
  productId: string;
  quantity: number;
  colour?: string;
};

export type DemoUser = {
  name: string;
  email: string;
};

export type DemoAddress = {
  fullName: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  region: string;
  country: string;
};

export type DemoOrder = {
  id: string;
  createdAt: string;
  email: string;
  address: DemoAddress;
  paymentMethod: string;
  items: CartLine[];
  subtotal: number;
  status: "Order received";
};
