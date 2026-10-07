# Decor by Kasiwa

Next.js + TypeScript project for Decor by Kasiwa, containing the customer storefront, Admin Office and Store Operations in one application.

## Application surfaces

```text
app/
├── (shop)/   customer-facing site; route group is invisible in URLs
├── admin/    business administration
├── store/    fulfilment and inventory operations
├── api/      shared server routes
├── studio/   Sanity Studio entry point
├── layout.tsx
├── providers.tsx
└── globals.css
```

Examples:

- `app/(shop)/page.tsx` → `/`
- `app/(shop)/shop/page.tsx` → `/shop`
- `app/(shop)/cart/page.tsx` → `/cart`
- `app/admin/page.tsx` → `/admin`
- `app/store/page.tsx` → `/store`

## Client-approved palette

- Deep Green `#0E2B26`
- Sage Green `#8CA78B`
- Warm Beige `#E8DFCF`
- Soft Cream `#FAF7F2`
- Gold `#D4AF37`
- Charcoal `#1F2321`

The central semantic tokens are defined in `app/globals.css`.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

For a production check:

```bash
npm run build
```

## Sanity

Sanity has not been configured yet. The customer site and consultation route are intentionally build-safe without a Sanity project ID.

When ready, set:

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_WRITE_TOKEN=your_write_token
```

## Current persistence

Customer cart/account/order prototype data uses browser storage. Admin and Store operational screens currently use shared demo data from `lib/operations`.

Persistent commerce, staff authentication, inventory transactions, real payments and carrier integrations remain future backend work.

See `RECOVERY_NOTES.md`, `COMMERCE_JOURNEY.md` and `BACKOFFICE_IMPLEMENTATION.md` for more detail.


## Website analytics (GA4)

The public storefront can send page views to Google Analytics 4 and the Admin Analytics page can read visitor statistics through the GA4 Data API. Configure these only on the server/hosting environment (the private key must never use a `NEXT_PUBLIC_` prefix):

```env
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_PROPERTY_ID=123456789
GA4_CLIENT_EMAIL=decor-analytics@example-project.iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Grant the service account **Viewer** access to the GA4 property. The storefront starts collecting page views after the measurement ID is deployed; the Admin Analytics page displays visitors, new visitors, sessions, page views and top pages once reporting credentials are configured.

### Website analytics and recently viewed products

Optional Google Analytics 4 reporting uses `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL`, and `GA4_PRIVATE_KEY`.

The storefront keeps the latest 12 viewed products in browser storage so customers can see a Recently Viewed rail. When a customer is signed in, that local history is synchronised to their Sanity customer profile. Admins can see the history on the customer detail page, while Store Managers and Sales Staff can search name/email/phone under Store → Customer Interests. Anonymous browsing remains device-local until the shopper signs in; it is not silently tied to a person.
