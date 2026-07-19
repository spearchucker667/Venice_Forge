/** Durable generated audio/video storage owned by the Electron main process. */
import { app, net } from 'electron'
import crypto from 'crypto'
import {
  mkdir,
  open,
  rename,
  rm,
  stat as fsStat,
  writeFile,
  readFile,
} from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import { checkPathContained } from '../utils/navigation'

export const GENERATED_MEDIA_SCHEME = 'venice-media'
const ALLOWED_MIME = new Map([
  ['video/mp4', 'mp4'],
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/flac', 'flac'],
])

export interface GeneratedMediaTempFile {
  path: string
  handle: Awaited<ReturnType<typeof open>>
}

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

export async function createGeneratedMediaTempFile(): Promise<GeneratedMediaTempFile> {
  const root = getGeneratedMediaRoot()
  await mkdir(root, { recursive: true, mode: 0o700 })
  const temporaryPath = path.join(root, `.incoming-${crypto.randomBytes(12).toString('hex')}.tmp`)
  if (!isLexicallyContained(temporaryPath, root)) throw new Error('Generated media path was rejected.')
  return { path: temporaryPath, handle: await open(temporaryPath, 'wx', 0o600) }
}

export async function commitGeneratedMediaTempFile(input: {
  temporaryPath: string
  mimeType: string
  byteCount: number
  sha256: string
}): Promise<DurableGeneratedMedia> {
  const normalizedMime = input.mimeType.split(';')[0].trim().toLowerCase()
  const extension = ALLOWED_MIME.get(normalizedMime)
  if (!extension) throw new Error('Generated media has an unsupported content type.')
  if (!Number.isSafeInteger(input.byteCount) || input.byteCount <= 0) throw new Error('Generated media response was empty.')
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error('Generated media digest was invalid.')

  const root = getGeneratedMediaRoot()
  const mediaPath = path.join(root, `${input.sha256}.${extension}`)
  const metadataPath = path.join(root, `${input.sha256}.json`)
  const metadataTemp = `${metadataPath}.tmp-${crypto.randomBytes(6).toString('hex')}`
  if (!isLexicallyContained(input.temporaryPath, root) || !isLexicallyContained(mediaPath, root) || !isLexicallyContained(metadataPath, root)) {
    throw new Error('Generated media path was rejected.')
  }
  const stat = await fsStat(input.temporaryPath)
  if (!stat.isFile() || stat.size !== input.byteCount) throw new Error('Generated media temporary file was incomplete.')

  try {
    try {
      await rename(input.temporaryPath, mediaPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      await rm(input.temporaryPath, { force: true })
    }
    const metadata = JSON.stringify({ version: 1, id: input.sha256, sha256: input.sha256, mimeType: normalizedMime, byteCount: input.byteCount, extension })
    await writeFile(metadataTemp, metadata, { mode: 0o600 })
    const metadataHandle = await open(metadataTemp, 'r')
    try { await metadataHandle.sync() } finally { await metadataHandle.close() }
    await rename(metadataTemp, metadataPath)
    const directoryHandle = await open(root, 'r')
    try { await directoryHandle.sync() } finally { await directoryHandle.close() }
  } catch (error) {
    await rm(input.temporaryPath, { force: true }).catch(() => undefined)
    await rm(metadataTemp, { force: true }).catch(() => undefined)
    throw error
  }
  return { id: input.sha256, url: `${GENERATED_MEDIA_SCHEME}://${input.sha256}`, mimeType: normalizedMime, byteCount: input.byteCount, sha256: input.sha256 }
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
  const temp = await createGeneratedMediaTempFile()
  try {
    await temp.handle.writeFile(bytes)
    await temp.handle.sync()
    await temp.handle.close()
    return await commitGeneratedMediaTempFile({ temporaryPath: temp.path, mimeType: normalizedMime, byteCount: bytes.length, sha256 })
  } catch (error) {
    await temp.handle.close().catch(() => undefined)
    await rm(temp.path, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function resolveGeneratedMedia(id: string): Promise<{ path: string; mimeType: string } | null> {
  if (!/^[a-f0-9]{64}$/.test(id)) return null
  const root = getGeneratedMediaRoot()
  const metadataPath = path.join(root, `${id}.json`)
  if (!checkPathContained(metadataPath, root)) return null
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as { id?: string; mimeType?: string; extension?: string }
    if (metadata.id !== id || !metadata.mimeType || !metadata.extension || ALLOWED_MIME.get(metadata.mimeType) !== metadata.extension) return null
    const mediaPath = path.join(root, `${id}.${metadata.extension}`)
    if (!checkPathContained(mediaPath, root)) return null
    const stat = await fsStat(mediaPath)
    return stat.isFile() && stat.size > 0 ? { path: mediaPath, mimeType: metadata.mimeType } : null
  } catch {
    return null
  }
}

export async function createGeneratedMediaResponse(id: string, request: Request): Promise<Response> {
  const resolved = await resolveGeneratedMedia(id)
  if (!resolved) return new Response('Not found', { status: 404 })

  const fileUrl = pathToFileURL(resolved.path).toString()
  const res = await net.fetch(fileUrl, { headers: request.headers })
  
  const headers = new Headers(res.headers)
  headers.set('Cache-Control', 'private, max-age=31536000, immutable')
  headers.set('Content-Type', resolved.mimeType)

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
