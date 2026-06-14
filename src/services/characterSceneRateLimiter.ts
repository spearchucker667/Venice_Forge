/** @fileoverview Local app-side rate limiter for Character Chat Scene Generation. */

import { DEFAULT_CHARACTER_SCENE_LIMITS, type CharacterSceneRateLimitSettings } from '../types/characterSceneGeneration';

export { DEFAULT_CHARACTER_SCENE_LIMITS };

export interface CharacterSceneRateLimitInput {
  conversationId: string;
  assistantMessageId?: string;
}

export interface CharacterSceneRateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
}

export class CharacterSceneRateLimiter {
  private limits: CharacterSceneRateLimitSettings;
  private conversationHour = new Map<string, number[]>();
  private conversationDay = new Map<string, number[]>();
  private globalMinute: number[] = [];
  private concurrent = 0;
  private lastGenerationTime = 0;

  constructor(limits?: Partial<CharacterSceneRateLimitSettings>) {
    this.limits = { ...DEFAULT_CHARACTER_SCENE_LIMITS, ...limits };
  }

  check(input: CharacterSceneRateLimitInput, now = Date.now()): CharacterSceneRateLimitResult {
    if (this.concurrent >= this.limits.maxConcurrentSceneGenerations) {
      return {
        allowed: false,
        reason: 'Another scene generation is already running.',
        retryAfterMs: Math.max(0, this.lastGenerationTime + this.limits.cooldownMsAfterSceneGeneration - now),
      };
    }

    const sinceCooldown = now - this.lastGenerationTime;
    if (sinceCooldown < this.limits.cooldownMsAfterSceneGeneration) {
      return {
        allowed: false,
        reason: 'Scene generation cooldown active.',
        retryAfterMs: this.limits.cooldownMsAfterSceneGeneration - sinceCooldown,
      };
    }

    this.globalMinute = this.globalMinute.filter((t) => now - t < 60_000);
    if (this.globalMinute.length >= this.limits.maxScenesGlobalPerMinute) {
      return {
        allowed: false,
        reason: 'Global scene generation rate limit reached.',
        retryAfterMs: 60_000 - (now - this.globalMinute[0]),
      };
    }

    const hour = this.conversationHour.get(input.conversationId) ?? [];
    const hourRecent = hour.filter((t) => now - t < 60 * 60 * 1000);
    if (hourRecent.length >= this.limits.maxScenesPerConversationPerHour) {
      return {
        allowed: false,
        reason: 'Hourly scene generation limit for this conversation reached.',
        retryAfterMs: 60 * 60 * 1000 - (now - hourRecent[0]),
      };
    }

    const day = this.conversationDay.get(input.conversationId) ?? [];
    const dayRecent = day.filter((t) => now - t < 24 * 60 * 60 * 1000);
    if (dayRecent.length >= this.limits.maxScenesPerConversationPerDay) {
      return {
        allowed: false,
        reason: 'Daily scene generation limit for this conversation reached.',
        retryAfterMs: 24 * 60 * 60 * 1000 - (now - dayRecent[0]),
      };
    }

    return { allowed: true };
  }

  recordStart(input: CharacterSceneRateLimitInput, _now = Date.now()): void {
    this.concurrent = Math.min(this.concurrent + 1, this.limits.maxConcurrentSceneGenerations);
  }

  recordComplete(input: CharacterSceneRateLimitInput, now = Date.now()): void {
    this.concurrent = Math.max(this.concurrent - 1, 0);
    this.lastGenerationTime = now;
    this.globalMinute.push(now);

    const hour = (this.conversationHour.get(input.conversationId) ?? []).filter(
      (t) => now - t < 60 * 60 * 1000,
    );
    hour.push(now);
    this.conversationHour.set(input.conversationId, hour);

    const day = (this.conversationDay.get(input.conversationId) ?? []).filter(
      (t) => now - t < 24 * 60 * 60 * 1000,
    );
    day.push(now);
    this.conversationDay.set(input.conversationId, day);
  }
}
