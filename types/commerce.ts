export type CatalogTag = {
  title: string;
  slug: string;
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
  demoPrice?: boolean;

  description: string;
  story: string;

  materials: string[];
  dimensions: string;
  care: string;

  stock: string;
  stockQuantity?: number | null;

  colours: string[];

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
