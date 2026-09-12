// @vitest-environment node

/** @fileoverview Unit tests for extracting human-readable error messages from
 *  Venice API responses. */

import { describe, it, expect, vi } from 'vitest';

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(),
    getVersion: vi.fn(),
  },
}));

import { parseBody, readResponseError } from './veniceClient';

/** Tests extraction of error details from Venice API response objects. */
describe('readResponseError', () => {
  /** Extracts a top-level error message string. */
  it('extracts top-level error message string', () => {
    const response = {
      body: { error: { message: 'Simple error' } },
      statusText: 'Bad Request',
      status: 400,
    } as any;
    expect(readResponseError(response)).toBe('Simple error');
  });

  it('appends a distinct upstream string details message', () => {
    const response = {
      body: {
        error: 'Image generation failed (status: 500)',
        details: 'Data is empty. Likely caused by upstream processing issue.',
      },
      statusText: 'Internal Server Error',
      status: 500,
    } as any;
    expect(readResponseError(response)).toBe(
      'Image generation failed (status: 500): Data is empty. Likely caused by upstream processing issue.',
    );
  });

  /** Stringifies object error messages to avoid "[object Object]" output. */
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

  /** Extracts Zod-style validation errors from response details. */
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

  /** Falls back to status text when no structured error is present. */
  it('falls back to status text', () => {
    const response = {
      body: {},
      statusText: 'Service Unavailable',
      status: 503,
    } as any;
    expect(readResponseError(response)).toBe('Service Unavailable');
  });
});

describe('parseBody (VF-AUD-20260912-P1-001 / TG-002)', () => {
  it('parses valid application/json responses', () => {
    const buf = Buffer.from(JSON.stringify({ result: "ok" }));
    expect(parseBody(buf, "application/json; charset=utf-8")).toEqual({ result: "ok" });
  });

  it('returns text for text/* content-type', () => {
    const buf = Buffer.from("Hello world");
    expect(parseBody(buf, "text/plain")).toBe("Hello world");
  });

  it('skips utf-8 decoding for binary media content-types', () => {
    const rawBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const toStringSpy = vi.spyOn(rawBytes, 'toString');

    const result = parseBody(rawBytes, "image/png") as { dataBase64: string };
    expect(result.dataBase64).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64"));

    // Verify utf-8 decode was never invoked
    const utf8Calls = toStringSpy.mock.calls.filter(([enc]) => enc === "utf-8");
    expect(utf8Calls.length).toBe(0);

    toStringSpy.mockRestore();
  });
});
