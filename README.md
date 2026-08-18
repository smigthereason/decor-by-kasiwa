# Decor by Kasiwa — Starter

A Next.js + TypeScript + Sanity starter for Decor by Kasiwa.

## Design direction

This first implementation deliberately moves away from the Daima Mkenya visual language while retaining the same general engineering philosophy:

- editorial oversized typography
- warm ivory / stone canvas
- architectural hairline borders
- asymmetric interior imagery
- compact catalogue navigation
- room-led product storytelling
- large project photography
- service + commerce positioning
- multi-step consultation funnel

The supplied visual references are inspiration only. Their names, logos and exact artwork are not included.

## Included routes

- `/` — editorial home page
- `/about`
- `/services`
- `/portfolio`
- `/shop`
- `/process`
- `/consultation`
- `/studio` — Sanity Studio
- `/api/consultations` — consultation submission API

## Sanity schemas

- Product
- Portfolio Project
- Service
- Consultation Enquiry
- Site Settings

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`.

## Sanity

Create or select a Sanity project and set:

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_WRITE_TOKEN=your_write_token
```

The write token is only used server-side by the consultation API.

## Current phase

This is the visual + architecture foundation, not the final ecommerce build.

Next implementation passes should add:

1. Sanity-powered homepage queries
2. dynamic `/portfolio/[slug]`
3. before/after comparison component
4. dynamic `/shop/[slug]`
5. cart + wishlist state
6. checkout/payment integration
7. image upload in consultation journey
8. email notifications for enquiries
9. search + filters
10. SEO, sitemap, metadata and analytics
11. responsive refinement
12. final client photography and copy


## Interaction pass

The starter has now been updated to:

- render full-bleed from viewport edge to viewport edge
- use responsive internal spacing rather than a fixed desktop container
- animate the full-screen navigation
- support working collection search
- support animated hero previous/next controls
- support clickable hero pagination dots and automatic cycling
- add mobile hero navigation controls
- animate the immersive room image and content on scroll
- animate service and portfolio content on entry
- support functional shop category filtering and query filtering
- respect `prefers-reduced-motion` for accessibility
