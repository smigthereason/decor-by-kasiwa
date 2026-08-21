"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import type {
  DemoUser,
  DemoOrder,
  DemoCartLine,
  DemoAddress,
} from "@/types/commerce";
import { storeProducts } from "@/lib/products";

type CommerceContextType = {
  hydrated: boolean;
  cart: DemoCartLine[];
  cartCount: number;
  subtotal: number;
  user: DemoUser | null;
  wishlist: string[];
  orders: DemoOrder[];
  addToCart: (productId: string, quantity: number, colour?: string) => void;
  updateQuantity: (productId: string, quantity: number, colour?: string) => void;
  removeFromCart: (productId: string, colour?: string) => void;
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  clearCart: () => void;
  createOrder: (details: { email: string; address: DemoAddress; paymentMethod: string }) => DemoOrder;
  login: (email: string, name?: string) => void;
  register: (name: string, email: string) => void;
  logout: () => void;
};

const CommerceContext = createContext<CommerceContextType | null>(null);

export function CommerceProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [cart, setCart] = useState<DemoCartLine[]>([]);
  const [user, setUser] = useState<DemoUser | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [orders, setOrders] = useState<DemoOrder[]>([]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const storedCart = localStorage.getItem("kasiwa-cart");
      const storedUser = localStorage.getItem("kasiwa-user");
      const storedWishlist = localStorage.getItem("kasiwa-wishlist");
      const storedOrders = localStorage.getItem("kasiwa-orders");

      if (storedCart) setCart(JSON.parse(storedCart));
      if (storedUser) setUser(JSON.parse(storedUser));
      if (storedWishlist) setWishlist(JSON.parse(storedWishlist));
      if (storedOrders) setOrders(JSON.parse(storedOrders));
    } catch (error) {
      console.error("Failed to hydrate commerce state:", error);
    }
    setHydrated(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("kasiwa-cart", JSON.stringify(cart));
  }, [cart, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("kasiwa-user", JSON.stringify(user));
  }, [user, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("kasiwa-wishlist", JSON.stringify(wishlist));
  }, [wishlist, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("kasiwa-orders", JSON.stringify(orders));
  }, [orders, hydrated]);

  const cartCount = useMemo(
    () => cart.reduce((total, line) => total + line.quantity, 0),
    [cart]
  );

  const subtotal = useMemo(
    () =>
      cart.reduce((total, line) => {
        const product = storeProducts.find((p) => p.id === line.productId);
        return total + (product ? product.price * line.quantity : 0);
      }, 0),
    [cart]
  );

  function addToCart(productId: string, quantity: number, colour?: string) {
    setCart((current) => {
      const existingIndex = current.findIndex(
        (line) =>
          line.productId === productId &&
          (line.colour || "") === (colour || "")
      );

      if (existingIndex >= 0) {
        const updated = [...current];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      }

      return [...current, { productId, quantity, colour }];
    });
  }

  function updateQuantity(productId: string, quantity: number, colour?: string) {
    setCart((current) => {
      if (quantity <= 0) {
        return current.filter(
          (line) =>
            !(
              line.productId === productId &&
              (line.colour || "") === (colour || "")
            )
        );
      }

      return current.map((line) =>
        line.productId === productId &&
        (line.colour || "") === (colour || "")
          ? { ...line, quantity }
          : line
      );
    });
  }

  function removeFromCart(productId: string, colour?: string) {
    setCart((current) =>
      current.filter(
        (line) =>
          !(
            line.productId === productId &&
            (line.colour || "") === (colour || "")
          )
      )
    );
  }

  function toggleWishlist(productId: string) {
    setWishlist((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  }

  function isWishlisted(productId: string) {
    return wishlist.includes(productId);
  }

  function clearCart() {
    setCart([]);
  }

  function createOrder(details: {
    email: string;
    address: DemoAddress;
    paymentMethod: string;
  }) {
    const order: DemoOrder = {
      id: `KAS-${Date.now().toString().slice(-6)}`,
      email: details.email,
      address: details.address,
      paymentMethod: details.paymentMethod,
      subtotal,
      items: cart.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        colour: line.colour,
      })),
      status: "Prototype order",
      createdAt: new Date().toISOString(),
    };

    setOrders((current) => [order, ...current]);
    setCart([]);
    return order;
  }

  function login(email: string, name?: string) {
    const userName = name || email.split("@")[0];
    const capitalizedName = userName
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    setUser({
      email,
      name: capitalizedName,
    });
  }

  function register(name: string, email: string) {
    const capitalizedName = name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    setUser({
      email,
      name: capitalizedName,
    });
  }

  function logout() {
    setUser(null);
  }

  const value = useMemo(
    () => ({
      hydrated,
      cart,
      cartCount,
      subtotal,
      user,
      wishlist,
      orders,
      addToCart,
      updateQuantity,
      removeFromCart,
      toggleWishlist,
      isWishlisted,
      clearCart,
      createOrder,
      login,
      register,
      logout,
    }),
    [
      hydrated,
      cart,
      cartCount,
      subtotal,
      user,
      wishlist,
      orders,
      addToCart,
      updateQuantity,
      removeFromCart,
      toggleWishlist,
      isWishlisted,
      clearCart,
      createOrder,
      login,
      register,
      logout,
    ]
  );

  return (
    <CommerceContext.Provider value={value}>
      {children}
    </CommerceContext.Provider>
  );
}

export function useCommerce() {
  const context = useContext(CommerceContext);
  if (!context) {
    throw new Error("useCommerce must be used within a CommerceProvider");
  }
  return context;
}

export default CommerceProvider;
