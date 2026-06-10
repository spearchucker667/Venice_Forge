// @vitest-environment node

/** @fileoverview Unit tests for multipart form-data sanitization and body
 *  construction used when uploading files to the Venice API. */

import { describe, it, expect, vi } from 'vitest';

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(),
    getVersion: vi.fn(),
  },
}));

import { buildMultipartBody, sanitizeMultipartContentType, sanitizeMultipartToken } from './veniceClient';

/** Tests sanitization of multipart tokens and construction of form-data bodies. */
describe('multipart sanitization', () => {
  /** Removes dangerous characters that could inject headers in multipart tokens. */
  it('sanitizes dangerous token chars', () => {
    expect(sanitizeMultipartToken('a"\r\n;b')).toBe('a;b');
    expect(sanitizeMultipartContentType('text/plain\r\nX:1')).toBe('application/octet-stream');
  });

  /** Supports unicode filenames while stripping injection attempts. */
  it('supports unicode filename and strips injections', () => {
    const { body } = buildMultipartBody({ _isSerializedFormData: true, entries: [{ name: 'file', filename: 'résumé"\r\n.txt', type: 'text/plain', value: Buffer.from('x').toString('base64'), _isFile: true }]});
    const text = body.toString('utf-8');
    expect(text).toContain('filename="résumé.txt"');
    expect(text).not.toContain('\r\nX-Injected');
  });
});
