"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { signOut, useSession } from "next-auth/react";

import type {
  DemoUser,
  DemoOrder,
  CartLine,
  DemoAddress,
  StoreProduct,
} from "@/types/commerce";

import {
  clampProductQuantity,
  isProductSoldOut,
} from "@/lib/catalogue";
import { getQuantityLineTotal } from "@/lib/product-pricing";

type CommerceContextType = {
  hydrated: boolean;

  catalogueReady: boolean;
  catalogueError: string | null;
  catalogue: StoreProduct[];

  cart: CartLine[];
  cartCount: number;
  subtotal: number;

  user: DemoUser | null;

  wishlist: string[];
  orders: DemoOrder[];

  getProductById: (
    productId: string,
  ) => StoreProduct | undefined;

  addToCart: (
    productId: string,
    quantity: number,
    colour?: string,
    size?: string,
    variantId?: string,
  ) => boolean;

  updateQuantity: (
    productId: string,
    quantity: number,
    colour?: string,
    size?: string,
    variantId?: string,
  ) => void;

  removeFromCart: (
    productId: string,
    colour?: string,
    size?: string,
    variantId?: string,
  ) => void;

  toggleWishlist: (
    productId: string,
  ) => void;

  isWishlisted: (
    productId: string,
  ) => boolean;

  clearCart: () => void;

  createOrder: (details: {
    email: string;
    address: DemoAddress;
    paymentMethod: string;
  }) => DemoOrder;

  logout: () => void;
};

const CommerceContext =
  createContext<CommerceContextType | null>(null);

function sameLine(
  line: CartLine,
  productId: string,
  colour?: string,
  size?: string,
  variantId?: string,
) {
  return (
    line.productId === productId &&
    (line.colour || "") === (colour || "") &&
    (line.size || "") === (size || "") &&
    (line.variantId || "") === (variantId || "")
  );
}

function clampLineQuantity(
  product: StoreProduct,
  quantity: number,
  variantId?: string,
) {
  const base = clampProductQuantity(product, quantity);
  const variant = variantId
    ? product.variants?.find((item) => item.id === variantId)
    : undefined;

  if (typeof variant?.stockQuantity === "number") {
    return Math.max(0, Math.min(base, variant.stockQuantity));
  }

  return base;
}

