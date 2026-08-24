# Client palette update

This copy changes **colour only**. No page structure, spacing, typography, component hierarchy, routes, data, or behavior was intentionally changed.

## Approved palette

- Deep Green: `#0E2B26`
- Sage Green: `#8CA78B`
- Warm Beige: `#E8DFCF`
- Soft Cream: `#FAF7F2`
- Gold: `#D4AF37`
- Charcoal: `#1F2321`

## Mapping used

- Main page background -> Soft Cream
- Secondary panels / navigation bands -> Warm Beige
- Typography / neutral dark -> Charcoal
- Primary dark surfaces and CTA backgrounds -> Deep Green
- Secondary neutral highlight -> Sage Green
- Existing accent gold token -> Client Gold
- Black/white Tailwind UI neutrals -> Charcoal/Soft Cream equivalents, preserving opacity
- Image overlay geometry and opacity -> unchanged; tint changed to Deep Green

## Intentionally not recoloured

Product finish swatches in `ProductCard.tsx` remain product-specific. Error states remain red. These are semantic/product colours rather than brand-surface colours.
