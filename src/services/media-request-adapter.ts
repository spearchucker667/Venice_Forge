import type {
  ImageEditRequest,
  ImageUpscaleRequest,
  VideoRetrieveRequest,
  MusicRetrieveRequest,
} from '../types/venice'

const DATA_URL_RE = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const MIN_UPSCALE_SOURCE_PIXELS = 65_536
export const MAX_UPSCALE_OUTPUT_PIXELS = 16_777_216

export interface ImageInputDiagnostics {
  kind: NormalizedImageInput['kind']
  mimeType: string | null
  byteCount: number | null
  width: number | null
  height: number | null
  pixelCount: number | null
  projectedWidth: number | null
  projectedHeight: number | null
  projectedPixelCount: number | null
  requestKeys: string[]
}

export type NormalizedImageInput =
  | { kind: 'url'; field: 'image_url'; value: string; mimeType?: undefined; byteCount?: undefined }
  | { kind: 'data-url' | 'base64'; field: 'image'; value: string; mimeType?: string; byteCount: number }

function compactBase64(value: string): string {
  return value.replace(/\s+/g, '')
}

function decodedByteCount(base64: string): number {
  const compact = compactBase64(base64)
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(compact.length * 3 / 4) - padding)
}

function decodeBase64(base64: string): Uint8Array {
  try {
    const binary = atob(compactBase64(base64))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    throw new Error('Source image base64 encoding is invalid.')
  }
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function decodePngDimensions(bytes: Uint8Array): { mimeType: string; width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null
  if (ascii(bytes, 12, 4) !== 'IHDR') throw new Error('Source PNG is missing its IHDR dimensions.')
  return { mimeType: 'image/png', width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) }
}

function decodeJpegDimensions(bytes: Uint8Array): { mimeType: string; width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) break
    const marker = bytes[offset++]
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 1 >= bytes.length) break
    const segmentLength = readUint16BE(bytes, offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) break
      return { mimeType: 'image/jpeg', height: readUint16BE(bytes, offset + 3), width: readUint16BE(bytes, offset + 5) }
    }
    offset += segmentLength
  }
  throw new Error('Source JPEG dimensions could not be decoded.')
}

function decodeWebpDimensions(bytes: Uint8Array): { mimeType: string; width: number; height: number } | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null
  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8X') {
    return { mimeType: 'image/webp', width: readUint24LE(bytes, 24) + 1, height: readUint24LE(bytes, 27) + 1 }
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) throw new Error('Source WEBP lossless header is invalid.')
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return { mimeType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) throw new Error('Source WEBP frame header is invalid.')
    return {
      mimeType: 'image/webp',
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    }
  }
  throw new Error('Source WEBP dimensions could not be decoded.')
}

function decodeImageDimensions(base64: string, declaredMimeType?: string): { mimeType: string; width: number; height: number } {
  const bytes = decodeBase64(base64)
  const decoded = decodePngDimensions(bytes) ?? decodeJpegDimensions(bytes) ?? decodeWebpDimensions(bytes)
  if (!decoded) throw new Error('Source image encoding is not a valid PNG, JPEG, or WEBP image.')
  if (declaredMimeType && declaredMimeType !== decoded.mimeType) {
    throw new Error(`Source image MIME type ${declaredMimeType} does not match its ${decoded.mimeType} encoding.`)
  }
  if (decoded.width <= 0 || decoded.height <= 0) throw new Error('Source image dimensions are invalid.')
  return decoded
}

export function normalizeImageInput(input: string): NormalizedImageInput {
  const value = input.trim()
  if (!value) throw new Error('Select a non-empty source image.')
  if (/^https?:\/\//i.test(value)) {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Image URL must use HTTP or HTTPS.')
    return { kind: 'url', field: 'image_url', value }
  }
  if (/^(blob|file):/i.test(value)) throw new Error('Local object and filesystem URLs cannot be sent to Venice.')

  const dataMatch = DATA_URL_RE.exec(value)
  if (dataMatch) {
    const mimeType = dataMatch[1].toLowerCase()
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
      throw new Error('Source image must be PNG, JPEG, or WEBP.')
    }
    const base64 = compactBase64(dataMatch[2])
    const byteCount = decodedByteCount(base64)
    if (byteCount === 0) throw new Error('Source image is empty.')
    if (byteCount >= MAX_IMAGE_BYTES) throw new Error('Source image must be smaller than 25 MB.')
    return { kind: 'data-url', field: 'image', value: base64, mimeType, byteCount }
  }

  const base64 = compactBase64(value)
  if (!base64 || base64.length % 4 !== 0 || !BASE64_RE.test(base64)) {
    throw new Error('Source image must be a valid data URL, base64 string, or HTTP(S) URL.')
  }
  const byteCount = decodedByteCount(base64)
  if (byteCount === 0) throw new Error('Source image is empty.')
  if (byteCount >= MAX_IMAGE_BYTES) throw new Error('Source image must be smaller than 25 MB.')
  return { kind: 'base64', field: 'image', value: base64, byteCount }
}

