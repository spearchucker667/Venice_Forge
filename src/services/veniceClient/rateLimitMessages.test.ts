/** @fileoverview Unit tests for src/services/veniceClient/rateLimitMessages.ts. */

import { describe, it, expect } from 'vitest';
import { resolveRateLimitMessageKey } from './rateLimitMessages';
import type { VeniceRateLimitInfo } from '../../types/venice';

describe('resolveRateLimitMessageKey', () => {
  it('returns the existing rateLimit429 fallback when info is null', () => {
    const out = resolveRateLimitMessageKey(null);
    expect(out.key).toBe('rateLimit429');
    expect(out.fallback).toMatch(/rate limit/i);
  });

  it('returns rateLimit429 when reason is unspecified and no limit type', () => {
    const info: VeniceRateLimitInfo = { reason: 'unspecified' };
    const out = resolveRateLimitMessageKey(info);
    expect(out.key).toBe('rateLimitGeneric');
  });

  it('maps requests_per_minute to rateLimitRpm', () => {
    expect(
      resolveRateLimitMessageKey({ reason: 'requests_per_minute' }).key,
    ).toBe('rateLimitRpm');
  });

  it('maps requests_per_day to rateLimitRpd', () => {
    expect(
      resolveRateLimitMessageKey({ reason: 'requests_per_day' }).key,
    ).toBe('rateLimitRpd');
  });

  it('falls back to limitType when reason is unspecified but limitType is set', () => {
    expect(
      resolveRateLimitMessageKey({ reason: 'unspecified', limitType: 'TPM' }).key,
    ).toBe('rateLimitTpm');
    expect(
      resolveRateLimitMessageKey({ reason: 'unspecified', limitType: 'CONCURRENT' }).key,
    ).toBe('rateLimitConcurrent');
  });

  it('propagates retryAfterSeconds', () => {
    const out = resolveRateLimitMessageKey({ reason: 'requests_per_minute', retryAfterSeconds: 23 });
    expect(out.key).toBe('rateLimitRpm');
    expect(out.retryAfterSeconds).toBe(23);
  });

  it('every emitted key has an English fallback string', () => {
    const cases: VeniceRateLimitInfo[] = [
      { reason: 'unspecified' },
      { reason: 'requests_per_minute' },
      { reason: 'requests_per_day' },
      { reason: 'tokens_per_minute' },
      { reason: 'tokens_per_day' },
      { reason: 'concurrent_requests' },
      { reason: 'unspecified', limitType: 'RPM' },
      { reason: 'unspecified', limitType: 'RPD' },
      { reason: 'unspecified', limitType: 'TPM' },
      { reason: 'unspecified', limitType: 'TPD' },
      { reason: 'unspecified', limitType: 'CONCURRENT' },
    ];
    for (const info of cases) {
      const out = resolveRateLimitMessageKey(info);
      expect(out.fallback.length).toBeGreaterThan(0);
      expect(out.key.length).toBeGreaterThan(0);
    }
  });
});
