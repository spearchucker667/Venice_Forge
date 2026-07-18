/** Durable generated audio/video storage owned by the Electron main process. */
import { app } from 'electron'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { checkPathContained } from '../utils/navigation'

export const GENERATED_MEDIA_SCHEME = 'venice-media'
const ALLOWED_MIME = new Map([
  ['video/mp4', 'mp4'],
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/flac', 'flac'],
])

export interface DurableGeneratedMedia {
  id: string
  url: string
  mimeType: string
  byteCount: number
  sha256: string
}

export function getGeneratedMediaRoot(): string {
  return path.join(app.getPath('userData'), 'media', 'blobs', 'sha256')
}

function isLexicallyContained(target: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

export async function persistGeneratedMedia(bytes: Buffer, mimeType: string): Promise<DurableGeneratedMedia> {
  const normalizedMime = mimeType.split(';')[0].trim().toLowerCase()
  const extension = ALLOWED_MIME.get(normalizedMime)
  if (!extension) throw new Error('Generated media has an unsupported content type.')
  if (bytes.length === 0) throw new Error('Generated media response was empty.')
  const signatureOk = normalizedMime === 'video/mp4'
    ? bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp'
    : normalizedMime === 'audio/wav'
      ? bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WAVE'
      : normalizedMime === 'audio/flac'
        ? bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === 'fLaC'
        : bytes.length >= 3 && (bytes.subarray(0, 3).toString('ascii') === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
  if (!signatureOk) throw new Error('Generated media bytes did not match the declared content type.')
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  const root = getGeneratedMediaRoot()
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  const mediaPath = path.join(root, `${sha256}.${extension}`)
  const metadataPath = path.join(root, `${sha256}.json`)
  if (!isLexicallyContained(mediaPath, root) || !isLexicallyContained(metadataPath, root)) throw new Error('Generated media path was rejected.')
  const tempPath = `${mediaPath}.tmp-${crypto.randomBytes(6).toString('hex')}`
  try {
    await fs.writeFile(tempPath, bytes, { mode: 0o600 })
    await fs.rename(tempPath, mediaPath)
    const metadata = JSON.stringify({ version: 1, id: sha256, sha256, mimeType: normalizedMime, byteCount: bytes.length, extension })
    const metadataTemp = `${metadataPath}.tmp-${crypto.randomBytes(6).toString('hex')}`
    await fs.writeFile(metadataTemp, metadata, { mode: 0o600 })
    await fs.rename(metadataTemp, metadataPath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
  return { id: sha256, url: `${GENERATED_MEDIA_SCHEME}://${sha256}`, mimeType: normalizedMime, byteCount: bytes.length, sha256 }
}

export async function resolveGeneratedMedia(id: string): Promise<{ path: string; mimeType: string } | null> {
  if (!/^[a-f0-9]{64}$/.test(id)) return null
  const root = getGeneratedMediaRoot()
  const metadataPath = path.join(root, `${id}.json`)
  if (!checkPathContained(metadataPath, root)) return null
  try {
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as { id?: string; mimeType?: string; extension?: string }
    if (metadata.id !== id || !metadata.mimeType || !metadata.extension || ALLOWED_MIME.get(metadata.mimeType) !== metadata.extension) return null
    const mediaPath = path.join(root, `${id}.${metadata.extension}`)
    if (!checkPathContained(mediaPath, root)) return null
    const stat = await fs.stat(mediaPath)
    return stat.isFile() && stat.size > 0 ? { path: mediaPath, mimeType: metadata.mimeType } : null
  } catch {
    return null
  }
}

export async function createGeneratedMediaResponse(id: string, rangeHeader?: string | null): Promise<Response> {
  const resolved = await resolveGeneratedMedia(id)
  if (!resolved) return new Response('Not found', { status: 404 })
  const stat = await fs.stat(resolved.path)
  const commonHeaders = {
    'Content-Type': resolved.mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=31536000, immutable',
  }

  if (!rangeHeader) {
    const bytes = await fs.readFile(resolved.path)
    return new Response(bytes, { headers: { ...commonHeaders, 'Content-Length': String(bytes.length) } })
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!match) {
    return new Response(null, { status: 416, headers: { ...commonHeaders, 'Content-Range': `bytes */${stat.size}` } })
  }
  const requestedStart = match[1] ? Number(match[1]) : null
  const requestedEnd = match[2] ? Number(match[2]) : null
  const start = requestedStart ?? Math.max(0, stat.size - (requestedEnd ?? 0))
  const end = Math.min(stat.size - 1, requestedStart === null ? stat.size - 1 : (requestedEnd ?? stat.size - 1))
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= stat.size) {
    return new Response(null, { status: 416, headers: { ...commonHeaders, 'Content-Range': `bytes */${stat.size}` } })
  }
  const length = end - start + 1
  const handle = await fs.open(resolved.path, 'r')
  try {
    const bytes = Buffer.alloc(length)
    const { bytesRead } = await handle.read(bytes, 0, length, start)
    const body = bytesRead === length ? bytes : bytes.subarray(0, bytesRead)
    return new Response(body, {
      status: 206,
      headers: {
        ...commonHeaders,
        'Content-Length': String(body.length),
        'Content-Range': `bytes ${start}-${start + body.length - 1}/${stat.size}`,
      },
    })
  } finally {
    await handle.close()
  }
}
