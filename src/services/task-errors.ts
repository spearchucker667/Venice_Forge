import { sanitizeErrorText } from '../shared/redaction'

const MAX_ERROR_LENGTH = 200

function toUserFacingTaskError(value: unknown, fallback: string): string {
  const normalized = value || fallback
  const text = typeof normalized === 'string'
    ? normalized
    : normalized instanceof Error
      ? normalized.message
      : String(normalized)
  const redacted = sanitizeErrorText(text)
  return redacted.length > MAX_ERROR_LENGTH ? `${redacted.slice(0, MAX_ERROR_LENGTH)}…` : redacted
}

export function toUserFacingVideoError(value: unknown, fallback: string): string {
  return toUserFacingTaskError(value, fallback)
}

export const MUSIC_SAFE_ERROR_MESSAGES = {
  queue: 'Unable to queue music generation. Please try again.',
  polling: 'Unable to check generation status. Please try again.',
  generation: 'Music generation failed. Please try again.',
  timeout: 'Status checks stopped. Resume checking or try again.',
  empty: 'Music generation returned an empty audio file. Please try again.',
} as const

export function toUserFacingMusicError(value: unknown, fallback: string): string {
  return toUserFacingTaskError(value, fallback)
}
