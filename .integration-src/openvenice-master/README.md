# OpenVenice

A customizable, open-source frontend for the [Venice AI](https://venice.ai) API.

Venice gives you access to powerful AI models for text, images, audio, music, and video. OpenVenice gives you a clean interface to use them — one you own, can modify, and can host yourself.

https://github.com/user-attachments/assets/1056682b-80c2-45da-9b57-6572840e8db4

## Why OpenVenice?

**Your interface, your rules.** Venice's official UI is great, but sometimes you want more control:

- **Customize everything** — add tools, change layouts, tweak parameters, build features that matter to you. The codebase is intentionally simple and hackable.
- **Share your API key with family** — host OpenVenice on your own server, enter your key once, and give your family a clean AI interface without them needing their own accounts.
- **No server, no backend** — it's a static site. Your API key stays in your browser and goes directly to Venice's API. Nothing passes through a middleman.
- **Transparent** — every API call is visible in the source. No telemetry, no analytics, no tracking.
- **Barebones on purpose** — ships with useful features like visual workflows, but keeps things minimal so you can build on top without fighting existing complexity.

## Features

### Chat
Streaming responses, conversation history, model selection, web search, citations, temperature control. Markdown rendering with safe URL handling and syntax highlighting. Image attachments (paste, drag-drop, or upload) for vision models.

### Image Generation
Prompts, negative prompts, style presets, steps, resolution, aspect ratio, variants, watermark control. Lightbox gallery with download. Edit / Upscale / Background-remove tools in a separate tab.

### Audio
Text-to-speech with 50+ voices across 9 languages. Adjustable speed, multiple formats (MP3, Opus, AAC, FLAC, WAV). Audio transcription via Whisper.

### Music Generation
Text-to-music with optional lyrics, duration control, instrumental mode. Supports Stable Audio, ACE-Step, ElevenLabs, MiniMax, MMAudio.

### Video Generation
Text-to-video and image-to-video. Configurable aspect ratio, resolution, duration. Auto-detects model capabilities. Cancellable polling with elapsed-time display.

### Embeddings
Vector embeddings for text with selectable models and dimension display.

### Workflows
Visual node editor for chaining models. Connect Input → LLM → Image Gen → Output, with full parameter controls per node. Independent branches run in parallel. Starter templates for album covers, podcast episodes, music videos, song writing, character portraits, and story scenes.

### Playground
Conversational agent that builds and edits workflows on a live canvas as you describe them in plain language.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, click **API Key** in the header, paste your [Venice AI API key](https://venice.ai/settings/api), and start using it.

### Where does my API key live?

By default, your key is held in **`sessionStorage`** — meaning it's gone when you close the tab. If you check **Remember across sessions**, the key is encrypted with a passphrase you choose (AES-GCM via PBKDF2, 250k iterations, all in-browser) and stored in `localStorage`. Your passphrase is never persisted; you re-enter it on each new session.

You can disconnect at any time from the API key dialog.

## Self-hosting

You have three options. Pick whichever fits.

### 1. Static hosting + direct API calls (simplest)

Build the app and serve `/dist` from any static host (Netlify, Vercel, Cloudflare Pages, S3, Pi, …). The browser will hit `https://api.venice.ai` directly. CORS must allow your origin — Venice's API does.

```bash
npm run build       # outputs to /dist
```

Override the API base URL at build time if you proxy elsewhere:

```bash
VITE_VENICE_BASE_URL=https://my-proxy.example.com/api/v1 npm run build
```

### 2. Docker (Railway, Fly, Render, your homelab)

A multi-stage Dockerfile is included; runtime is Nginx serving the built bundle with a SPA fallback.

```bash
docker build -t openvenice .
docker run -p 8080:80 openvenice
```

A `railway.json` is included for one-click Railway deploy.

### 3. Run a tiny proxy yourself

If you'd rather keep API calls server-side (so the key never touches a browser), front the static bundle with any reverse proxy that forwards `/api/v1/*` to `https://api.venice.ai/api/v1/*` and strips/injects the key. The frontend already speaks to a relative `/api/v1` base when `VITE_VENICE_BASE_URL` is unset in dev (it uses the Vite proxy automatically).

### Sharing with family

Deploy it, share the URL, have them enter your API key (or their own). Each browser stores its own key and history.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New chat |
| `Cmd+1‒8` | Switch tabs |
| `Enter` | Send message (in chat) |
| `Shift+Enter` | Newline (in chat) |
| `Esc` | Close any dialog or lightbox |

## Tech Stack

React 19, TypeScript, Vite, Zustand, TanStack Query, Tailwind CSS v4, React Flow.

## Project Structure

```
src/
├── app.tsx                     # Tab routing + error boundary
├── components/
│   ├── chat/                   # Chat interface + message bubbles
│   ├── image/                  # Image generation + edit/upscale/bg-remove
│   ├── audio/                  # TTS + transcription
│   ├── music/                  # Music generation
│   ├── video/                  # Video generation (cancellable polling)
│   ├── embeddings/             # Embeddings
│   ├── workflows/              # Visual workflow editor
│   ├── playground/             # Agent-authored workflows
│   ├── layout/                 # Sidebar, header, API key dialog
│   └── ui/                     # Shared components, ErrorBoundary, Toaster
├── stores/                     # Zustand stores (versioned + quota-safe)
├── hooks/                      # Data hooks, useBlobUrl, useChat
├── lib/
│   ├── venice-client.ts        # fetch w/ retry+backoff
│   ├── stream.ts               # robust SSE parser
│   ├── workflow-engine.ts      # parallel topological executor
│   ├── workflow-validator.ts   # graph + param validation
│   ├── workflow-mutations.ts   # patch reducer + auto-layout
│   ├── playground-agent.ts     # validated patch parser
│   └── safe-storage.ts         # localStorage with quota recovery
└── types/                      # TypeScript types
```

## Production-grade defaults

- **Retry + backoff** on transient API failures (429/5xx), respecting `Retry-After`.
- **Cancellable streams and polling** — Stop button kills any in-flight request.
- **Capped polling** with elapsed-time display so video/music jobs can't run forever.
- **Object-URL lifecycle** managed via `useBlobUrl` — no leaked blob references.
- **CSP** in `index.html` restricts script/style/connect sources.
- **Error boundary** at the root + per-tab so one bad render doesn't take the whole app down.
- **Toast system** for user-facing errors (network failures, transient issues).
- **Persisted state versioned + quota-safe** — schema migrations, automatic pruning on `QuotaExceededError`.
- **Markdown sanitization** — `javascript:` and other unsafe URI schemes are stripped from rendered AI output.
- **Accessible** — every interactive control is a real `<button>`, focus-visible rings everywhere, aria labels on icon-only controls, `prefers-reduced-motion` honored.

## Contributing

Fork it, break it, make it yours. PRs welcome.

## License

MIT
