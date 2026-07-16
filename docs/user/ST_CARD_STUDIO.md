# ST Card Studio

Open RP Studio → Characters to create, import, edit, test, and export SillyTavern-compatible cards.

- Import accepts Tavern V1 JSON, Character Card V2 JSON, and V2 PNG. Review the preview before confirming. Matching cards require an explicit keep, copy, replace, or merge decision; replace/merge offers a short-lived undo.
- The ten-step editor preserves personality, creator notes, prompt behavior, greeting order, raw examples, extension JSON, and embedded character-book data. Creator notes are never sent to models.
- Character books may remain embedded, be imported/attached as linked Venice Forge lorebooks, be explicitly synchronized back into the portable embedded copy, or be detached without deleting that copy.
- Draft edits autosave encrypted on this device and do not sync. Drafts enter encrypted backups only when draft inclusion is explicitly enabled.
- Create from Image links a durable local Media Studio asset. Vision analysis uses only live models that advertise vision support and enough context. Image text is untrusted; generated cards and field changes remain reviewable proposals until applied.
- The Test section shows prompt order, token estimates, and activated lorebook sections, and can run a disposable unsaved turn that never mutates the card.
- Export offers standard V2 JSON/PNG and privacy-reduced JSON. PNG requires an avatar; JPEG/WebP avatars are re-encoded to PNG. Saving stops if verification fails.
- When starting RP chat, choose the primary greeting, an alternate greeting, random greeting, or no greeting. The choice is recorded and inserted once.

Broken cards should be reported without private content. Reproduce with a synthetic card, remove names/prompts, retain only the minimum failing structure, and never attach keys or signed URLs.
