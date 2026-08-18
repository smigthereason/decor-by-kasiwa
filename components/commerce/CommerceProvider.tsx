"use client";

import type {
  CartLine,
  DemoAddress,
  DemoOrder,
  DemoUser,
} from "@/types/commerce";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getProductById } from "@/lib/products";

type CommerceContextValue = {
  hydrated: boolean;
  cart: CartLine[];
  wishlist: string[];
  user: DemoUser | null;
  orders: DemoOrder[];
  cartCount: number;
  subtotal: number;
  addToCart: (productId: string, quantity?: number, colour?: string) => void;
  updateQuantity: (productId: string, quantity: number, colour?: string) => void;
  removeFromCart: (productId: string, colour?: string) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  login: (email: string) => void;
  register: (name: string, email: string) => void;
  logout: () => void;
  createOrder: (args: {
    email: string;
    address: DemoAddress;
    paymentMethod: string;
  }) => DemoOrder;
};

const STORAGE_KEY = "decor-by-kasiwa-commerce-v1";

const CommerceContext = createContext<CommerceContextValue | null>(null);

export default function CommerceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [user, setUser] = useState<DemoUser | null>(null);
  const [orders, setOrders] = useState<DemoOrder[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          cart?: CartLine[];
          wishlist?: string[];
          user?: DemoUser | null;
          orders?: DemoOrder[];
        };
        setCart(parsed.cart || []);
        setWishlist(parsed.wishlist || []);
        setUser(parsed.user || null);
        setOrders(parsed.orders || []);
      }
    } catch (error) {
      console.warn("Could not restore prototype commerce state", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cart, wishlist, user, orders })
    );
  }, [cart, wishlist, user, orders, hydrated]);

  const addToCart = useCallback(
    (productId: string, quantity = 1, colour?: string) => {
      setCart((current) => {
        const index = current.findIndex(
          (line) => line.productId === productId && line.colour === colour
        );
        if (index < 0) {
          return [...current, { productId, quantity: Math.max(1, quantity), colour }];
        }
        return current.map((line, lineIndex) =>
          lineIndex === index
            ? { ...line, quantity: line.quantity + Math.max(1, quantity) }
            : line
        );
      });
    },
    []
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number, colour?: string) => {
      if (quantity <= 0) {
        setCart((current) =>
          current.filter(
            (line) => !(line.productId === productId && line.colour === colour)
          )
        );
        return;
      }
      setCart((current) =>
        current.map((line) =>
          line.productId === productId && line.colour === colour
            ? { ...line, quantity }
            : line
        )
      );
    },
    []
  );

  const removeFromCart = useCallback((productId: string, colour?: string) => {
    setCart((current) =>
      current.filter(
        (line) => !(line.productId === productId && line.colour === colour)
      )
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  }, []);

  const isWishlisted = useCallback(
    (productId: string) => wishlist.includes(productId),
    [wishlist]
  );

  const login = useCallback((email: string) => {
    const clean = email.trim();
    const fallbackName = clean.split("@")[0] || "Kasiwa Customer";
    setUser({ name: fallbackName, email: clean });
  }, []);

  const register = useCallback((name: string, email: string) => {
    setUser({ name: name.trim() || "Kasiwa Customer", email: email.trim() });
  }, []);

  const logout = useCallback(() => setUser(null), []);

  const cartCount = useMemo(
    () => cart.reduce((total, line) => total + line.quantity, 0),
    [cart]
  );

  const subtotal = useMemo(
    () =>
      cart.reduce((total, line) => {
        const product = getProductById(line.productId);
        return total + (product?.price || 0) * line.quantity;
      }, 0),
    [cart]
  );

  const createOrder = useCallback(
    ({
      email,
      address,
      paymentMethod,
    }: {
      email: string;
      address: DemoAddress;
      paymentMethod: string;
    }) => {
      const order: DemoOrder = {
        id: `KSI-${Date.now().toString().slice(-8)}`,
        createdAt: new Date().toISOString(),
        email,
        address,
        paymentMethod,
        items: cart,
        subtotal,
        status: "Order received",
      };
      setOrders((current) => [order, ...current]);
      setCart([]);
      return order;
    },
    [cart, subtotal]
  );

  const value = useMemo<CommerceContextValue>(
    () => ({
      hydrated,
      cart,
      wishlist,
      user,
      orders,
      cartCount,
      subtotal,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      toggleWishlist,
      isWishlisted,
      login,
      register,
      logout,
      createOrder,
    }),
    [
      hydrated,
      cart,
      wishlist,
      user,
      orders,
      cartCount,
      subtotal,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      toggleWishlist,
      isWishlisted,
      login,
      register,
      logout,
      createOrder,
    ]
  );

  return (
    <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>
  );
}

export function useCommerce() {
  const value = useContext(CommerceContext);
  if (!value) {
    throw new Error("useCommerce must be used inside CommerceProvider");
  }
  return value;
}
