import { describe, expect, it } from 'vitest';
import { safeMediaPreviewUrl } from './safePreviewUrl';

describe('safeMediaPreviewUrl', () => {
  const allowed = ["data:image/png;base64,", "blob:"];

  it('accepts supported image data URLs', () => {
    expect(safeMediaPreviewUrl("data:image/png;base64,123", allowed)).toBe("data:image/png;base64,123");
  });

  it('accepts blob: URLs only where intended', () => {
    expect(safeMediaPreviewUrl("blob:123", allowed)).toBe("blob:123");
  });

  it('rejects javascript:, file:, http:, malformed values', () => {
    expect(safeMediaPreviewUrl("javascript:alert(1)", allowed)).toBe("");
    expect(safeMediaPreviewUrl("file:///etc/passwd", allowed)).toBe("");
    expect(safeMediaPreviewUrl("http://evil.com", allowed)).toBe("");
  });

  it('does not mutate valid base64 payloads', () => {
    const payload = "data:image/png;base64,abcd==";
    expect(safeMediaPreviewUrl(payload, allowed)).toBe(payload);
  });
});
