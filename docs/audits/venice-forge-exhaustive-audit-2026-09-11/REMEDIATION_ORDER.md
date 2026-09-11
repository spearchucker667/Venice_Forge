# Remediation order

## Completed local phases

1. **Production/security blockers:** `VF-AUD-20260911-P1-001` and `VF-AUD-20260911-P1-002`.
2. **State/input correctness:** `VF-AUD-20260911-P2-002` and `VF-AUD-20260911-P2-003`.
3. **CSP/accessibility:** `VF-AUD-20260911-P2-001` and `VF-AUD-20260911-P3-001`.
4. **Repository acceptance:** complete dirty-tree review, clean dependency install, canonical `npm run ci`, strict i18n generation, production HTTP probe, arm64 packaging, packaged Electron smoke, and architecture-specific artifact verification.

No confirmed local finding in this package remains open.

## Remaining acceptance sequence

1. Publish the reviewed commit to `main` and require exact-SHA hosted CI and CodeQL.
2. If a release tag is authorized, run the signing/notarization workflows and retain verifier-derived evidence.
3. Run funded-provider and two-device acceptance under their separate authorization requirements.
4. Complete qualified native-language and headed accessibility review.
5. Have a repository administrator synchronize Rules01 with the intended script-coverage and packaged-smoke required checks.

The remaining work can proceed independently except that release publication must precede tag-based signed artifact acceptance.
