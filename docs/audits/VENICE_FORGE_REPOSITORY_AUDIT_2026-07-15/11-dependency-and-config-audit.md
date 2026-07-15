# Dependency and Configuration Audit

## VF-AUDIT-006 — Direct dependency updates require planned review

- Priority/confidence: P3 / confirmed maintenance item; open
- Discovery: `npm outdated --json` under supported Node 22.
- Evidence: patch/minor updates exist for Electron, electron-builder/updater, React and other tools; major upgrades are available for ESLint, Vite, Vitest, Express, pdfjs and others.
- Impact: no current vulnerability or failing gate; delayed updates can accumulate migration and support cost.
- Remediation: update in small, tested batches outside this audit. Do not combine toolchain majors with product changes.
- Verification: `npm ci && npm audit --audit-level=moderate && npm run ci`, platform packaging and hosted matrix.
- Regression risk: medium for Electron/build tooling and majors.

`npm ci` installed 866 packages and audited 867 with zero vulnerabilities. Deprecation warnings originate in transitive packages (`lodash.isequal`, `inflight`, old `glob`, `boolean`, old `rimraf`); they are upgrade-planning input, not proof that a direct dependency is unused or exploitable.

Configuration review found one npm package, strict dual TypeScript pipelines, Vite renderer, esbuild server, serial Vitest segmentation, explicit Electron Builder files, pinned Actions, CSP/theme contracts and engine parity. There are no Git or local-path dependencies and no second lockfile. No dependency was upgraded and the lockfile was not hand-edited.
