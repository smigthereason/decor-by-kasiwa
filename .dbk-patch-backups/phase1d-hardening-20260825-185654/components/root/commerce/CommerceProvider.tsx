"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import type {
  DemoUser,
  DemoOrder,
  CartLine,
  DemoAddress,
  StoreProduct,
} from "@/types/commerce";

type CommerceContextType = {
  hydrated: boolean;
  catalogueReady: boolean;
  catalogue: StoreProduct[];
  cart: CartLine[];
  cartCount: number;
  subtotal: number;
  user: DemoUser | null;
  wishlist: string[];
  orders: DemoOrder[];
  getProductById: (productId: string) => StoreProduct | undefined;
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
  const [catalogueReady, setCatalogueReady] = useState(false);
  const [catalogue, setCatalogue] = useState<StoreProduct[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [user, setUser] = useState<DemoUser | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [orders, setOrders] = useState<DemoOrder[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    async function loadCatalogue() {
      try {
        const response = await fetch("/api/catalog");
        const payload = (await response.json()) as { products?: StoreProduct[] };
        if (!cancelled && Array.isArray(payload.products)) setCatalogue(payload.products);
      } catch (error) {
        console.error("Failed to load live catalogue:", error);
      } finally {
        if (!cancelled) setCatalogueReady(true);
      }
    }
    loadCatalogue();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem("kasiwa-cart", JSON.stringify(cart)); }, [cart, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("kasiwa-user", JSON.stringify(user)); }, [user, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("kasiwa-wishlist", JSON.stringify(wishlist)); }, [wishlist, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("kasiwa-orders", JSON.stringify(orders)); }, [orders, hydrated]);

  const productMap = useMemo(() => new Map(catalogue.map((product) => [product.id, product])), [catalogue]);
  const getProductById = useCallback((productId: string) => productMap.get(productId), [productMap]);
  const cartCount = useMemo(() => cart.reduce((total, line) => total + line.quantity, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((total, line) => {
    const product = productMap.get(line.productId);
    return total + (product ? product.price * line.quantity : 0);
  }, 0), [cart, productMap]);

  function addToCart(productId: string, quantity: number, colour?: string) {
    setCart((current) => {
      const existingIndex = current.findIndex((line) => line.productId === productId && (line.colour || "") === (colour || ""));
      if (existingIndex >= 0) {
        const updated = [...current];
        updated[existingIndex] = { ...updated[existingIndex], quantity: updated[existingIndex].quantity + quantity };
        return updated;
      }
      return [...current, { productId, quantity, colour }];
    });
  }

  function updateQuantity(productId: string, quantity: number, colour?: string) {
    setCart((current) => {
      if (quantity <= 0) return current.filter((line) => !(line.productId === productId && (line.colour || "") === (colour || "")));
      return current.map((line) => line.productId === productId && (line.colour || "") === (colour || "") ? { ...line, quantity } : line);
    });
  }

  function removeFromCart(productId: string, colour?: string) {
    setCart((current) => current.filter((line) => !(line.productId === productId && (line.colour || "") === (colour || ""))));
  }

  function toggleWishlist(productId: string) {
    setWishlist((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }
  function isWishlisted(productId: string) { return wishlist.includes(productId); }
  function clearCart() { setCart([]); }

  function createOrder(details: { email: string; address: DemoAddress; paymentMethod: string }) {
    const order: DemoOrder = {
      id: `KAS-${Date.now().toString().slice(-6)}`,
      email: details.email,
      address: details.address,
      paymentMethod: details.paymentMethod,
      subtotal,
      items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity, colour: line.colour })),
      status: "Order received",
      createdAt: new Date().toISOString(),
    };
    setOrders((current) => [order, ...current]);
    setCart([]);
    return order;
  }

  function login(email: string, name?: string) {
    const userName = name || email.split("@")[0];
    setUser({ email, name: userName.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") });
  }
  function register(name: string, email: string) {
    setUser({ email, name: name.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") });
  }
  function logout() { setUser(null); }

  const value = useMemo(() => ({
    hydrated, catalogueReady, catalogue, cart, cartCount, subtotal, user, wishlist, orders,
    getProductById, addToCart, updateQuantity, removeFromCart, toggleWishlist, isWishlisted,
    clearCart, createOrder, login, register, logout,
  }), [hydrated, catalogueReady, catalogue, cart, cartCount, subtotal, user, wishlist, orders, getProductById]);

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce() {
  const context = useContext(CommerceContext);
  if (!context) throw new Error("useCommerce must be used within a CommerceProvider");
  return context;
}

export default CommerceProvider;
