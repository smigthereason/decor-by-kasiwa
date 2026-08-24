# Decor by Kasiwa — Recovery Build

This recovery package was assembled from the GitHub ZIP supplied in chat and the previously prepared Admin + Store structure.

## Preserved
- Existing committed customer-facing design and component structure.
- Existing `(shop)` route group and its customer routes.
- Existing product/commerce demo behavior.
- Client-approved palette: Deep Green, Sage Green, Warm Beige, Soft Cream, Gold, Charcoal.
- Existing Sanity schema/config files for later use.

## Fixed
- Removed duplicate customer routes that existed both in `app/` and `app/(shop)/`.
- Root layout now contains only global providers/font/metadata.
- Customer header/footer are owned by `app/(shop)/layout.tsx` only.
- Unified the app provider with `components/root/commerce/CommerceProvider` used by the customer pages.
- Fixed the `DemoCartLine`/`CartLine` type mismatch in that provider.
- Added `/admin` and `/store` operational surfaces plus the shared back-office components.
- Added `/api/backoffice/overview` demo API.
- Applied the client-approved palette to the added Admin/Store UI without redesigning it.
- Made `/studio` safe while Sanity is intentionally not configured.

## Route structure
- `/`, `/about`, `/shop`, `/cart`, `/checkout`, etc. -> `app/(shop)/*`
- `/admin/*` -> Admin Office
- `/store/*` -> Store Operations
- `/api/*` -> shared server routes

## Sanity
Sanity is intentionally not connected yet. `app/api/consultations/route.ts` already avoids loading the Sanity client unless the required environment variables exist.
The `/studio` route currently shows a configuration placeholder so local/production builds can succeed without a Sanity project ID.

## Generated build files
`.next`, `node_modules`, local environment files, and other generated artifacts are intentionally excluded from the ZIP. Run `npm ci` then `npm run build` locally.
