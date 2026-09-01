export type CatalogTag = {
  title: string;
  slug: string;
  imageUrl?: string | null;
};

export type ProductVariant = {
  id: string;
  title?: string;
  colour?: string;
  size?: string;
  sku?: string;
  price?: number;
  stockQuantity?: number | null;
  imageUrl?: string;
};

export type StoreProduct = {
  id: string;
  slug: string;
  sku?: string;

  name: string;

  category: string;
  categorySlug?: string;
  categoryId?: string;
  categoryParent?: CatalogTag;

  price: number;
  currency: "KES";
  ecommerceEnabled?: boolean;
  posEnabled?: boolean;
  demoPrice?: boolean;

  rating?: number;
  reviewCount?: number;

  description: string;
  story: string;

  materials: string[];
  dimensions: string;
  care: string;

  stock: string;
  stockQuantity?: number | null;

  colours: string[];
  variants?: ProductVariant[];

  heroImage: string;
  images: string[];

  related: string[];

  categories?: CatalogTag[];
  spaces?: CatalogTag[];
  styles?: CatalogTag[];
  collections?: CatalogTag[];

  featured?: boolean;
  newArrival?: boolean;
  bestSeller?: boolean;
  onSale?: boolean;

  available?: boolean;
};

export type ShopCategory =
  CatalogTag & {
    id: string;

    description?: string;

    imageUrl?:
      | string
      | null;

    children: CatalogTag[];
  };

export type ShopNavigation = {
  categories: ShopCategory[];

  spaces: CatalogTag[];

  styles: CatalogTag[];

  collections: CatalogTag[];
};

export type ShopLookProduct = {
  id: string;
  quantity: number;
  note?: string;
  product: StoreProduct;
};

export type ShopLook = {
  id: string;
  title: string;
  slug: string;
  eyebrow?: string;
  description: string;
  heroImageUrl?: string;
  space?: CatalogTag;
  style?: CatalogTag;
  products: ShopLookProduct[];
  featured?: boolean;
  active?: boolean;
  displayOrder?: number;
  seoTitle?: string;
  seoDescription?: string;
  totalPrice: number;
  totalUnits: number;
};

export type CartLine = {
  productId: string;
  quantity: number;
  colour?: string;
  size?: string;
  variantId?: string;
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
