# File Inventory

| Inventory | Count/result |
|---|---:|
| Tracked files | 1,143 |
| Source files in `src/` and `electron/` | 823 |
| Test files | 365 |
| Tracked Markdown files | 86 |
| Tracked empty files | 0 |
| Tracked archives | 0 |
| Case-colliding paths | 0 |
| Tracked executable files | 1 (`scripts/create-cjs-package.cjs`) |
| Ignored `.DS_Store` files | 18 (137,288 bytes) |

Large current assets are bounded: `assets/preview.png` is about 2.36 MiB; the retained archived summary is about 1.29 MiB; the Venice Swagger source is about 568 KiB. Historical blobs include an older 12.47 MiB preview and an 8.59 MiB removed integration video, both below GitHub's hard object limit. No history rewrite is recommended.

Exact duplicate pairs are intentional: branding files are copied between `assets/branding/` and `public/assets/branding/` for packaging, while `CLAUDE.md`/`GEMINI.md` and `.cursorrules`/`.windsurfrules` intentionally preserve tool-discovery parity.