export function inspectImageInput(input: string, requestKeys: string[] = [], scale?: 2 | 4): ImageInputDiagnostics {
  const normalized = normalizeImageInput(input)
  if (normalized.kind === 'url') {
    return {
      kind: normalized.kind,
      mimeType: null,
      byteCount: null,
      width: null,
      height: null,
      pixelCount: null,
      projectedWidth: null,
      projectedHeight: null,
      projectedPixelCount: null,
      requestKeys: [...requestKeys].sort(),
    }
  }
  const decoded = decodeImageDimensions(normalized.value, normalized.mimeType)
  const pixelCount = decoded.width * decoded.height
  return {
    kind: normalized.kind,
    mimeType: decoded.mimeType,
    byteCount: normalized.byteCount,
    width: decoded.width,
    height: decoded.height,
    pixelCount,
    projectedWidth: scale ? decoded.width * scale : null,
    projectedHeight: scale ? decoded.height * scale : null,
    projectedPixelCount: scale ? pixelCount * scale * scale : null,
    requestKeys: [...requestKeys].sort(),
  }
}

function normalizedImageValue(input: string): string {
  const normalized = normalizeImageInput(input)
  if (normalized.kind !== 'url') decodeImageDimensions(normalized.value, normalized.mimeType)
  return normalized.value
}

export function buildImageEditRequest(input: ImageEditRequest): ImageEditRequest {
  const prompt = input.prompt.trim()
  const model = input.model.trim()
  if (!prompt) throw new Error('Enter an edit prompt.')
  if (!model) throw new Error('Select an image-edit model.')
  return {
    image: normalizedImageValue(input.image),
    prompt,
    model,
    ...(input.aspect_ratio ? { aspect_ratio: input.aspect_ratio } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(input.output_format ? { output_format: input.output_format } : {}),
    ...(input.safe_mode !== undefined ? { safe_mode: input.safe_mode } : {}),
  }
}

export function buildImageUpscaleRequest(input: ImageUpscaleRequest): ImageUpscaleRequest {
  const scale = input.scale ?? 2
  if (scale !== 2 && scale !== 4) throw new Error('Upscale factor must be 2× or 4×.')
  const creativity = input.creativity === undefined
    ? undefined
    : Math.min(0.02, Math.max(0, input.creativity))
  const request = {
    image: normalizedImageValue(input.image),
    scale,
    ...(creativity !== undefined ? { creativity } : {}),
  }
  const diagnostics = inspectImageInput(input.image, Object.keys(request), scale)
  if (diagnostics.kind === 'url') {
    throw new Error('Upscale requires an embedded PNG, JPEG, or WEBP image so dimensions can be validated before payment.')
  }
  if ((diagnostics.pixelCount ?? 0) < MIN_UPSCALE_SOURCE_PIXELS) {
    throw new Error(`Source image must contain at least ${MIN_UPSCALE_SOURCE_PIXELS.toLocaleString()} pixels before upscaling.`)
  }
  if ((diagnostics.projectedPixelCount ?? 0) > MAX_UPSCALE_OUTPUT_PIXELS) {
    throw new Error(`Projected ${scale}× output exceeds the ${MAX_UPSCALE_OUTPUT_PIXELS.toLocaleString()}-pixel provider limit.`)
  }
  return request
}

export function buildBackgroundRemoveRequest(input: string): { image: string } | { image_url: string } {
  const normalized = normalizeImageInput(input)
  if (normalized.kind !== 'url') decodeImageDimensions(normalized.value, normalized.mimeType)
  return normalized.field === 'image_url'
    ? { image_url: normalized.value }
    : { image: normalized.value }
}

export function buildAudioRetrieveRequest(model: string, queueId: string): MusicRetrieveRequest {
  const cleanModel = model.trim()
  const cleanQueueId = queueId.trim()
  if (!cleanModel || !cleanQueueId) throw new Error('Audio retrieval requires a model and queue ID.')
  return { model: cleanModel, queue_id: cleanQueueId, delete_media_on_completion: false }
}

export function buildVideoRetrieveRequest(model: string, queueId: string): VideoRetrieveRequest {
  const cleanModel = model.trim()
  const cleanQueueId = queueId.trim()
  if (!cleanModel || !cleanQueueId) throw new Error('Video retrieval requires a model and queue ID.')
  return { model: cleanModel, queue_id: cleanQueueId, delete_media_on_completion: false }
}

export function validateImageBlob(blob: Blob, expectedMime?: string): Blob {
  const mime = blob.type.split(';')[0].toLowerCase()
  const supported = ['image/png', 'image/jpeg', 'image/webp']
  if (!supported.includes(mime) || (expectedMime && mime !== expectedMime)) {
    throw new Error('Venice returned an unsupported image format.')
  }
  if (blob.size === 0) throw new Error('Venice returned an empty image.')
  return blob
}
