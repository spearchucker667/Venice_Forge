# Reactivation Work Order: Research Browser

## Threat Model & Scope
The embedded Research Browser was disconnected due to security concerns regarding arbitrary web execution inside the Electron application's context.

## Requirements for Reactivation
1. **Strict Sandboxing**: The browser view must run in an isolated `webview` or `BrowserView` with `nodeIntegration=false`, `contextIsolation=true`, and a strict CSP.
2. **Navigation Restrictions**: Implement a strict URL allowlist or blocklist to prevent navigation to malicious sites or local file protocols.
3. **IPC Isolation**: Ensure no direct access to Venice Forge IPC channels from the browser context.
4. **Data Isolation**: Use a separate session and partition for the browser to ensure it doesn't share cookies, local storage, or cache with the main application.

## Approval
This work order must be reviewed and approved before the Research Browser can be restored. Until then, the Research Browser remains permanently disabled in the UI.
