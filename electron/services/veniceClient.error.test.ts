import { describe, it, expect } from 'vitest';
import { readResponseError } from './veniceClient';

describe('readResponseError', () => {
  it('extracts top-level error message string', () => {
    const response = {
      body: { error: { message: 'Simple error' } },
      statusText: 'Bad Request',
      status: 400,
    } as any;
    expect(readResponseError(response)).toBe('Simple error');
  });

  it('stringifies object error message (Bug 3 Fix)', () => {
    const response = {
      body: { error: { code: 'invalid_request', detail: 'Something went wrong' } },
      statusText: 'Bad Request',
      status: 400,
    } as any;
    // Before fix, this would be "[object Object]"
    const result = readResponseError(response);
    expect(result).toContain('invalid_request');
    expect(result).toContain('Something went wrong');
    expect(result).toBe(JSON.stringify({ code: 'invalid_request', detail: 'Something went wrong' }));
  });

  it('extracts Zod validation errors', () => {
    const response = {
      body: {
        details: {
          _errors: ['Root error'],
          field1: { _errors: ['Field error'] }
        }
      },
      statusText: 'Unprocessable Entity',
      status: 422,
    } as any;
    expect(readResponseError(response)).toBe('Root error');
  });

  it('falls back to status text', () => {
    const response = {
      body: {},
      statusText: 'Service Unavailable',
      status: 503,
    } as any;
    expect(readResponseError(response)).toBe('Service Unavailable');
  });
});
