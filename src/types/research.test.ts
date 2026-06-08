import { describe, it, expect } from 'vitest';
import {
  sanitizeResearchSession,
  redactResearchSecrets,
  isResearchSecretLike,
  sanitizeResearchUrl,
  exportResearchSessions,
} from './research';

describe('Research Data Model', () => {
  describe('sanitizeResearchSession', () => {
    it('creates a valid session from empty input', () => {
      const session = sanitizeResearchSession({});
      expect(session.id).toBeDefined();
      expect(session.title).toBe('Untitled Research');
      expect(session.sources).toEqual([]);
      expect(session.findings).toEqual([]);
    });

    it('redacts secrets in title and description', () => {
      const session = sanitizeResearchSession({
        title: 'Research with venice_12345678901234567890123456789012',
        description: 'Bearer abc123def456',
      });
      expect(session.title).toContain('[REDACTED_KEY]');
      expect(session.description).toContain('[REDACTED_TOKEN]');
    });
  });

  describe('redactResearchSecrets', () => {
    it('redacts Venice keys', () => {
      const content = 'My key is venice_12345678901234567890123456789012';
      expect(redactResearchSecrets(content)).toBe('My key is [REDACTED_KEY]');
    });

    it('redacts Jina keys', () => {
      const content = 'jina_12345678901234567890123456789012';
      expect(redactResearchSecrets(content)).toBe('[REDACTED_KEY]');
    });

    it('redacts Bearer tokens', () => {
      const content = 'Bearer abc123def456';
      expect(redactResearchSecrets(content)).toBe('Bearer [REDACTED_TOKEN]');
    });
  });

  describe('isResearchSecretLike', () => {
    it('returns true for content with secrets', () => {
      expect(isResearchSecretLike('venice_12345678901234567890123456789012')).toBe(true);
    });

    it('returns false for clean content', () => {
      expect(isResearchSecretLike('normal text')).toBe(false);
    });
  });

  describe('sanitizeResearchUrl', () => {
    it('allows valid https URLs', () => {
      const url = 'https://example.com/page';
      expect(sanitizeResearchUrl(url)).toBe(url);
    });

    it('rejects file:// URLs', () => {
      expect(sanitizeResearchUrl('file:///etc/passwd')).toBeUndefined();
    });

    it('rejects localhost', () => {
      expect(sanitizeResearchUrl('http://localhost:3000')).toBeUndefined();
    });

    it.each([
      'http://10.0.0.1',
      'http://172.16.0.1',
      'http://192.168.1.1',
      'http://169.254.169.254',
      'http://[::1]',
      'http://2130706433',
    ])('rejects private or ambiguous host %s', (url) => {
      expect(sanitizeResearchUrl(url)).toBeUndefined();
    });

    it('redacts credentials from URLs', () => {
      const url = 'https://user:pass@example.com';
      expect(sanitizeResearchUrl(url)).toBe('https://example.com/');
    });
  });

  describe('exportResearchSessions', () => {
    it('creates a valid export envelope and redacts secrets', () => {
      const sessions = [
        sanitizeResearchSession({ title: 'Secret venice_12345678901234567890123456789012' })
      ];
      const result = exportResearchSessions(sessions);
      expect(result.version).toBe(1);
      expect(result.app).toBe('Venice Forge');
      expect(result.sessions[0].title).toBe('Secret [REDACTED_KEY]');
    });

    it('redacts nested metadata secrets and bounds oversized fields', () => {
      const result = exportResearchSessions([
        sanitizeResearchSession({
          title: 'x'.repeat(500),
          metadata: { nested: { authorization: 'Bearer abc123def456' } },
        }),
      ]);
      expect(result.sessions[0].title).toHaveLength(240);
      expect(JSON.stringify(result)).not.toContain('abc123def456');
    });
  });
});
