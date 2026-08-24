# DeepSeek Revision Recovery

This recovered project was reconstructed from the previously recovered Decor by Kasiwa repository and the DeepSeek shared-conversation export supplied as `deepseek-revisions.json`.

The project keeps the three-surface Next.js structure:

- `app/(shop)` — customer-facing shop
- `app/admin` — administration
- `app/store` — store / fulfilment

The client-approved palette remains:

- Deep Green `#0E2B26`
- Sage Green `#8CA78B`
- Warm Beige `#E8DFCF`
- Soft Cream `#FAF7F2`
- Gold `#D4AF37`
- Charcoal `#1F2321`

## Restored shop revisions

The shop side retains the accepted revisions from the transcript, including the full-width responsive checkout, redesigned cart, card-based shop grid, reusable product card, visible colour swatches, Buy Now, related-product cards, redesigned wishlist and account flows, checkout order item persistence, checkout success summary, track-order redesign, FAQ accordion and revised footer.

## Restored admin revisions

The admin side now includes the later revision set from the transcript:

- refreshed dashboard, customers, shipments and analytics pages;
- product add/edit/delete prototype controls;
- product image URL/preview support;
- padded product form fields and category dropdown;
- redesigned order list with filters;
- order detail screen;
- dispatch-to-store action;
- typed dispatch status transition to `ready_for_store`.

The admin mutations remain client-side prototype state until a persistent backend is connected.

## Build-safety corrections

Where the transcript used a display label as a typed status value (for example `"Ready for Fulfilment"`), the recovered project uses `ready_for_store`, which is compatible with the existing `OrderStatus` type and `StatusPill`.

`InventoryItem` now supports an optional `image` field for the restored admin product image UI.