export function CommerceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    data: session,
    status: sessionStatus,
  } = useSession();

  const [storageHydrated, setStorageHydrated] =
    useState(false);

  const [catalogueReady, setCatalogueReady] =
    useState(false);

  const [catalogueError, setCatalogueError] =
    useState<string | null>(null);

  const [catalogue, setCatalogue] =
    useState<StoreProduct[]>([]);

  const [cart, setCart] =
    useState<CartLine[]>([]);

  const [wishlist, setWishlist] =
    useState<string[]>([]);

  const [orders, setOrders] =
    useState<DemoOrder[]>([]);

  /* ---------------------------------------------------------------------- */
  /* Real authenticated user from NextAuth                                  */
  /* ---------------------------------------------------------------------- */

  const user = useMemo<DemoUser | null>(() => {
    if (
      sessionStatus !== "authenticated" ||
      !session?.user?.email
    ) {
      return null;
    }

    const fallbackName =
      session.user.email
        .split("@")[0]
        .split(/[._-]/)
        .filter(Boolean)
        .map(
          (part) =>
            part.charAt(0).toUpperCase() +
            part.slice(1),
        )
        .join(" ");

    return {
      name:
        session.user.name?.trim() ||
        fallbackName ||
        "Customer",

      email: session.user.email,
    };
  }, [
    session?.user?.email,
    session?.user?.name,
    sessionStatus,
  ]);

  const hydrated =
    storageHydrated &&
    sessionStatus !== "loading";

  /* ---------------------------------------------------------------------- */
  /* Browser commerce state                                                  */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    try {
      const storedCart =
        localStorage.getItem("kasiwa-cart");

      const storedWishlist =
        localStorage.getItem(
          "kasiwa-wishlist",
        );

      const storedOrders =
        localStorage.getItem("kasiwa-orders");

      if (storedCart) {
        setCart(JSON.parse(storedCart));
      }

      if (storedWishlist) {
        setWishlist(
          JSON.parse(storedWishlist),
        );
      }

      if (storedOrders) {
        setOrders(JSON.parse(storedOrders));
      }

      /*
       * Remove the old prototype account.
       * Authentication is now owned by NextAuth.
       */
      localStorage.removeItem("kasiwa-user");
    } catch (error) {
      console.error(
        "Failed to hydrate commerce state:",
        error,
      );
    }

    setStorageHydrated(true);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Live Sanity catalogue                                                   */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogue() {
      try {
        const response = await fetch(
          "/api/catalog",
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            `Catalogue request failed with status ${response.status}`,
          );
        }

        const payload =
          (await response.json()) as {
            products?: StoreProduct[];
          };

        if (
          !Array.isArray(
            payload.products,
          )
        ) {
          throw new Error(
            "Catalogue response did not contain a products array",
          );
        }

        if (!cancelled) {
          setCatalogue(
            payload.products,
          );

          setCatalogueError(null);
        }
      } catch (error) {
        console.error(
          "Failed to load live catalogue:",
          error,
        );

        if (!cancelled) {
          setCatalogueError(
            "We could not load the live catalogue. Please refresh and try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setCatalogueReady(true);
        }
      }
    }

    loadCatalogue();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Persist browser-only commerce state                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!storageHydrated) return;

    localStorage.setItem(
      "kasiwa-cart",
      JSON.stringify(cart),
    );
  }, [cart, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;

    localStorage.setItem(
      "kasiwa-wishlist",
      JSON.stringify(wishlist),
    );
  }, [
    wishlist,
    storageHydrated,
  ]);

  useEffect(() => {
    if (!storageHydrated) return;

    localStorage.setItem(
      "kasiwa-orders",
      JSON.stringify(orders),
    );
  }, [orders, storageHydrated]);

  /* ---------------------------------------------------------------------- */
  /* Product lookups                                                         */
  /* ---------------------------------------------------------------------- */

  const productMap = useMemo(
    () =>
      new Map(
        catalogue.map(
          (product) => [
            product.id,
            product,
          ],
        ),
      ),
    [catalogue],
  );

  const getProductById =
    useCallback(
      (productId: string) =>
        productMap.get(productId),
      [productMap],
    );

  /* ---------------------------------------------------------------------- */
  /* Reconcile stale cart/wishlist against Sanity                            */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (
      !storageHydrated ||
      !catalogueReady ||
      catalogueError
    ) {
      return;
    }

    setCart((current) => {
      let changed = false;

      const next: CartLine[] = [];

      for (const line of current) {
        const product =
          productMap.get(
            line.productId,
          );

        if (
          !product ||
          isProductSoldOut(product)
        ) {
          changed = true;
          continue;
        }

        const quantity =
          clampProductQuantity(
            product,
            line.quantity,
          );

        if (
          quantity !==
          line.quantity
        ) {
          changed = true;
        }

        next.push({
          ...line,
          quantity,
        });
      }

      return changed
        ? next
        : current;
    });

    setWishlist((current) => {
      const next =
        current.filter(
          (productId) =>
            productMap.has(
              productId,
            ),
        );

      return next.length ===
        current.length
        ? current
        : next;
    });
  }, [
    storageHydrated,
    catalogueReady,
    catalogueError,
    productMap,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Totals                                                                  */
  /* ---------------------------------------------------------------------- */

  const cartCount = useMemo(
    () =>
      cart.reduce(
        (
          total,
          line,
        ) =>
          total +
          line.quantity,
        0,
      ),
    [cart],
  );

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (
          total,
          line,
        ) => {
          const product =
            productMap.get(
              line.productId,
            );

          const variantPrice = product?.variants?.find(
            (variant) => variant.id === line.variantId,
          )?.price;

          return (
            total +
            (product
              ? getQuantityLineTotal(product, line.quantity, variantPrice)
              : 0)
          );
        },
        0,
      ),
    [cart, productMap],
  );

  /* ---------------------------------------------------------------------- */
  /* Cart actions                                                            */
  /* ---------------------------------------------------------------------- */

  function addToCart(
    productId: string,
    quantity: number,
    colour?: string,
    size?: string,
    variantId?: string,
  ) {
    const product =
      productMap.get(productId);

    const variant = variantId
      ? product?.variants?.find((item) => item.id === variantId)
      : undefined;

    if (
      !product ||
      isProductSoldOut(product) ||
      variant?.stockQuantity === 0
    ) {
      return false;
    }

    const requested = clampLineQuantity(product, quantity, variantId);
    if (requested <= 0) return false;

    setCart((current) => {
      const existingIndex =
        current.findIndex(
          (line) =>
            sameLine(
              line,
              productId,
              colour,
              size,
              variantId,
            ),
        );

      if (
        existingIndex >= 0
      ) {
        const updated =
          [...current];

        const combinedQuantity =
          updated[
            existingIndex
          ].quantity +
          requested;

        updated[
          existingIndex
        ] = {
          ...updated[
            existingIndex
          ],

          quantity: clampLineQuantity(
            product,
            combinedQuantity,
            variantId,
          ),
        };

        return updated;
      }

      return [
        ...current,
        {
          productId,
          quantity:
            requested,
          colour,
          size,
          variantId,
        },
      ];
    });

    return true;
  }

  function updateQuantity(
    productId: string,
    quantity: number,
    colour?: string,
    size?: string,
    variantId?: string,
  ) {
    setCart((current) => {
      if (quantity <= 0) {
        return current.filter(
          (line) =>
            !sameLine(
              line,
              productId,
              colour,
              size,
              variantId,
            ),
        );
      }

      const product =
        productMap.get(
          productId,
        );

      if (
        !product ||
        isProductSoldOut(product)
      ) {
        return current.filter(
          (line) =>
            !sameLine(
              line,
              productId,
              colour,
              size,
              variantId,
            ),
        );
      }

      const safeQuantity = clampLineQuantity(
        product,
        quantity,
        variantId,
      );

      return current.map(
        (line) =>
          sameLine(
            line,
            productId,
            colour,
            size,
            variantId,
          )
            ? {
                ...line,
                quantity:
                  safeQuantity,
              }
            : line,
      );
    });
  }

  function removeFromCart(
    productId: string,
    colour?: string,
    size?: string,
    variantId?: string,
  ) {
    setCart((current) =>
      current.filter(
        (line) =>
          !sameLine(
            line,
            productId,
            colour,
            size,
            variantId,
          ),
      ),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Wishlist                                                                */
  /* ---------------------------------------------------------------------- */

  function toggleWishlist(
    productId: string,
  ) {
    setWishlist((current) =>
      current.includes(
        productId,
      )
        ? current.filter(
            (id) =>
              id !==
              productId,
          )
        : [
            ...current,
            productId,
          ],
    );
  }

  function isWishlisted(
    productId: string,
  ) {
    return wishlist.includes(
      productId,
    );
  }

  function clearCart() {
    setCart([]);
  }

  /* ---------------------------------------------------------------------- */
  /* Temporary order workflow                                                */
  /* ---------------------------------------------------------------------- */

  function createOrder(
    details: {
      email: string;
      address: DemoAddress;
      paymentMethod: string;
    },
  ) {
    const validItems =
      cart.flatMap(
        (line) => {
          const product =
            productMap.get(
              line.productId,
            );

          if (
            !product ||
            isProductSoldOut(
              product,
            )
          ) {
            return [];
          }

          return [
            {
              ...line,
              quantity:
                clampProductQuantity(
                  product,
                  line.quantity,
                ),
            },
          ];
        },
      );

    if (
      validItems.length === 0
    ) {
      throw new Error(
        "No purchasable items remain in the bag.",
      );
    }

    const validSubtotal =
      validItems.reduce(
        (
          total,
          line,
        ) => {
          const product =
            productMap.get(
              line.productId,
            );

          const variantPrice = product?.variants?.find(
            (variant) => variant.id === line.variantId,
          )?.price;

          return (
            total +
            (product
              ? getQuantityLineTotal(product, line.quantity, variantPrice)
              : 0)
          );
        },
        0,
      );

    const order: DemoOrder =
      {
        id: `KAS-${Date.now()
          .toString()
          .slice(-6)}`,

        email:
          details.email,

        address:
          details.address,

        paymentMethod:
          details.paymentMethod,

        subtotal:
          validSubtotal,

        items:
          validItems,

        status:
          "Order received",

        createdAt:
          new Date().toISOString(),
      };

    setOrders(
      (current) => [
        order,
        ...current,
      ],
    );

    setCart([]);

    return order;
  }

  /* ---------------------------------------------------------------------- */
  /* Authentication                                                          */
  /* ---------------------------------------------------------------------- */

  function logout() {
    void signOut({
      callbackUrl: "/",
    });
  }

  const value =
    useMemo(
      () => ({
        hydrated,

        catalogueReady,
        catalogueError,
        catalogue,

        cart,
        cartCount,
        subtotal,

        user,

        wishlist,
        orders,

        getProductById,

        addToCart,
        updateQuantity,
        removeFromCart,

        toggleWishlist,
        isWishlisted,

        clearCart,
        createOrder,

        logout,
      }),
      [
        hydrated,

        catalogueReady,
        catalogueError,
        catalogue,

        cart,
        cartCount,
        subtotal,

        user,

        wishlist,
        orders,

        getProductById,
      ],
    );

  return (
    <CommerceContext.Provider
      value={value}
    >
      {children}
    </CommerceContext.Provider>
  );
}

export function useCommerce() {
  const context =
    useContext(
      CommerceContext,
    );

  if (!context) {
    throw new Error(
      "useCommerce must be used within a CommerceProvider",
    );
  }

  return context;
}

export default CommerceProvider;
