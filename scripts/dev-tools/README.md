# Developer-only capture scripts

These scripts are not part of the production build. They are manual tools
used to extract design references and CSS variables from venice.ai for
internal inspiration during development. They require a working Playwright
install and an internet connection; they are not run by `npm test`,
`npm run build`, or CI.

## capture-venice-styles.cjs

Quick capture (53 LOC). Opens `https://venice.ai/` and writes the
computed CSS custom properties + body styles to `venice-styles.json`
at the repo root. Use this when you need a fresh snapshot of the
upstream theme tokens.

```bash
node scripts/dev-tools/capture-venice-styles.cjs
```

## capture-venice-design.mjs

Richer capture (164 LOC). Walks 10 routes × 4 viewports on venice.ai,
writing screenshots, full DOM, link lists, meta tags, and computed
styles to `.design-captures/venice/<route>/<viewport>/`. Use this for
visual parity audits.

```bash
node scripts/dev-tools/capture-venice-design.mjs
```

Note: the `.design-captures/` directory is gitignored.
