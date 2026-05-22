/** @fileoverview Unit tests for parsePositiveIntEnv. */

import { describe, it, expect } from 'vitest';
import { parsePositiveIntEnv } from './apiConfig';

/** Validates parsePositiveIntEnv behavior across various inputs. */
describe('parsePositiveIntEnv', () => {
  /** Falls back to the default when given invalid or missing values. */
  it('falls back on invalid values', () => {
    expect(parsePositiveIntEnv(undefined, 10, 1, 100)).toBe(10);
    expect(parsePositiveIntEnv('abc', 10, 1, 100)).toBe(10);
    expect(parsePositiveIntEnv('-1', 10, 1, 100)).toBe(10);
    expect(parsePositiveIntEnv('0', 10, 1, 100)).toBe(10);
  });

  /** Clamps out-of-range values and accepts valid integers. */
  it('clamps huge and accepts valid', () => {
    expect(parsePositiveIntEnv('9999', 10, 1, 100)).toBe(100);
    expect(parsePositiveIntEnv('42', 10, 1, 100)).toBe(42);
  });
});
