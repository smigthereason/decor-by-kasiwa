# Decor by Kasiwa — Admin + Store Operations

The project now contains three UI surfaces in the same Next.js application:

- `app/(shop)` — customer-facing storefront. The route-group name does not appear in public URLs.
- `app/admin` — business administration and reporting.
- `app/store` — physical fulfilment and inventory operations.

## Public route structure

Customer:
- `/`
- `/about`
- `/services`
- `/portfolio`
- `/shop`
- `/cart`
- `/checkout`
- `/account/*`
- `/wishlist`
- supporting customer routes

Admin:
- `/admin`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/products`
- `/admin/customers`
- `/admin/shipments`
- `/admin/analytics`

Store:
- `/store`
- `/store/orders`
- `/store/orders/[id]`
- `/store/shipments`
- `/store/inventory`
- `/store/dispatch`

Shared API:
- `/api/consultations`
- `/api/backoffice/overview`

## Layout ownership

`app/layout.tsx` owns only global metadata, font loading, CSS and providers.

`app/(shop)/layout.tsx` owns the customer SiteHeader and SiteFooter.

`app/admin/layout.tsx` and `app/store/layout.tsx` own their back-office shells, so customer navigation does not leak into internal screens.

## Order lifecycle

Customer checkout
→ Admin sees the order
→ Admin verifies / hands it to Store
→ Store receives
→ Store picks
→ Store packs
→ Store dispatches
→ Delivered

## Current data model

`lib/operations/*` contains the shared Admin/Store operational domain and demo data. It is deliberately independent from the React components so a persistent backend can replace the demo source later.

Production still needs staff authentication, role-based authorization, persistent orders, transaction-safe stock reservations, payment webhooks, audit logs, notifications and delivery/carrier integration.

## Client-approved palette

The operational surfaces use the same approved brand palette as the customer site:

- Deep Green `#0E2B26`
- Sage Green `#8CA78B`
- Warm Beige `#E8DFCF`
- Soft Cream `#FAF7F2`
- Gold `#D4AF37`
- Charcoal `#1F2321`

The layout and visual composition were not redesigned as part of the palette update.
