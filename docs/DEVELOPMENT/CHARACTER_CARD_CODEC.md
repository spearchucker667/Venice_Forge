# Character Card Codec

`electron/services/characterCardPngCodec.ts` is the only PNG metadata codec. It supports one Latin-1 `tEXt` keyword named `chara` whose value is Base64-encoded UTF-8 Character Card V2 JSON. It intentionally rejects zTXt/iTXt card metadata.

Import calls `inspectCharacterCardPng`, which returns the validated DTO, dimensions, and a visible PNG with card metadata removed. Export calls `embedCharacterCardInPng`, removes stale `chara` chunks, inserts one chunk before final `IEND`, computes CRC-32, reparses the complete output, and compares the V2 object.

Do not move parsing into `src/`, add renderer file paths, relax terminal/chunk checks, continue after verification failure, or log buffers/metadata.
