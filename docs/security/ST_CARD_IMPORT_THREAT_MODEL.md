# ST Card Import Threat Model

Character cards are untrusted documents. Electron main owns open/save dialogs, file reads, PNG parsing, safety assessment, collision checks, and atomic writes. The renderer receives an expiring sender-scoped single-use handle and safe preview metadata, never an absolute path or raw filesystem capability.

The PNG codec validates signature, every chunk boundary and CRC, dimensions, pixel count, chunk count, terminal `IEND`, strict Base64, fatal UTF-8, JSON size, and V2 structure. Export removes stale `chara` chunks and reparses the finished PNG before saving. JSON export also reparses and compares its semantic V2 object.

Imports screen prompt-bearing fields, greetings, example text, character books, and extension strings through the existing Local Family Safe Mode pipeline. Secret-like strings are redacted by the adapter. Logs and IPC errors must not contain card JSON, prompts, creator notes, lore content, Base64 images, keys, signed URLs, or user paths.

AI card content is data, not instruction. Refinement requests use a fixed system instruction, omit internal metadata/credentials, accept only allowlisted typed patch paths, and require explicit application.
