# Repository Settings

This checklist captures repository-level controls that are required for a
production release but are configured in GitHub settings rather than source.

## Verified Live State — 2026-07-16

The repository-admin APIs confirm that `main` now requires strict current
checks, one approving review, code-owner review, approval of the last push,
conversation resolution, and enforcement for administrators. Force pushes and
branch deletion are disabled. Default Actions workflow permissions are
read-only and workflows cannot approve pull requests by default. Vulnerability
alerts, automated security fixes, and private vulnerability reporting are
enabled. This is a dated live-settings snapshot; rerun the GitHub API checks
before a production release because repository settings can drift independently
of the tracked tree.

## Branch Protection

- Protect `main`.
- Require pull request review before merge.
- Require status checks to pass before merge.
- Require the CI, CodeQL, dependency-review, Windows-sensitive, and macOS-sensitive checks when they are enabled for the branch.
- Require branches to be up to date before merging release-bound changes.
- Restrict force pushes and branch deletion.

## Security

- Enable GitHub private vulnerability reporting.
- Enable CodeQL code scanning. The tracked advanced workflow
  `.github/workflows/codeql.yml` runs automatically unless disabled
  with `VENICE_FORGE_DISABLE_CODEQL=true`.
- Enable Dependabot alerts and security updates.
- Keep dependency review enabled for pull requests through `.github/workflows/dependency-review.yml`.
- Treat repository secrets for signing/notarization as production credentials.

## Release Secrets

Production tag releases fail closed when signing secrets are absent. Set
`RELEASE_ALLOW_UNSIGNED=true` only for a deliberate unsigned draft exception;
remove or reset the variable after the exceptional run:

- macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`

Unsigned local builds may still be produced for development verification, but
they must not be published as production releases.

## Release Tags

- Use `vMAJOR.MINOR.PATCH` tags for release workflows.
- Tag only a clean checkout on `main`.
- Ensure `package.json`, `package-lock.json`, release docs, and the tag all refer to the same release version.
