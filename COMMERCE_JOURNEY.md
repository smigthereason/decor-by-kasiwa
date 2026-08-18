# Decor by Kasiwa — Commerce Journey Extension

This overlay extends the existing full-bleed Decor by Kasiwa design without redesigning the home page, typography, colour system or editorial composition.

## Journey implemented

```text
Home / Search / Collection
        ↓
Shop listing
        ↓
Product detail
        ├── choose finish
        ├── choose quantity
        ├── save item
        └── add to bag
                ↓
Shopping bag
        ├── edit quantity
        ├── remove item
        ├── continue shopping
        ├── sign in (optional)
        └── checkout as guest
                ↓
Checkout
        1. Contact
        2. Delivery
        3. Payment & review
                ↓
Order confirmation
        ├── continue shopping
        └── account / registration
                ↓
Account + prototype order history
                ↓
Track order
```

## New routes

- `/shop/[slug]` — product detail journey
- `/cart` — shopping bag
- `/wishlist` — saved products
- `/checkout` — three-step checkout
- `/checkout/success` — order confirmation
- `/account` — customer dashboard
- `/account/login` — returning customer flow
- `/account/register` — registration flow
- `/account/forgot-password` — recovery flow placeholder
- `/track-order` — prototype order lookup
- `/delivery` — delivery policy destination
- `/returns` — returns policy destination
- `/faq` — support questions
- `/contact` — general contact destination

## Competition patterns used

### Wayfair UK

Observed patterns that informed this build:

- Product variations before adding to basket
- Prominent delivery estimate on the product page
- Add-to-basket state feedback
- Related / required product cross-selling
- Detailed specifications and dimensions
- Services or add-ons on relevant furniture products
- Reviews and verified-purchase social proof
- Return policy surfaced from the product journey
- Account, orders, favourites and order tracking as distinct customer flows
- Financing/payment flexibility presented near purchase decisions

### DUSK

Observed patterns that informed this build:

- Stock status, colour, quantity and add-to-bag grouped together
- Wishlist directly from product detail
- Delivery timing visible before checkout
- "Complete the Set" cross-selling
- Product descriptions plus details and dimensions
- Account sign-in promoted as a faster checkout route rather than blocking guest shopping
- Account-based loyalty and points

## Decor by Kasiwa decisions

We should not clone either retailer. For the first Decor by Kasiwa version:

- Keep guest checkout available.
- Keep account sign-in optional but useful.
- Keep saved items / wishlist.
- Use "Complete the room" instead of a generic related-products carousel.
- Use styling consultation links inside the product journey.
- Keep product details editorial and uncluttered.
- Do not add loyalty/rewards in v1 unless the client explicitly asks for it.
- Do not invent delivery or return promises; dedicated pages are included but remain policy placeholders until approved.
- Do not show fake customer reviews. Add reviews only once genuine review data exists.

## Prototype limitations

The extension deliberately makes the complete UX clickable, but it is not a production commerce backend yet.

- Cart, wishlist, account and prototype order history use `localStorage`.
- Prototype passwords are not stored or authenticated.
- Checkout does not process a real payment.
- Product prices are sample prototype values and are labelled as such.
- Delivery cost is not calculated because live fulfilment rules are not yet defined.
- Order tracking only finds prototype orders created in the same browser.

## Production integrations still required

1. Replace `lib/products.ts` with Sanity catalogue queries.
2. Add Sanity/product inventory fields or connect the final stock source.
3. Choose and connect production authentication.
4. Choose and connect the production payment provider(s).
5. Persist orders server-side.
6. Add transactional order confirmation emails.
7. Add real delivery-zone and delivery-fee rules.
8. Approve and publish legal delivery, return, privacy and terms policies.
9. Add real customer reviews only when review data exists.
10. Connect account order history and tracking to the live order system.

## Paste instructions

This ZIP is an overlay for the existing `decor-by-kasiwa` project.

1. Back up the current project or commit it to Git.
2. Extract the overlay.
3. Copy the contents of the overlay folder into the root of the current Decor by Kasiwa project.
4. Allow it to overwrite the files listed in `OVERWRITE_FILES.txt`.
5. Run `npm install` if dependencies are not already installed.
6. Run `npm run dev`.
7. Open `/shop` and click any product to test the complete journey.

No new package dependency was added in this extension.
