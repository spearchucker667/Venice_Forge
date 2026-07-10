# Chat Model Selection

New character chats use the character-assigned model when available, otherwise the resolved Venice default. Existing chats keep their persisted conversation model; if it disappears from the live text-model catalog, Venice Forge resolves one fallback and persists it with a non-blocking explanation. New non-character chats use the resolved default.

Default resolution order is provider metadata with the `default` trait, configured GLM 4.6 (`zai-org-glm-4.6`) when available, then the first known available text model. Image, audio, embedding, offline, and unavailable models are never selected as chat fallbacks.

Changing the header model while a chat is open updates that conversation immediately. It does not modify the character card. Conversation forks copy the current model and settings intentionally.
