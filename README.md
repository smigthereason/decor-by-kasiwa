# Decor by Kasiwa

A single Next.js + TypeScript application that runs the whole Decor by Kasiwa retail business: the customer-facing storefront, the Admin Office, and in-store Store Operations / POS. All three surfaces share one Sanity content lake for products, customers, orders, payments, inventory and audit history. Online payments go through Paystack, and in-store mobile payments go through Safaricom Daraja (M-PESA STK Push).

## Features

### Storefront (`app/(shop)`)
- Shop, shop-by-look, cart, wishlist, checkout, order tracking and customer account pages, plus content pages (about, services, portfolio, process, consultation, delivery, returns, FAQ, contact).
- Consultation requests are stored in Sanity (`/api/consultations`).
- SEO: `app/sitemap.ts` and `app/robots.ts`.
- "Recently viewed" products are kept in browser storage and synced to the customer's Sanity profile after sign-in.
- Optional GA4 page-view tracking.

### Checkout & payments
- **Paystack (online).**
  - `POST /api/paystack/initialize` rebuilds the order on the server from live Sanity products. It checks availability, live price and per-variant stock, adds the delivery-zone fee, writes a pending `commerceOrder` and `paymentTransaction`, and returns a Paystack checkout URL.
  - `GET /api/paystack/verify` and `POST /api/paystack/webhook` both finalize the payment. The webhook checks the `x-paystack-signature` HMAC-SHA512 header with a timing-safe comparison.
  - Finalization is idempotent. It re-verifies reference, currency and exact amount with Paystack, then commits stock deduction, store-ledger updates, inventory movements, the payment record, an audit event and a shipment in one revision-guarded Sanity transaction.
  - If stock changed after payment, the order stays paid and is flagged `inventoryReviewRequired`.
- **M-PESA (in-store POS).** `lib/mpesa/daraja.ts` handles STK Push initiation and status queries. `POST /api/payments/mobile/callback` receives the Daraja callback and always acknowledges it. A payment that couldn't be finalized stays pending and can be reconciled later.
- **Emails.** Order-confirmation and password-reset emails go out through a built-in SMTP client (`lib/email/smtp.ts`).

### Admin Office (`app/admin`)
Analytics (GA4 Data API), products, categories, shop looks, inventory, orders, shipments, customers, staff, stores, POS, workflow and settings (including delivery zones/rates and checkout settings).

### Store Operations & POS (`app/store`)
- POS with receipts and a POS operations view.
- Inventory and restock requests.
- Deliveries, dispatch, orders and shipments (management only).
- Customer interests, workflow stages and settings.
- Per-store inventory is held as location balances on `inventoryRecord`, and every change is logged as an `inventoryMovement`. Unavailable stock at the selected store is blocked at the POS.

### Auth & roles
- NextAuth (JWT sessions) with email/password credentials and Google sign-in. Users and roles are stored in Sanity.
- Account endpoints cover register, profile, password change, forgot-password and reset-password.
- Roles: `CUSTOMER`, `ADMIN`, `STORE`, `MANAGER`, `STORE_STAFF`, `PRODUCTION_STAFF`, `PACKAGING_STAFF`, `DELIVERY_STAFF`.
  - Admins land on `/admin`.
  - Store, manager and sales staff land on `/store`.
  - Production, packaging and delivery staff land on `/store/workflow`.
  - Inventory, shipment and dispatch management are limited to `ADMIN`, `STORE` and `MANAGER`.
- Staff sessions and activity are tracked (`staffSession`).

### Audit & fulfilment records
- `auditEvent` documents record events such as confirmed online payments.
- `shipment` documents are created automatically after a verified payment, either awaiting the store or opened in exception status when stock needs reconciling.
- Returns, till receipts and expenses have their own schemas.

## Tech stack (from package.json)
| Package | Version |
|---|---|
| next | ^16.2.1 |
| react / react-dom | 19.2.3 |
| typescript | ^5 |
| sanity | ^4.22.0 |
| @sanity/vision | ^4.22.0 |
| next-sanity | ^11.6.12 |
| @sanity/image-url | ^1.2.0 |
| next-auth | ^4.24.15 |
| tailwindcss / @tailwindcss/postcss | ^4 |
| framer-motion | ^12.34.3 |
| styled-components | ^6.5.3 |
| lucide-react | ^0.563.0 |
| react-icons | ^5.5.0 |
| eslint | ^9 |
| eslint-config-next | 16.1.6 |

