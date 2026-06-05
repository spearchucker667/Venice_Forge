# Venice Forge — Headless Bridge Server

Venice Forge supports running as an autonomous headless loopback server. This mode allows local command-line tools, external scripts, or mobile devices (via SSH pivots/bridges) to route requests through Venice Forge's backend, leveraging active API configurations, secure storage, and local prompt safety guards.

---

## 🚀 Headless Mode Startup

Start the application with the `--headless` CLI flag. When run headless, Venice Forge bypasses graphical window initialization, generates an access token, and prints the startup details to `stdout`.

### Development
```bash
npm run dev:electron -- --headless --bridge-port 5062 --bridge-host 127.0.0.1
```

### Packaged Binaries
```bash
# macOS
./dist/mac/Venice\ Forge.app/Contents/MacOS/Venice\ Forge --headless --bridge-port 5062

# Windows
Venice-Forge.exe --headless --bridge-port 5062
```

### Command Line Flags

| Flag | Description | Default |
|---|---|---|
| `--headless` | Bypasses the Electron UI and runs only the Express loopback API server. | `false` |
| `--bridge-port <port>` | The port the Express server will listen on. | `5062` |
| `--bridge-host <host>` | The host interface to bind to. | `127.0.0.1` |

---

## 🔒 Security & Authorization

* **Loopback Bind by Default:** The server binds strictly to `127.0.0.1` (localhost) to prevent exposing the Venice API credentials to the public network.
* **Token Authentication:** Every request must present a Bearer token in the `Authorization` header.
* **Token Sourcing:** The token is read from the `VENICE_BRIDGE_TOKEN` environment variable on start. If the environment variable is absent, a secure random 32-byte hexadecimal token is generated and printed to `stdout` upon startup.
* **Safety Guards Active:** The loopback bridge server executes the child safety guard on every prompt payload. Attempting to bypass safety filters results in an immediate `451 Blocked by local safety guard` error response.

---

## 🛠️ REST API Endpoints

The bridge server forwards paths directly to the Venice API.

### 1. Ping / Health Check
Check if the server is active.
```bash
curl http://127.0.0.1:5062/ping \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

**Response:**
```json
{
  "ok": true,
  "message": "Venice Forge Bridge is running."
}
```

### 2. Models Catalog
Fetch supported models.
```bash
curl http://127.0.0.1:5062/models \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

### 3. Chat Completions (Standard)
```bash
curl -X POST http://127.0.0.1:5062/chat/completions \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3-70b",
    "messages": [
      { "role": "user", "content": "Explain encryption in one sentence." }
    ]
  }'
```

### 4. Chat Completions (Streaming)
Passing `"stream": true` returns standard Server-Sent Events (SSE).
```bash
curl -N -X POST http://127.0.0.1:5062/chat/completions \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3-70b",
    "messages": [
      { "role": "user", "content": "Write a short poem about coding." }
    ],
    "stream": true
  }'
```

---

## 📱 Mobile Bridge (Termux Integration)

To use the Venice Forge bridge from a mobile client (e.g., Termux on Android or a separate local network device) without binding the bridge port to public interfaces:

1. **Keep Bridge Secure:** Run Venice Forge headless bound to `127.0.0.1:5062` on your main host.
2. **Setup SSH Port Forwarding:** Forward the port securely over SSH from your mobile device:
   ```bash
   # From Termux / Mobile Terminal
   ssh -L 5062:127.0.0.1:5062 user@your-computer-ip
   ```
3. **Query Locally:** Now, you can query `http://127.0.0.1:5062` locally on the mobile device, and it will be securely encrypted and tunneled to the Venice Forge backend.
