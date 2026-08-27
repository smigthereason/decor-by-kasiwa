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
