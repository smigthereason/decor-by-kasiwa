export const topNavigation = [
  {
    label: "Home",
    href: "/",
    key: "home",
  },
  {
    label: "Shop",
    href: "/shop",
    key: "shop",
  },
  {
    label: "New Arrivals",
    href: "/shop?collection=new-arrivals",
    key: "new-arrivals",
  },
  {
    label: "Best Sellers",
    href: "/shop?collection=best-sellers",
    key: "best-sellers",
  },
  {
    label: "About",
    href: "/about",
    key: "about",
  },
  {
    label: "Contact",
    href: "/contact",
    key: "contact",
  },
] as const;

export const priceLinks = [
  {
    label: "Under KES 500",
    href: "/shop?price=under-500",
  },
  {
    label: "KES 500 – 1,000",
    href: "/shop?price=500-1000",
  },
  {
    label: "KES 1,000 – 2,500",
    href: "/shop?price=1000-2500",
  },
  {
    label: "KES 2,500 – 5,000",
    href: "/shop?price=2500-5000",
  },
  {
    label: "Above KES 5,000",
    href: "/shop?price=above-5000",
  },
] as const;

export function categoryHref(slug: string) {
  return `/shop?category=${encodeURIComponent(slug)}`;
}