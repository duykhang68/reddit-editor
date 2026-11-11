# Daily Expenses · Reddit OrangeRed Light Rebrand

Date: 2026-11-07  
Target page: /expenses/  
Scope: UI-only changes; no changes to transactions, budgets, forecasting, or storage.

## References and visual rationale

- Reddit Brand System / Overview: https://redditbrand.lingoapp.com/s/Overview-orqY1E/
- Reddit Brand System / Color: https://redditbrand.lingoapp.com/s/Color-R7y72J?v=46
- Existing local reference: /starbucks-insights/
- The app is independently branded **Duy Nguyen**. It borrows a visual language, and does not use Reddit's logo or imply partnership or endorsement.

## Brand tokens

| Purpose | Color | Use |
|---|---|---|
| Reddit OrangeRed | #FF4500 | Brand icon, chart peak, progress, decorative emphasis |
| Accessible orange text/CTA | #D63E05 / #CE3900 | White-label action buttons / orange body accents |
| Canvas | #F6F7F8 | Light page background |
| Cards | #FFFFFF | Clean separation and breathing room |
| Ink | #1A1A1B | Readable finance data and headings |
| Subtle borders | #E8ECEF | Section/card separation |
| Success / on-track | #00754A | Positive financial status only |
| Warning | #ECAE42 | 80% spending thresholds |
| Exceeded / danger | #DC4F50 | 100% / over-budget thresholds |

The original full dark green summary panel becomes an off-white/soft-orange hero.
This respects the preference for light mode while retaining sharp visual hierarchy.

## Files changed

- \`apps/web/src/expenses/reddit-light.css\`: additional theme layer loaded **after** the existing responsive CSS.
- \`apps/web/src/expenses/main.jsx\`: imports that theme.
- \`apps/web/src/editor-kit.css\`: Editor quick shortcut uses an OrangeRed accent.
- \`apps/web/test/dailyExpenses.test.mjs\`: guards palette, theme import, semantic alerts and light-mode rules.

No business-logic JavaScript, localStorage key, category defaults, budget settings, or transaction persistence has changed.

## Quality gates

\`\`\`bash
npm run check
npm run build
\`\`\`

Manual checks after deployment:
1. Open /expenses/ in desktop and mobile widths, verify light neutral background and no dark financial hero.
2. Check OrangeRed primary actions, brand icon, meter, bar chart and Editor shortcut.
3. Verify 80% amber and 100% red remain visually distinct from orange branding.
4. Create a new category and transaction, reload, switch months, verify data persistence.
5. Review focus rings, touch controls and reduced-motion behavior.

## Deployment

Changes should be merged only after CI succeeds. Cloudflare Pages needs to complete its production deployment before /expenses/ reflects the new theme.
