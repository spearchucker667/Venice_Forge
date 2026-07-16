# Character Card V2 Compatibility

Venice Forge imports Tavern V1 JSON, Character Card V2 JSON, and Character Card V2 PNG. Standard exports target `chara_card_v2` version `2.0`; V3, compressed PNG text chunks, embedded V3 assets, and bulk archives are unsupported.

V2 description and personality remain separate. Primary and alternate greetings remain separate from example dialogue. Raw `mes_example`, creator notes, post-history instructions, embedded character books, required empty strings, and bounded unknown extension JSON survive the internal round trip. Standard exports omit local IDs, projects, paths, versions, sync/device metadata, context files, API configuration, and avatar storage metadata.

Creator notes are display-only. Card system prompts follow explicit card/global precedence; `{{original}}` expands once. Post-history instructions are placed after conversation history. Embedded books are converted through the existing `LorebookV1` matcher. Standard imports never silently replace a name collision.

Limits include 8 MiB JSON/decoded metadata, 20 MiB PNG input/output, 32 levels of extension nesting, 32 alternate greetings, bounded tags/books, 8,192 pixels per image dimension, 40 million pixels, and 10,000 PNG chunks.
