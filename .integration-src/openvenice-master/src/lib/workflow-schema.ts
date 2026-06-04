import type { VeniceNodeType } from '../stores/workflow-store'

export type IOKind = 'text' | 'image' | 'audio' | 'video' | 'none'

export type ParamType = 'string' | 'text' | 'number' | 'boolean' | 'enum'

export interface ParamSchema {
  name: string
  type: ParamType
  description: string
  required?: boolean
  default?: string | number | boolean
  enumValues?: readonly string[]
  min?: number
  max?: number
}

export interface NodeSchema {
  type: VeniceNodeType
  label: string
  description: string
  input: IOKind
  output: IOKind
  params: readonly ParamSchema[]
}

const WEB_SEARCH_VALUES = ['off', 'on', 'auto'] as const
const VIDEO_ASPECT_VALUES = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const
const VIDEO_DURATION_VALUES = ['', '5s', '10s'] as const
const VIDEO_RESOLUTION_VALUES = ['', '720p', '1080p'] as const
const TTS_FORMAT_VALUES = ['mp3', 'opus', 'aac', 'flac', 'wav'] as const

export const NODE_SCHEMAS: Record<VeniceNodeType, NodeSchema> = {
  textInput: {
    type: 'textInput',
    label: 'Input',
    description: 'Static text provided by the user. Starting point of a workflow.',
    input: 'none',
    output: 'text',
    params: [
      { name: 'inputText', type: 'text', description: 'The text value.', required: true, default: '' },
    ],
  },
  output: {
    type: 'output',
    label: 'Output',
    description: 'Displays whatever its upstream node produced. Accepts any kind.',
    input: 'text',
    output: 'none',
    params: [],
  },
  chat: {
    type: 'chat',
    label: 'LLM',
    description: 'Run a Venice chat completion. Accepts upstream text as context.',
    input: 'text',
    output: 'text',
    params: [
      { name: 'model', type: 'string', description: 'Venice chat model id.', required: true, default: 'llama-3.3-70b' },
      { name: 'prompt', type: 'text', description: 'Instruction. Use {{input}} to position upstream text, or leave empty to append.', required: true, default: '' },
      { name: 'temperature', type: 'number', description: 'Sampling temperature.', default: 0.7, min: 0, max: 2 },
      { name: 'maxTokens', type: 'number', description: 'Max output tokens.', default: 4096, min: 64, max: 32768 },
      { name: 'webSearch', type: 'enum', description: 'Enable Venice web search.', default: 'off', enumValues: WEB_SEARCH_VALUES },
    ],
  },
  imageGen: {
    type: 'imageGen',
    label: 'Image Gen',
    description: 'Generate an image from a text prompt.',
    input: 'text',
    output: 'image',
    params: [
      { name: 'model', type: 'string', description: 'Venice image model id.', required: true, default: 'z-image-turbo' },
      { name: 'prompt', type: 'text', description: 'Image prompt. Use {{input}} to position upstream text.', required: true, default: '' },
      { name: 'negativePrompt', type: 'string', description: 'What to avoid.', default: '' },
      { name: 'steps', type: 'number', description: 'Denoising steps.', default: 20, min: 1, max: 50 },
      { name: 'width', type: 'number', description: 'Image width in pixels.', default: 1024, min: 256, max: 2048 },
      { name: 'height', type: 'number', description: 'Image height in pixels.', default: 1024, min: 256, max: 2048 },
      { name: 'style', type: 'string', description: 'Style preset name.', default: '' },
      { name: 'hideWatermark', type: 'boolean', description: 'Omit watermark if allowed.', default: true },
    ],
  },
  tts: {
    type: 'tts',
    label: 'Text to Speech',
    description: 'Narrate text into speech audio.',
    input: 'text',
    output: 'audio',
    params: [
      { name: 'model', type: 'string', description: 'TTS model id.', required: true, default: 'tts-kokoro' },
      { name: 'prompt', type: 'text', description: 'Text to speak. Use {{input}} to position upstream text.', default: '' },
      { name: 'voice', type: 'string', description: 'Voice id.', default: 'af_sky' },
      { name: 'speed', type: 'number', description: 'Playback speed.', default: 1, min: 0.25, max: 4 },
      { name: 'responseFormat', type: 'enum', description: 'Audio format.', default: 'mp3', enumValues: TTS_FORMAT_VALUES },
    ],
  },
  music: {
    type: 'music',
    label: 'Music Gen',
    description: 'Generate a music clip from a text prompt.',
    input: 'text',
    output: 'audio',
    params: [
      { name: 'model', type: 'string', description: 'Music model id.', required: true, default: 'stable-audio' },
      { name: 'prompt', type: 'text', description: 'Music prompt.', required: true, default: '' },
      { name: 'duration', type: 'number', description: 'Duration in seconds.', default: 30, min: 5, max: 120 },
      { name: 'instrumental', type: 'boolean', description: 'Force instrumental.', default: false },
      { name: 'lyrics', type: 'text', description: 'Optional lyrics.', default: '' },
    ],
  },
  video: {
    type: 'video',
    label: 'Video Gen',
    description: 'Generate a short video from a text prompt.',
    input: 'text',
    output: 'video',
    params: [
      { name: 'model', type: 'string', description: 'Video model id.', required: true, default: 'wan-2.1' },
      { name: 'prompt', type: 'text', description: 'Video prompt.', required: true, default: '' },
      { name: 'videoAspectRatio', type: 'enum', description: 'Aspect ratio.', default: '16:9', enumValues: VIDEO_ASPECT_VALUES },
      { name: 'videoDuration', type: 'enum', description: 'Clip duration. Empty means model default.', default: '', enumValues: VIDEO_DURATION_VALUES },
      { name: 'videoResolution', type: 'enum', description: 'Resolution. Empty means model default.', default: '', enumValues: VIDEO_RESOLUTION_VALUES },
    ],
  },
}

export const NODE_TYPES: readonly VeniceNodeType[] = Object.keys(NODE_SCHEMAS) as VeniceNodeType[]

export function getNodeSchema(type: VeniceNodeType): NodeSchema {
  return NODE_SCHEMAS[type]
}

export function isInputCompatible(sourceOutput: IOKind, targetInput: IOKind): boolean {
  return sourceOutput !== 'none' && targetInput !== 'none'
}

export function isIdealMatch(sourceOutput: IOKind, targetInput: IOKind): boolean {
  if (sourceOutput === 'none' || targetInput === 'none') return false
  if (targetInput === 'text') return true
  return sourceOutput === targetInput
}
