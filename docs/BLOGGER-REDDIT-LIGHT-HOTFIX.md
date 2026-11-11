# Tết Đinh Mùi Blog · Reddit-inspired Light UI Hotfix

## Goal and scope

Apply [Reddit's publicly documented light brand style](https://redditinc.com/brand) to **https://duynguyen99.blogspot.com/**, with the theme's **existing** layout untouched.

Only `apps/web/public/blogger-assets/theme.css` changes; it is independent of the React Editor. The CSS is an *overlay*, not a Blogger XML layout rewrite.

### Design tokens

- Brand accent: `#FF4500` OrangeRed (official).
- Canvas: `#F2F6F7`; cards: `#FFFFFF`; borders: `#D7DFE2` (from official 2022 guide).
- Primary text: `#1B2426` (blog-specific readable ink).
- Links/white-text CTA: `#C93600`, hover `#B93100` (blog-specific accessibility variants).
- Reddit Sans with Arial/system fallbacks (the current Blogger theme already loads Reddit Sans).

### Components hotfixed

1. Main background, card and post title colors.
2. Header/navigation, submenus and dropdowns (light instead of graphite/dark).
3. `.readmore a`, `.hd-btn`, pagination, hover and keyboard focus.
4. Sidebar tabs, labels, search inputs and metadata links.
5. Post-body links, tables, quote/callout backgrounds and footer colors.
6. Upvote button *colors only* (no API, votes, counts, or JS changes).

### What is NOT changed

No Blogger XML structural tags, `b:section`, `b:widget`, grid/column width, `display`, spacing, post content, navigation URLs, widget order, authentication or Editor code.

## Important: make the stylesheet active on the live Blogger blog

The reviewed copy of the user's Blogger XML (`Pasted text(20261106-232703).txt`) **does not currently reference** the Cloudflare-hosted stylesheet. Pushing CSS to GitHub cannot, by itself, affect a Blogger theme that has never imported it. Verify the published HTML of the current live blog: it may be newer than this copy.

If not already installed, make a **one-time** addition in **Blogger → Theme → Back up** then **Edit HTML**, just before `</head>`:

```xml
<link href='https://duynguyen-reddit-editor.pages.dev/blogger-assets/theme.css' rel='stylesheet' type='text/css'/>
```

Save without altering other markup. This is the sole Blogger edit required for all future CSS-only GitHub hotfixes.

> Do not overwrite the live template with an older backup merely to insert this line; modify the published theme in place and back it up first. If the stylesheet is already linked, do not add it again.

## Verification after green CI and merge

1. Check the Cloudflare asset URL returns plain CSS (not Editor HTML): [theme.css](https://duynguyen-reddit-editor.pages.dev/blogger-assets/theme.css).
2. In DevTools → Network verify Blogspot loads `theme.css` successfully, with no CSP/mixed-content errors.
3. On blog home, article, category and mobile views, check menu and dropdowns are white with dark text; hover is soft OrangeRed.
4. Check `Read More`, article `.hd-btn`, pager and search/focus visibility.
5. Confirm sidebar order, content width, grid, widget events, upvote numbers and comments remain unchanged.
6. Use hard refresh after Cloudflare deployment; the asset currently advertises a 60-second cache TTL.

## Rollback

Revert the PR in GitHub, wait for Cloudflare redeploy, then reload. Alternatively remove only the external `<link>` if an immediate Blogger-side emergency rollback is needed. This reverts all overlay styles but leaves base Blogger layout intact.

## Reference confidence

Lingoapp's [Overview](https://redditbrand.lingoapp.com/s/Overview-orqY1E?v=46) and [Color](https://redditbrand.lingoapp.com/s/Color-R7y72J?v=46) are dynamically rendered; the exact current pixel appearance could not be verified from the static HTML. Token sources: [Reddit Inc Brand](https://redditinc.com/brand), [2022 official PDF](https://redditinc.com/hubfs/Reddit%20Inc/PDF/reddit_brand_guidelines_version_2022_2022-04-01-160548_akmi.pdf). Blog-specific WCAG colors are clearly differentiated.
