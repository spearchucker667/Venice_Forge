# RP Token Counting

The character editor reports raw editable-content tokens, compiled character-prompt tokens, the reserved output allowance, and the remaining input budget. The compiled count uses the same character block builder as the RP request path, including creator instructions and example dialogue.

The current fallback is a character-based approximation and is labeled **estimated tokens**. It is not presented as a provider-exact count. A future provider/model tokenizer can implement the `TokenCounter` interface without changing editor behavior.

The current default context contract is 32,000 total tokens with 4,096 reserved for output. When compiled input exceeds the remaining 27,904-token budget, the count turns red and Save is disabled. Venice Forge does not shorten user-authored character fields to fit this budget; the user chooses what to edit.
