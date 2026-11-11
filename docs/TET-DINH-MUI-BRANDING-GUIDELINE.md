# Tet Dinh Mui Branding Guideline

## Deployment

- Standalone, static page (not an Editor route): `apps/web/public/branding-guideline/index.html`
- Published URL after the branch merges to `main` and Cloudflare Pages deploys:
  **https://duynguyen-reddit-editor.pages.dev/branding-guideline/**
- Built by Vite's `public/` asset copy. No Editor import, authentication, OAuth, React Router or Blogger layout changes.
- The page is a **Tet Dinh Mui design system inspired by Reddit**, not Reddit's official brand website, and it does not reuse logos, Snoo or proprietary artwork.

## Verified brand references

1. [Reddit Brand System — Overview, version 46](https://redditbrand.lingoapp.com/s/Overview-orqY1E?v=46) (user-provided reference; dynamically rendered).
2. [Reddit Brand System — Color, version 46](https://redditbrand.lingoapp.com/s/Color-R7y72J?v=46) (user-provided reference; dynamically rendered).
3. [Reddit Inc — Brand](https://redditinc.com/brand): OrangeRed #FF4500 and Reddit Sans.
4. [Reddit Brand Guidelines 2022 (official PDF)](https://redditinc.com/hubfs/Reddit%20Inc/PDF/reddit_brand_guidelines_version_2022_2022-04-01-160548_akmi.pdf): OrangeRed, Beluga, Dugong, Dolphin, Seal, Narwhal, Urchin, Squid Ink, Mango 500, Mint 500, Alien 900 and OrangeRed 600.

The Lingoapp site uses client-side JavaScript, so page-equivalent/pixel-identical rendering cannot be certified from text extraction. This implementation captures the *design language*, not a 1:1 reproduction of the reference site's structure, text, or protected assets.

## Design inventory

| Category | Tokens | Use |
| --- | --- | --- |
| Core (2) | #FF4500, #FB133A | Brand accent, gradient reference |
| Neutrals (7) | #FFFFFF, #F2F6F7, #D7DFE2, #BBC7CC, #7A9299, #172E35, #000000 | Predominantly light surfaces, borders and copy |
| Support (3) | #FFA800, #00CCC0, #02315C | Data visualization/illustrations |
| Blog-adapted action | #C93600 | White-text CTA; approx. 5.24:1 contrast vs. white |
| Blog-adapted hover | #B93100 | White-text CTA hover; approx. 6.0:1 contrast vs. white |
| Blog-adapted ink | #1B2426 | Legibility on light surfaces |

Colors marked "Blog-adapted" are **not claimed to be official Reddit tokens**.

## Interactive elements

- Color-category filter with visible item count; click any swatch to copy HEX.
- Accessible primary, secondary and soft button examples; form and article-card examples.
- Client-side sample for button contrast ratio (WCAG AA for normal-sized white text).
- Copy-ready theme tokens and linked provenance.
- Keyboard focus states, skip link, section navigation and reduced-motion preference.
- No network API calls, account access or data persistence.

## Acceptance

```sh
npm ci
npm run check
npm run build
test -f apps/web/dist/branding-guideline/index.html
```

Check responsive sizes ~360, 760, 1024, 1440 px and use keyboard navigation. The reference guidance is a *snapshot*, not a live sync of Lingoapp content; there are no unverified claims about the number of entries in the official guide.
