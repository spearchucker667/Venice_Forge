import { describe, it, expect, beforeEach } from 'vitest';
import { CharacterSceneRateLimiter, DEFAULT_CHARACTER_SCENE_LIMITS } from './characterSceneRateLimiter';

describe('CharacterSceneRateLimiter', () => {
  let limiter: CharacterSceneRateLimiter;

  beforeEach(() => {
    limiter = new CharacterSceneRateLimiter();
  });

  it('allows the first request', () => {
    expect(limiter.check({ conversationId: 'c1' }).allowed).toBe(true);
  });

  it('blocks when global per-minute limit is exceeded', () => {
    for (let i = 0; i < DEFAULT_CHARACTER_SCENE_LIMITS.maxScenesGlobalPerMinute; i++) {
      limiter.recordComplete({ conversationId: `c${i}` });
    }
    expect(limiter.check({ conversationId: 'c99' }).allowed).toBe(false);
  });

  it('blocks when conversation hourly limit is exceeded', () => {
    for (let i = 0; i < DEFAULT_CHARACTER_SCENE_LIMITS.maxScenesPerConversationPerHour; i++) {
      limiter.recordComplete({ conversationId: 'c1' });
    }
    expect(limiter.check({ conversationId: 'c1' }).allowed).toBe(false);
  });

  it('blocks when conversation daily limit is exceeded', () => {
    const dayLimit = DEFAULT_CHARACTER_SCENE_LIMITS.maxScenesPerConversationPerDay;
    for (let i = 0; i < dayLimit; i++) {
      limiter.recordComplete({ conversationId: 'c1' });
    }
    expect(limiter.check({ conversationId: 'c1' }).allowed).toBe(false);
  });

  it('blocks concurrent generation', () => {
    limiter.recordStart({ conversationId: 'c1' });
    expect(limiter.check({ conversationId: 'c2' }).allowed).toBe(false);
    limiter.recordComplete({ conversationId: 'c1' });
    // Cooldown is active immediately after completion.
    expect(limiter.check({ conversationId: 'c2' }).allowed).toBe(false);
    const later = Date.now() + DEFAULT_CHARACTER_SCENE_LIMITS.cooldownMsAfterSceneGeneration + 100;
    expect(limiter.check({ conversationId: 'c2' }, later).allowed).toBe(true);
  });

  it('respects cooldown between completions', () => {
    limiter.recordComplete({ conversationId: 'c1' });
    expect(limiter.check({ conversationId: 'c1' }).allowed).toBe(false);
  });

  it('allows retry after cooldown passes', () => {
    const now = Date.now();
    limiter.recordComplete({ conversationId: 'c1' }, now);
    const later = now + DEFAULT_CHARACTER_SCENE_LIMITS.cooldownMsAfterSceneGeneration + 100;
    expect(limiter.check({ conversationId: 'c1' }, later).allowed).toBe(true);
  });

  it('releases concurrency on failure without advancing history or cooldown', () => {
    const now = Date.now();
    limiter.recordStart({ conversationId: 'c1' });
    expect(limiter.check({ conversationId: 'c2' }).allowed).toBe(false);
    limiter.recordFailure({ conversationId: 'c1' }, now);
    // Concurrency released, but no cooldown or history should be recorded.
    expect(limiter.check({ conversationId: 'c2' }).allowed).toBe(true);
    expect(limiter.check({ conversationId: 'c1' }).allowed).toBe(true);
  });
});
