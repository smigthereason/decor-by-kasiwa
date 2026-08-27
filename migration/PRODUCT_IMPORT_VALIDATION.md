# Decor by Kasiwa — Product Import Validation Report

## Scope

Prepared from `Decor By Kasiwa Products Information.xlsx` against the client-approved Decor by Kasiwa taxonomy already seeded in Sanity.
The generated `dbk-products.ndjson` intentionally includes only products that have a high-confidence category mapping and a positive source price.

## Import summary

- Source products: **246**
- Ready for Sanity import: **231**
- Category review required: **12**
- Blocked by source data quality: **3**
- Missing stock quantities: **16**
- Zero / non-positive source prices: **3**
- Missing source prices: **0**
- Duplicate normalized product names: **0**
- Generated slug collisions after normalization: **0**
- Products tagged to an explicit Shop by Space value: **19**
- Products tagged to an explicit Shop by Style value: **10**

## Deliberate migration decisions

- **SKU was not generated.** The source workbook contains no SKU values, and inventing operational SKUs would create business data that the client has not supplied.
- **Images, descriptions, materials, colours, variants and care instructions were not fabricated.** Those source columns are empty.
- **New Arrivals, Best Sellers, Offers and Clearance were not assigned automatically.** The source workbook does not provide reliable merchandising flags.
- **Shop by Space is only assigned where the product name explicitly supports it** (for example, Bathroom, Balcony, Gift).
- **Shop by Style is only assigned where the product name explicitly says Boho/Bohemian.**
- Missing stock is treated as unknown rather than zero. It does not block CMS import, but is listed as a warning for later inventory migration.

## Products requiring review

- Row 36: **Green Balcony Fence** — Review Required. Proposed category: Plants & Greenery. Reason: Likely artificial greenery/hedge decor, but the product name does not explicitly say plant. Data issue: Category requires review
- Row 47: **Purple Balcony Fence** — Review Required. Proposed category: Plants & Greenery. Reason: Likely artificial greenery/hedge decor, but the product name does not explicitly say plant. Data issue: Category requires review
- Row 65: **1 metre Lipin** — Review Required. Proposed category: Unmapped. Reason: No sufficiently reliable mapping from the product name to the approved taxonomy. Data issue: Category requires review
- Row 76: **Pink Balcony Fence** — Review Required. Proposed category: Plants & Greenery. Reason: Likely artificial greenery/hedge decor, but the product name does not explicitly say plant. Data issue: Category requires review
- Row 96: **Teddy Bear Small** — Review Required. Proposed category: Gifts & Packaging. Reason: Likely sold as a gift item, but the client taxonomy does not explicitly define plush gifts. Data issue: Category requires review
- Row 100: **Jungle green Balcony fence** — Review Required. Proposed category: Plants & Greenery. Reason: Likely artificial greenery/hedge decor, but the product name does not explicitly say plant. Data issue: Category requires review
- Row 124: **Calendars** — Review Required. Proposed category: Home Accessories. Reason: Likely a home accessory, but wall/table usage is not explicit. Data issue: Category requires review
- Row 136: **Red Balcony Fence** — Review Required. Proposed category: Plants & Greenery. Reason: Likely artificial greenery/hedge decor, but the product name does not explicitly say plant. Data issue: Category requires review
- Row 147: **Big Teddy Bear** — Review Required. Proposed category: Gifts & Packaging. Reason: Likely sold as a gift item, but the client taxonomy does not explicitly define plush gifts. Data issue: Category requires review
- Row 152: **Canadian leaf** — Blocked - Data Quality. Proposed category: Plants & Greenery. Reason: Product name directly indicates plant/tree/greenery. Data issue: Price is 0 or below
- Row 162: **A3 printed and laminated** — Review Required. Proposed category: Unmapped. Reason: No sufficiently reliable mapping from the product name to the approved taxonomy. Data issue: Category requires review
- Row 174: **Ficus Tree Banches** — Blocked - Data Quality. Proposed category: Plants & Greenery. Reason: Product name directly indicates plant/tree/greenery. Data issue: Price is 0 or below
- Row 206: **A3 Plain Boards** — Review Required. Proposed category: Unmapped. Reason: No sufficiently reliable mapping from the product name to the approved taxonomy. Data issue: Category requires review
- Row 225: **plastic-flower-vases** — Blocked - Data Quality. Proposed category: Vases & Planters. Reason: Product name explicitly contains 'vase'. Data issue: Price is 0 or below; Stock quantity missing
- Row 228: **Fluffy Fux Fur Sandals** — Review Required. Proposed category: Unmapped. Reason: Footwear does not map cleanly to the client-approved decor taxonomy. Data issue: Category requires review

## Import command after review

The generated import file contains only the ready products:

```bash
npx sanity dataset import sanity/seed/dbk-products.ndjson production --replace
```

This import does not alter the existing taxonomy documents because the product documents use separate `dbk-product-*` IDs.

## Post-import checks

1. Confirm the number of Products in Sanity equals the ready-product count above.
2. Spot-check at least one product from each major category.
3. Confirm zero-price products are absent until corrected.
4. Confirm review-required products are absent until approved.
5. Confirm products with source stock `0` are imported as unavailable.
6. Confirm products with missing source stock do not receive an invented stock quantity.