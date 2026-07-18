# Research Browser Architecture

This document details the design, security boundaries, and validation requirements of the embedded **Research Browser** subsystem in Venice Forge.

---

## 1. Core Architecture

Unlike standard electron apps that rely on insecure `<webview>` tags or nested `iframe` structures, Venice Forge implements a modern, secure **WebContentsView** architecture.

```text
┌─────────────────────────────────────────────────────────────┐
│  Renderer Process (React Viewport)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Chrome Toolbar (Address bar, controls, back/forward) │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Viewport bounds measured dynamically via ResizeObserver │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ Geometry & navigation IPC
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Electron Main Process                                      │
│  - Instantiates WebContentsView                             │
│  - Mounts native view over the renderer's viewport bounds   │
│  - Manages browser session partitions (sandboxed)           │
│  - Enforces strict network and navigation policy guards     │
└─────────────────────────────────────────────────────────────┘
```

### Why `<webview>` and `iframe` are not used:
- **`<iframe>` Limitations:** Standard iframes are blocked by modern websites via `X-Frame-Options` and `Content-Security-Policy: frame-ancestors` headers. This prevents the research subsystem from loading ordinary web pages.
- **`<webview>` Risks:** Electron's legacy `<webview>` tag runs inside the renderer process and exposes a large, historically vulnerable IPC attack surface. It requires enabling node integration options that weaken the renderer sandbox.
- **`WebContentsView` Advantage:** By separating the UI Chrome (HTML address input, back/forward buttons) from the browser engine (main-process native `WebContentsView`), we gain complete control over request headers, cookies, navigations, and resource lifetimes.

---

## 2. Security Boundaries & Protection Model

The Research Browser runs in a dedicated, sandboxed partition (`persist:venice-forge-research-browser`) with the following strict network and protocol boundaries:

### URL Normalization & Sanitization
Every user input or search string in the address bar is normalized via `src/shared/urlSecurity.ts` before navigation is triggered:
- Plain text search queries are automatically converted to google/brave queries.
- Hostnames are checked for valid RFC formatting.
- Explicit IPv4/IPv6 formats are resolved.

### Top-Level Navigation & Scheme Blocking
Navigations must route through main-process handlers (`will-navigate`, `will-frame-navigate`, `will-redirect`). Access is explicitly blocked for unsafe schemes:
- `file://` (prevents loading local files from the filesystem)
- `data://` (blocks script execution payloads)
- `javascript://` (prevents cross-site scripting/execution)
- `blob://`, `chrome://`, `devtools://`

### Private Network Blocking
To prevent SSRF (Server-Side Request Forgery) attacks against the user's local network, the host resolver blocks navigations to loopback or private ranges:
- `localhost` and `127.0.0.1`
- RFC 1918 Private Address ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Link-local address ranges (`169.254.0.0/16`)
- IPv6 private/loopback addresses (`::1`, `fc00::/7`, `fe80::/10`)

### Popup and Window-Open Handling
The main process registers `setWindowOpenHandler` on the Research Browser's `WebContents`. Rather than allowing new windows or frames to spawn unchecked:
- Popups are denied by default.
- Safe `target="_blank"` link clicks are intercepted and navigated within the *current* `WebContentsView` instead.

### App-Owned Internal Home Page
The browser does not load local `file://` page paths for its default splash view. Instead, it maps home requests to a virtual app-owned internal name (`Venice Research Home`). This removes local path leakage risks and satisfies strict CSP rules.

---

## 3. Jina Capture & Scraping Flow

When a user triggers a "Scrape Page" command:
1. The renderer requests content capture via the `researchBrowser:scrape` IPC channel.
2. The main process extracts the active page source, stripping script blocks and hidden metadata elements.
3. Text is capped at `research.max_browser_extract_chars` (default 40,000 characters) to prevent memory bloating.
4. Upstream requests are proxied securely; Jina API credentials never travel to the renderer and are held only on the Express proxy server or secure main-process memory.
5. Inbound bodies are screened locally before rendering, routing through the content safety pipeline.

---

## 4. Headed UI Smoke Checklist

> [!WARNING]
> **Headed Electron UI smoke tests must be run manually.** Because headless CI environments lack display hardware, automated Playwright/smoke testing cannot fully validate native `WebContentsView` coordinate overlaps, z-index layering, or focus behaviors.

### Verification Checklist:
- [ ] **Geometry Alignment:** Verify that the native browser view aligns perfectly with the React viewport frame and does not cover the address bar or navigation buttons.
- [ ] **Elastic Resizing:** Verify that resizing the main application window adjusts the browser view dimensions immediately.
- [ ] **Tab Hiding:** Verify that switching to another tab (e.g. Chat or Image Studio) hides the native browser view, and returning to the Research tab restores it.
- [ ] **HTTPS Loading:** Load `https://venice.ai/` and verify that the page renders correctly.
- [ ] **Private Range Blocking:** Navigate to `http://localhost:3000/` or `http://192.168.1.1/` and confirm that the navigation is blocked and displays a safety warning.
- [ ] **Safe-Scheme Enforcement:** Confirm that typing `file:///etc/passwd` or `javascript:alert(1)` is rejected and blocked.
- [ ] **Theme Splash Integration:** Verify that the default browser home splash screen matches the current active application theme.
