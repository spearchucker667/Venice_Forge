import { describe, expect, it } from 'vitest';
import {
  VeniceAPIError,
  normalizeError,
  readDesktopErrorBody,
  readWebErrorBody,
  readVeniceErrorBody,
  extractRateLimitInfo,
} from './errors';

describe('VeniceClient Errors', () => {
  it('should create VeniceAPIError', () => {
    const err = new VeniceAPIError('Test legacy error', 404);
    expect(err.message).toBe('Test legacy error');
    expect(err.status).toBe(404);
    expect(err.name).toBe('VeniceAPIError');
  });

  describe('normalizeError', () => {
    it('should normalize known status codes', () => {
      expect(normalizeError(400, 'Bad Request')).toBe('400 request/schema/model error: Bad Request');
      expect(normalizeError(429, '')).toBe('429 rate limit: Request failed');
    });

    it('should handle unknown status codes', () => {
      expect(normalizeError(418, 'I am a teapot')).toBe('I am a teapot');
      expect(normalizeError(null, '')).toBe('Request failed');
    });
  });

  describe('readDesktopErrorBody', () => {
    it('should extract error message from simple object', () => {
      expect(readDesktopErrorBody({ error: 'Direct error' })).toBe('Direct error');
      expect(readDesktopErrorBody({ message: 'Direct message' })).toBe('Direct message');
      expect(readDesktopErrorBody({ error: { message: 'Nested message' } })).toBe('Nested message');
    });

    it('should handle non-object inputs', () => {
      expect(readDesktopErrorBody(null)).toBe('Unknown Venice API error');
      expect(readDesktopErrorBody('String error')).toBe('String error');
    });

    it('should handle validation details', () => {
      expect(readDesktopErrorBody({ details: { _errors: ['Top level validation'] } })).toBe('Top level validation');
      expect(readDesktopErrorBody({ details: { field1: { _errors: ['Field validation'] } } })).toBe('field1: Field validation');
      expect(readDesktopErrorBody({ details: {} })).toBe('Request validation failed');
    });

    it('should handle complex nested error objects', () => {
       expect(readDesktopErrorBody({ error: { foo: 'bar' } })).toBe('{"foo":"bar"}');
    });

    it('appends Venice string details for upstream inference failures', () => {
      expect(readDesktopErrorBody({
        error: 'Image generation failed (status: 500)',
        details: 'Data is empty. Likely caused by upstream processing issue.',
      })).toBe(
        'Image generation failed (status: 500): Data is empty. Likely caused by upstream processing issue.',
      );
    });
  });

  describe('readWebErrorBody', () => {
    it('should extract error message', () => {
      expect(readWebErrorBody({ error: 'Direct error' }, 'Raw text', 'Status')).toBe('Direct error');
      expect(readWebErrorBody(null, 'Raw text', 'Status')).toBe('Raw text');
      expect(readWebErrorBody(null, '', 'Status')).toBe('Status');
      expect(readWebErrorBody(null, '', '')).toBe('Unknown Venice API error');
    });
    it('should handle validation details', () => {
      expect(readWebErrorBody({ details: { field2: { _errors: ['Web field validation'] } } }, '', '')).toBe('field2: Web field validation');
    });

    it('appends Venice string details for upstream inference failures', () => {
      expect(readWebErrorBody({
        error: 'Image generation failed (status: 500)',
        details: 'Data is empty. Likely caused by upstream processing issue.',
      }, '', '')).toBe(
        'Image generation failed (status: 500): Data is empty. Likely caused by upstream processing issue.',
      );
    });
  });

  describe('readVeniceErrorBody', () => {
    it('should extract error message', () => {
      expect(readVeniceErrorBody({ error: 'Legacy error' })).toBe('Legacy error');
      expect(readVeniceErrorBody(null)).toBe('');
    });
    it('should handle validation details', () => {
      expect(readVeniceErrorBody({ details: { field3: { _errors: ['Legacy field validation'] } } })).toBe('field3: Legacy field validation');
    });
  });
});

describe('extractRateLimitInfo', () => {
  it('classifies RPD reason from x-ratelimit-reason header', () => {
    const info = extractRateLimitInfo(
      { 'x-ratelimit-reason': 'requests_per_day', 'x-ratelimit-type': 'RPD' },
      undefined,
    );
    expect(info.reason).toBe('requests_per_day');
    expect(info.limitType).toBe('RPD');
    expect(info.rawReason).toBe('requests_per_day');
  });

  it('normalizes the abbreviated "rpm" / "tpm" aliases', () => {
    expect(extractRateLimitInfo({ 'x-ratelimit-reason': 'RPM' }, undefined).reason).toBe('requests_per_minute');
    expect(extractRateLimitInfo({ 'x-ratelimit-reason': 'tpm' }, undefined).reason).toBe('tokens_per_minute');
    expect(extractRateLimitInfo({ 'x-ratelimit-reason': 'concurrent' }, undefined).reason).toBe('concurrent_requests');
  });

  it('preserves unknown upstream reasons on rawReason without forcing a typed value', () => {
    const info = extractRateLimitInfo({ 'x-ratelimit-reason': 'custom_tenant_quota' }, undefined);
    expect(info.reason).toBe('unspecified');
    expect(info.rawReason).toBe('custom_tenant_quota');
  });

  it('reads Retry-After (numeric seconds)', () => {
    const info = extractRateLimitInfo({ 'retry-after': '17' }, undefined);
    expect(info.retryAfterSeconds).toBe(17);
  });

  it('reads Retry-After (HTTP-date)', () => {
    const futureMs = Date.now() + 30_000;
    const info = extractRateLimitInfo({ 'retry-after': new Date(futureMs).toUTCString() }, undefined);
    expect(info.retryAfterSeconds).toBeGreaterThanOrEqual(29);
    expect(info.retryAfterSeconds).toBeLessThanOrEqual(31);
  });

  it('falls back to x-ratelimit-reset-requests when Retry-After is absent', () => {
    const info = extractRateLimitInfo({ 'x-ratelimit-reset-requests': '45' }, undefined);
    expect(info.retryAfterSeconds).toBe(45);
  });

  it('reads reason from the response body when headers do not carry it', () => {
    const info = extractRateLimitInfo(
      { 'retry-after': '5' },
      { error: { code: 'requests_per_day', message: 'quota' } },
    );
    expect(info.reason).toBe('requests_per_day');
    expect(info.rawReason).toBe('requests_per_day');
    expect(info.retryAfterSeconds).toBe(5);
  });

  it('returns the unspecified fallback when nothing is present', () => {
    const info = extractRateLimitInfo({}, undefined);
    expect(info.reason).toBe('unspecified');
    expect(info.rawReason).toBeUndefined();
    expect(info.limitType).toBeUndefined();
    expect(info.retryAfterSeconds).toBeUndefined();
  });

  it('does not throw on malformed header input', () => {
    // Headers are passed as Record<string,string>; the extractor must guard
    // against unknown shapes the IPC layer might surface during retries.
    const info = extractRateLimitInfo(undefined as unknown as Record<string, string>, { weird: 'shape' });
    expect(info.reason).toBe('unspecified');
  });
});
