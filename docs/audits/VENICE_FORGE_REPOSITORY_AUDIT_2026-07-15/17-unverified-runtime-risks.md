# Unverified Runtime Risks

| Required evidence | Status | Why not verified here | Required next step |
|---|---|---|---|
| Signed/notarized macOS install and update | BLOCKED | No release signing/notarization credentials were exposed to the audit. | Run release checklist on exact commit with protected credentials. |
| Signed Windows installer, portable app and updater | BLOCKED | Current host is macOS; no Windows runner/session. | Run hosted Windows packaging and clean-install/update QA. |
| Linux installer formats | NOT RUN | Local host is macOS and release workflow is the supported Linux environment. | Run hosted Linux release jobs if release scope requires them. |
| Paid Venice generation and model-specific behavior | BLOCKED | No API secret or funded operation was authorized; secrets must not enter evidence. | Run credentialed smoke with redacted IDs/status only. |
| Two-device sync and conflict recovery | BLOCKED | One local device/profile is available. | Exercise encrypted sync on two devices, including concurrent conflict and retry. |
| Secure-storage persistence across packaged restart | BLOCKED | Requires installed signed packages and OS credential store interaction. | Verify configure/restart/remove paths on supported OSes. |
| Screen reader, high zoom, full theme and sound matrix | NOT RUN | Requires manual assistive-technology and perceptual QA. | Execute documented accessibility matrix and retain non-sensitive observations. |
| Production network/provider outages and cancellation | INCONCLUSIVE | Deterministic tests mock boundaries; uncontrolled paid/network failure was not induced. | Run controlled staging fault injection. |
| Historical Git secret scan | NOT CONFIGURED | Gitleaks/TruffleHog unavailable and installing unpinned tools was outside the audit. | Run approved pinned history scanner in CI/security environment. |
| Live CodeQL post-fix closure | BLOCKED | New local changes have no hosted analysis until committed/pushed. | Analyze the eventual commit, close alert 178, dismiss defended alerts with rationale. |

These gaps prevent a universal “all runtime features verified” claim but do not identify a new source-level implementation gap. They remain canonical under `VF-VERIFY-005` where applicable.
