import { describe, it, expect } from 'vitest';
import { safeMediaPreviewUrl } from './safePreviewUrl';

describe('safeMediaPreviewUrl', () => {
  it('allows blob: URLs when blob: is in allowed list', () => {
    expect(safeMediaPreviewUrl('blob:https://example.com/123', ['blob:'])).toBe('blob:https://example.com/123');
    expect(safeMediaPreviewUrl(' blob:https://example.com/123 ', ['blob:'])).toBe('blob:https://example.com/123');
  });

  it('rejects blob: URLs when blob: is not in allowed list', () => {
    expect(safeMediaPreviewUrl('blob:https://example.com/123', ['https://'])).toBe('');
  });

  it('allows data: URLs that match the prefix', () => {
    expect(safeMediaPreviewUrl('data:image/png;base64,123', ['data:image/png;base64,'])).toBe('data:image/png;base64,123');
    expect(safeMediaPreviewUrl('data:video/mp4;base64,abc', ['data:video/mp4;base64,'])).toBe('data:video/mp4;base64,abc');
  });

  it('rejects data: URLs that do not match the prefix', () => {
    expect(safeMediaPreviewUrl('data:image/jpeg;base64,123', ['data:image/png;base64,'])).toBe('');
  });

  it('allows http:// and https:// URLs when allowed', () => {
    expect(safeMediaPreviewUrl('https://example.com/img.png', ['https://'])).toBe('https://example.com/img.png');
    expect(safeMediaPreviewUrl('http://example.com/img.png', ['http://'])).toBe('http://example.com/img.png');
  });

  it('rejects invalid URLs when http/https is allowed', () => {
    expect(safeMediaPreviewUrl('https://:invalid-url', ['https://'])).toBe('');
  });

  it('allows specific URL origins and paths', () => {
    const allowed = ['https://example.com/assets/'];
    expect(safeMediaPreviewUrl('https://example.com/assets/img.png', allowed)).toBe('https://example.com/assets/img.png');
    expect(safeMediaPreviewUrl('https://example.com/other/img.png', allowed)).toBe('');
    expect(safeMediaPreviewUrl('https://other.com/assets/img.png', allowed)).toBe('');
    expect(safeMediaPreviewUrl('http://example.com/assets/img.png', allowed)).toBe('');
  });

  it('handles invalid candidate URLs safely', () => {
    expect(safeMediaPreviewUrl('not-a-url', ['https://example.com/assets/'])).toBe('');
    expect(safeMediaPreviewUrl('not-a-url', ['https://'])).toBe('');
  });

  it('handles invalid allowed URLs safely', () => {
    expect(safeMediaPreviewUrl('https://example.com/img.png', ['not-a-url-prefix'])).toBe('');
  });

  it('returns empty string if no allowed prefixes match', () => {
    expect(safeMediaPreviewUrl('https://example.com/img.png', [])).toBe('');
    expect(safeMediaPreviewUrl('https://example.com/img.png', ['blob:', 'data:image/'])).toBe('');
  });
});
