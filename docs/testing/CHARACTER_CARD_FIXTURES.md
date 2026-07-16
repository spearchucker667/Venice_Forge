# Character Card Fixtures

Fixtures under `tests/fixtures/character-cards` must be synthetic and contain no copyrighted character material, personal information, secrets, paths, or signed URLs. JSON fixtures should isolate one compatibility behavior while keeping all V2 required fields present.

PNG fixtures must be generated from a small synthetic PNG and a synthetic V2 DTO. Record whether the fixture is valid or which single validation failure it represents. Never weaken the codec to accept a malformed fixture.

Run `npm run test:character-cards`, `npm run verify:character-card-v2`, `npm run verify:character-card-png`, and `npm run verify:character-card-security` after fixture changes.
