import { describe, it, expect } from 'vitest'
import { contentToSearchText, contentToMarkdownText } from './messageContent'
import type { ContentPart } from '../types/venice'

describe('messageContent utils', () => {
  describe('contentToSearchText', () => {
    it('returns string as-is when content is a string', () => {
      expect(contentToSearchText('hello world')).toBe('hello world')
      expect(contentToSearchText('')).toBe('')
    })

    it('returns empty string for non-string, non-array inputs', () => {
      expect(contentToSearchText(null as any)).toBe('')
      expect(contentToSearchText(undefined as any)).toBe('')
      expect(contentToSearchText({} as any)).toBe('')
      expect(contentToSearchText(123 as any)).toBe('')
    })

    it('extracts text from ContentPart array', () => {
      const parts: ContentPart[] = [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' }
      ]
      expect(contentToSearchText(parts)).toBe('hello\nworld')
    })

    it('ignores non-text parts in ContentPart array', () => {
      const parts: ContentPart[] = [
        { type: 'text', text: 'hello' },
        { type: 'image_url', image_url: { url: 'http://example.com/img.png' } },
        { type: 'text', text: 'world' },
        { type: 'input_audio', input_audio: { data: '...', format: 'wav' } }
      ]
      expect(contentToSearchText(parts)).toBe('hello\nworld')
    })

    it('filters out empty text parts', () => {
      const parts: ContentPart[] = [
        { type: 'text', text: 'hello' },
        { type: 'text', text: '' },
        { type: 'text' }, // undefined text
        { type: 'text', text: 'world' }
      ]
      expect(contentToSearchText(parts)).toBe('hello\nworld')
    })
  })

  describe('contentToMarkdownText', () => {
    it('returns string as-is when content is a string', () => {
      expect(contentToMarkdownText('hello world')).toBe('hello world')
      expect(contentToMarkdownText('')).toBe('')
    })

    it('returns empty string for non-string, non-array inputs', () => {
      expect(contentToMarkdownText(null as any)).toBe('')
      expect(contentToMarkdownText(undefined as any)).toBe('')
      expect(contentToMarkdownText({} as any)).toBe('')
      expect(contentToMarkdownText(123 as any)).toBe('')
    })

    it('extracts text from ContentPart array', () => {
      const parts: ContentPart[] = [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' }
      ]
      expect(contentToMarkdownText(parts)).toBe('hello\nworld')
    })

    it('converts non-text parts to [type] in ContentPart array', () => {
      const parts: ContentPart[] = [
        { type: 'text', text: 'hello' },
        { type: 'image_url', image_url: { url: 'http://example.com/img.png' } },
        { type: 'text', text: 'world' },
        { type: 'input_audio', input_audio: { data: '...', format: 'wav' } }
      ]
      expect(contentToMarkdownText(parts)).toBe('hello\n[image_url]\nworld\n[input_audio]')
    })

    it('filters out empty text parts', () => {
      const parts: ContentPart[] = [
        { type: 'text', text: 'hello' },
        { type: 'text', text: '' },
        { type: 'text' }, // undefined text
        { type: 'text', text: 'world' }
      ]
      expect(contentToMarkdownText(parts)).toBe('hello\nworld')
    })
  })
})
