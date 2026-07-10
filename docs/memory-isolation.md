# Memory Isolation

Memory retrieval is opt-in globally and per conversation. If either control is off, Venice Forge performs no retrieval, shows no preview, and sends no memory payload. Character conversations do not reuse standard-chat memory context.

Each retrieval is scoped to the active conversation and a unique request ID. The storage query receives the active conversation in `excludeConversationIds`, so a chat cannot retrieve itself. Switching chats clears the preview and causes late results from the previous request to be discarded. Confirming or disabling a preview clears it before send.

Prior-conversation context is separate from memory. It is included only when enabled and when the user selects explicit conversation IDs; the active conversation is unavailable in that selector. Message editing does not run retrieval or generation.