## Data model (Sanity schemas, `sanity/schemaTypes`)
- **Catalogue & content:** `product`, `category`, `collection`, `shopLook`, `shopSpace`, `shopStyle`, `project`, `service`, `consultation`, `siteSettings`, `branding`
- **People:** `customerUser` (customers and staff, with roles), `staffSession`
- **Commerce:** `commerceOrder`, `paymentTransaction`, `tillReceipt`, `returnTransaction`, `expenseTransaction`
- **Inventory & fulfilment:** `storeLocation`, `inventoryRecord` (per-store balances), `inventoryMovement`, `restockRequest`, `shipment`
- **Audit:** `auditEvent`

When Sanity content changes, `POST /api/sanity/revalidate` revalidates the affected pages. It accepts only requests signed with `SANITY_REVALIDATE_SECRET` (HMAC-SHA256).

## Project structure
```text
app/
├── (shop)/      customer storefront (route group, invisible in URLs)
├── admin/       Admin Office
├── store/       Store Operations, POS, fulfilment
├── api/         server routes (paystack, payments, auth, account, backoffice, catalog, sanity, ...)
├── studio/      embedded Sanity Studio
└── developer/   developer page
components/      shared UI (storefront, backoffice)
lib/             domain logic: paystack, mpesa, pos, inventory, auth, email, analytics, shipping, stores
sanity/          schemas, structure, client config
scripts/         one-off Sanity data migrations / audits (run via `sanity exec`)
migration/       product import validation notes
types/           shared TypeScript types
```

## Getting started
```bash
npm ci
cp .env.example .env.local   # then fill in values
npm run dev
```

| Script | Command |
|---|---|
| `dev` / `build` / `start` | `next dev` / `next build` / `next start` |
| `lint` | `eslint` |
| `migrate:products:dry`, `migrate:products`, `migrate:products:images` | import products into Sanity |
| `migrate:stock-main:dry`, `migrate:stock-main` | assign existing stock to the Main store |
| `consolidate:stock-main:dry`, `consolidate:stock-main` | consolidate all stock to Main |
| `reconcile:online-ledger:dry`, `reconcile:online-ledger` | reconcile confirmed online sales into store ledgers |
| `audit:stock-history` | read-only inventory history audit |
| `prepare:stock-main:records` | prepare records-only stock approvals |

Every script that writes data requires an explicit `DBK_*_WRITE` flag. Use the `:dry` variants first.

### Environment variables (names only)
- **Sanity:** `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_WRITE_TOKEN`, `SANITY_REVALIDATE_SECRET`
- **Site:** `NEXT_PUBLIC_SITE_URL`, `DBK_MAIN_STORE_ID` (required only when more than one Main store exists)
- **Auth:** `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Paystack:** `PAYSTACK_SECRET_KEY`
- **M-PESA (Daraja):** `MPESA_ENV`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PARTY_B` (optional), `MPESA_PASSKEY`, `MPESA_TRANSACTION_TYPE`, `MPESA_CALLBACK_URL`
- **Email (SMTP):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` (`SMTP_PASS` is also read), `SMTP_HELO_NAME`, `SMTP_FROM`, `EMAIL_REPLY_TO`, `AUTH_EMAIL_FROM`, `ORDER_EMAIL_FROM`, `ORDER_EMAIL_REPLY_TO`
- **Analytics (optional):** `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL`, `GA4_PRIVATE_KEY`. Keep these server-side; the private key must never use a `NEXT_PUBLIC_` prefix.

## Status / known limitations
- There are no automated tests yet. Quality relies on TypeScript, ESLint and manual verification.
- The data scripts in `scripts/` are one-off operational migrations, so run them with `:dry` first.
- If stock changes between payment and finalization, the order still becomes paid but is flagged for manual inventory reconciliation before fulfilment.
- The Daraja callback is always acknowledged. Unfinalized M-PESA payments stay pending and need reconciling.
- `.env.example` doesn't yet list `PAYSTACK_SECRET_KEY`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` or `SANITY_REVALIDATE_SECRET`.
