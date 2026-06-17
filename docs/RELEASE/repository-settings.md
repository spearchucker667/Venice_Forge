# Repository Settings

This checklist captures repository-level controls that are required for a
production release but are configured in GitHub settings rather than source.

## Branch Protection

- Protect `main`.
- Require pull request review before merge.
- Require status checks to pass before merge.
- Require the CI, CodeQL, dependency-review, Windows-sensitive, and macOS-sensitive checks when they are enabled for the branch.
- Require branches to be up to date before merging release-bound changes.
- Restrict force pushes and branch deletion.

## Security

- Enable GitHub private vulnerability reporting.
- Enable CodeQL code scanning. Default setup is the active automatic scanner
  unless default setup is disabled and the tracked advanced workflow
  `.github/workflows/codeql.yml` is enabled with
  `VENICE_FORGE_ENABLE_ADVANCED_CODEQL=true`.
- Enable Dependabot alerts and security updates.
- Keep dependency review enabled for pull requests through `.github/workflows/dependency-review.yml`.
- Treat repository secrets for signing/notarization as production credentials.

## Release Secrets

Production tag releases warn and create unsigned draft artifacts when signing
secrets are absent. Set `VENICE_FORGE_REQUIRE_SIGNED_RELEASE=true` to fail
closed unless the required signing secrets are available:

- macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`

Unsigned local or workflow-dispatch builds may still be produced for development
verification, but they must not be published as production releases.

## Release Tags

- Use `vMAJOR.MINOR.PATCH` tags for release workflows.
- Tag only a clean checkout on `main`.
- Ensure `package.json`, `package-lock.json`, release docs, and the tag all refer to the same release version.
