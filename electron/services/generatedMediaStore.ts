/** Durable generated image/audio/video storage owned by the Electron main process. */
import { app, net } from 'electron'
import crypto from 'crypto'
import {
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat as fsStat,
  writeFile,
  readFile,
} from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import { checkPathContained } from '../utils/navigation'
import {
  buildCorsHeaders,
  evaluateCustomProtocolAccess,
  type CustomProtocolAccessInput,
} from '../utils/customProtocolAccess'
import { logError, logInfo, logWarn } from './logger'
import { mediaBytesMatchMime, mediaExtensionForMime, normalizeMediaMime } from './mediaFormat'

export const GENERATED_MEDIA_SCHEME = 'venice-media'

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

export type GeneratedMediaPersistenceErrorKind =
  | 'storage-full'
  | 'permission-denied'
  | 'storage-busy'
  | 'storage-unavailable'
  | 'integrity-failed'
  | 'invalid-media'
  | 'unknown'

export interface GeneratedMediaPersistenceFailure {
  kind: GeneratedMediaPersistenceErrorKind
  retryable: boolean
  message: string
  code?: string
}

interface GeneratedMediaMetadata {
  version: 1
  id: string
  sha256: string
  mimeType: string
  byteCount: number
  extension: string
}

interface PendingGeneratedMediaWrite {
  version: 1
  temporaryName: string
  mimeType: string
  byteCount: number
  sha256: string
  createdAt: number
}

const PERSIST_RETRY_DELAYS_MS = [25, 100, 250] as const
const RETRYABLE_PERSISTENCE_CODES = new Set([
  'EAGAIN',
  'EBUSY',
  'EINTR',
  'EMFILE',
  'ENFILE',
  'ESTALE',
  'ETIMEDOUT',
])

export function classifyGeneratedMediaPersistenceError(error: unknown): GeneratedMediaPersistenceFailure {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code.toUpperCase()
    : undefined
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'ENOSPC' || code === 'EDQUOT' || /quotaexceeded/i.test(message)) {
    return { kind: 'storage-full', retryable: false, code, message: 'Generated media could not be saved because local storage is full.' }
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return { kind: 'permission-denied', retryable: false, code, message: 'Generated media could not be saved because the media folder is not writable.' }
  }
  if (code && RETRYABLE_PERSISTENCE_CODES.has(code)) {
    return { kind: 'storage-busy', retryable: true, code, message: 'Generated media storage remained busy after automatic retries.' }
  }
  if (['ENODEV', 'ENXIO', 'EROFS', 'EIO', 'ENOTCONN', 'ENETDOWN', 'ENETUNREACH', 'EHOSTDOWN', 'EHOSTUNREACH'].includes(code ?? '')) {
    return { kind: 'storage-unavailable', retryable: false, code, message: 'Generated media storage is currently unavailable.' }
  }
  if (/digest|integrity|checksum|incomplete|did not match/i.test(message)) {
    return { kind: 'integrity-failed', retryable: false, code, message: 'Generated media failed its integrity check and was not accepted.' }
  }
  if (/unsupported content type|response was empty|invalid/i.test(message)) {
    return { kind: 'invalid-media', retryable: false, code, message: 'Generated media was empty, invalid, or unsupported.' }
  }
  return { kind: 'unknown', retryable: false, code, message: 'Generated media could not be saved to durable storage.' }
}

export async function retryGeneratedMediaPersistence<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= PERSIST_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const failure = classifyGeneratedMediaPersistenceError(error)
      if (!failure.retryable || attempt === PERSIST_RETRY_DELAYS_MS.length) throw error
      await new Promise((resolve) => setTimeout(resolve, PERSIST_RETRY_DELAYS_MS[attempt]))
    }
  }
  throw lastError
}

export function getGeneratedMediaRoot(): string {
  return path.join(app.getPath('userData'), 'media', 'blobs', 'sha256')
}

function isLexicallyContained(target: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function pendingJournalPath(sha256: string): string {
  return path.join(getGeneratedMediaRoot(), `.pending-${sha256}.json`)
}

async function syncFile(filePath: string): Promise<void> {
  // Windows requires a writable handle for FlushFileBuffers/fsync.
  const handle = await open(filePath, 'r+')
  try { await handle.sync() } finally { await handle.close() }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  // Windows does not support opening directory handles for fsync. File and
  // metadata fsync still complete before rename on that platform.
  if (process.platform === 'win32') return
  const handle = await open(directoryPath, 'r')
  try { await handle.sync() } finally { await handle.close() }
}

async function writeJsonAtomically(destination: string, value: unknown): Promise<void> {
  const temporary = `${destination}.tmp-${crypto.randomBytes(6).toString('hex')}`
  const displaced = `${destination}.previous-${crypto.randomBytes(6).toString('hex')}`
  let displacedExisting = false
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 })
    await syncFile(temporary)
    try {
      await rename(temporary, destination)
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      try {
        await rename(destination, displaced)
        displacedExisting = true
      } catch (displaceError) {
        if ((displaceError as NodeJS.ErrnoException).code !== 'ENOENT') throw displaceError
      }
      try {
        await rename(temporary, destination)
      } catch (replacementError) {
        if (displacedExisting) await rename(displaced, destination).catch(() => undefined)
        throw replacementError
      }
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
    if (displacedExisting) await rm(displaced, { force: true }).catch(() => undefined)
  }
}

async function readGeneratedMediaMetadata(id: string): Promise<GeneratedMediaMetadata | null> {
  const root = getGeneratedMediaRoot()
  const metadataPath = path.join(root, `${id}.json`)
  if (!checkPathContained(metadataPath, root)) return null
  try {
    const value = JSON.parse(await readFile(metadataPath, 'utf8')) as Partial<GeneratedMediaMetadata>
    if (
      value.version !== 1 ||
      value.id !== id ||
      value.sha256 !== id ||
      typeof value.mimeType !== 'string' ||
      typeof value.extension !== 'string' ||
      !Number.isSafeInteger(value.byteCount) ||
      (value.byteCount ?? 0) <= 0 ||
      mediaExtensionForMime(value.mimeType) !== value.extension
    ) return null
    return value as GeneratedMediaMetadata
  } catch {
    return null
  }
}

export async function verifyGeneratedMediaIntegrity(id: string): Promise<{
  ok: boolean
  reason?: 'invalid-id' | 'metadata-missing' | 'blob-missing' | 'size-mismatch' | 'hash-mismatch'
  media?: { path: string; mimeType: string; byteCount: number }
}> {
  if (!/^[a-f0-9]{64}$/.test(id)) return { ok: false, reason: 'invalid-id' }
  const metadata = await readGeneratedMediaMetadata(id)
  if (!metadata) return { ok: false, reason: 'metadata-missing' }
  const root = getGeneratedMediaRoot()
  const mediaPath = path.join(root, `${id}.${metadata.extension}`)
  if (!checkPathContained(mediaPath, root)) return { ok: false, reason: 'blob-missing' }
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    // Use a file handle for stat+read to close the TOCTOU window.
    handle = await open(mediaPath, 'r')
    const stat = await handle.stat()
    if (!stat.isFile()) return { ok: false, reason: 'blob-missing' }
    if (stat.size !== metadata.byteCount) return { ok: false, reason: 'size-mismatch' }
    const bytes = await handle.readFile()
    const actualHash = crypto.createHash('sha256').update(bytes).digest('hex')
    if (actualHash !== id) return { ok: false, reason: 'hash-mismatch' }
    return { ok: true, media: { path: mediaPath, mimeType: metadata.mimeType, byteCount: metadata.byteCount } }
  } catch {
    return { ok: false, reason: 'blob-missing' }
  } finally {
    if (handle) await handle.close().catch(() => undefined)
  }
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
  const normalizedMime = normalizeMediaMime(input.mimeType)
  const extension = mediaExtensionForMime(normalizedMime)
  if (!extension) throw new Error('Generated media has an unsupported content type.')
  if (!Number.isSafeInteger(input.byteCount) || input.byteCount <= 0) throw new Error('Generated media response was empty.')
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error('Generated media digest was invalid.')

  const root = getGeneratedMediaRoot()
  await mkdir(root, { recursive: true, mode: 0o700 })
  const mediaPath = path.join(root, `${input.sha256}.${extension}`)
  const metadataPath = path.join(root, `${input.sha256}.json`)
  if (!isLexicallyContained(input.temporaryPath, root) || !isLexicallyContained(mediaPath, root) || !isLexicallyContained(metadataPath, root)) {
    throw new Error('Generated media path was rejected.')
  }

  const existing = await verifyGeneratedMediaIntegrity(input.sha256)
  if (existing.ok) {
    await rm(input.temporaryPath, { force: true }).catch(() => undefined)
    return { id: input.sha256, url: `${GENERATED_MEDIA_SCHEME}://${input.sha256}`, mimeType: normalizedMime, byteCount: input.byteCount, sha256: input.sha256 }
  }

  let mediaBlobAlreadyCommitted = false
  let checkHandle: Awaited<ReturnType<typeof open>> | undefined
  try {
    // Use a file handle to close the stat-then-read TOCTOU window.
    checkHandle = await open(mediaPath, 'r')
    const mediaStat = await checkHandle.stat()
    if (mediaStat.isFile() && mediaStat.size === input.byteCount) {
      const mediaBytes = await checkHandle.readFile()
      mediaBlobAlreadyCommitted = crypto.createHash('sha256').update(mediaBytes).digest('hex') === input.sha256
    }
    await checkHandle.close()
    checkHandle = undefined
    if (!mediaBlobAlreadyCommitted) {
      await rename(mediaPath, `${mediaPath}.corrupt-${Date.now()}`)
    }
  } catch (error) {
    if (checkHandle) await checkHandle.close().catch(() => undefined)
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  if (!mediaBlobAlreadyCommitted) {
    const stat = await fsStat(input.temporaryPath)
    if (!stat.isFile() || stat.size !== input.byteCount) throw new Error('Generated media temporary file was incomplete.')
    await rename(input.temporaryPath, mediaPath)
  } else {
    await rm(input.temporaryPath, { force: true }).catch(() => undefined)
  }
  const metadata: GeneratedMediaMetadata = {
    version: 1,
    id: input.sha256,
    sha256: input.sha256,
    mimeType: normalizedMime,
    byteCount: input.byteCount,
    extension,
  }
  await writeJsonAtomically(metadataPath, metadata)
  await syncDirectory(root)

  const verified = await verifyGeneratedMediaIntegrity(input.sha256)
  if (!verified.ok) throw new Error(`Generated media integrity verification failed: ${verified.reason ?? 'unknown'}.`)
  return { id: input.sha256, url: `${GENERATED_MEDIA_SCHEME}://${input.sha256}`, mimeType: normalizedMime, byteCount: input.byteCount, sha256: input.sha256 }
}

export async function persistGeneratedMedia(bytes: Buffer, mimeType: string): Promise<DurableGeneratedMedia> {
  const normalizedMime = normalizeMediaMime(mimeType)
  const extension = mediaExtensionForMime(normalizedMime)
  if (!extension) throw new Error('Generated media has an unsupported content type.')
  if (bytes.length === 0) throw new Error('Generated media response was empty.')
  if (!mediaBytesMatchMime(bytes, normalizedMime)) throw new Error('Generated media bytes did not match the declared content type.')
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  const existing = await verifyGeneratedMediaIntegrity(sha256)
  if (existing.ok) {
    return { id: sha256, url: `${GENERATED_MEDIA_SCHEME}://${sha256}`, mimeType: normalizedMime, byteCount: bytes.length, sha256 }
  }

  const temp = await retryGeneratedMediaPersistence(() => createGeneratedMediaTempFile())
  const journalPath = pendingJournalPath(sha256)
  try {
    const pending: PendingGeneratedMediaWrite = {
      version: 1,
      temporaryName: path.basename(temp.path),
      mimeType: normalizedMime,
      byteCount: bytes.length,
      sha256,
      createdAt: Date.now(),
    }
    await retryGeneratedMediaPersistence(() => writeJsonAtomically(journalPath, pending))
    await retryGeneratedMediaPersistence(() => temp.handle.writeFile(bytes).then(() => undefined))
    await retryGeneratedMediaPersistence(() => temp.handle.sync())
    await temp.handle.close()
    const result = await retryGeneratedMediaPersistence(() => commitGeneratedMediaTempFile({ temporaryPath: temp.path, mimeType: normalizedMime, byteCount: bytes.length, sha256 }))
    await rm(journalPath, { force: true })
    logInfo('Generated media persisted', { mediaId: sha256, mimeType: normalizedMime, byteCount: bytes.length })
    return result
  } catch (error) {
    await temp.handle.close().catch(() => undefined)
    const failure = classifyGeneratedMediaPersistenceError(error)
    logError('Generated media persistence failed; recoverable input retained when possible', {
      kind: failure.kind,
      code: failure.code,
      retryable: failure.retryable,
      mediaId: sha256,
    })
    const publicError = new Error(failure.message) as Error & { code?: string; kind?: string; retryable?: boolean }
    publicError.code = failure.code
    publicError.kind = failure.kind
    publicError.retryable = failure.retryable
    throw publicError
  }
}

export async function resolveGeneratedMedia(id: string): Promise<{ path: string; mimeType: string } | null> {
  if (!/^[a-f0-9]{64}$/.test(id)) return null
  const metadata = await readGeneratedMediaMetadata(id)
  if (!metadata) return null
  const mediaPath = path.join(getGeneratedMediaRoot(), `${id}.${metadata.extension}`)
  if (!checkPathContained(mediaPath, getGeneratedMediaRoot())) return null
  try {
    const stat = await fsStat(mediaPath)
    return stat.isFile() && stat.size === metadata.byteCount ? { path: mediaPath, mimeType: metadata.mimeType } : null
  } catch { return null }
}

export async function recoverPendingGeneratedMediaWrites(): Promise<{ recovered: number; failed: number }> {
  const root = getGeneratedMediaRoot()
  await mkdir(root, { recursive: true, mode: 0o700 })
  const names = await readdir(root)
  let recovered = 0
  let failed = 0
  for (const name of names.filter((entry) => /^\.pending-[a-f0-9]{64}\.json$/.test(entry))) {
    const journalPath = path.join(root, name)
    try {
      const pending = JSON.parse(await readFile(journalPath, 'utf8')) as Partial<PendingGeneratedMediaWrite>
      if (
        pending.version !== 1 ||
        typeof pending.temporaryName !== 'string' ||
        !/^\.incoming-[a-f0-9]{24}\.tmp$/.test(pending.temporaryName) ||
        typeof pending.mimeType !== 'string' ||
        !Number.isSafeInteger(pending.byteCount) ||
        (pending.byteCount ?? 0) <= 0 ||
        typeof pending.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(pending.sha256)
      ) throw new Error('Pending generated-media journal was invalid.')
      const temporaryPath = path.join(root, pending.temporaryName)
      if (!isLexicallyContained(temporaryPath, root)) throw new Error('Pending generated-media path was rejected.')
      await retryGeneratedMediaPersistence(() => commitGeneratedMediaTempFile({
        temporaryPath,
        mimeType: pending.mimeType!,
        byteCount: pending.byteCount!,
        sha256: pending.sha256!,
      }))
      await rm(journalPath, { force: true })
      recovered += 1
    } catch (error) {
      failed += 1
      const failure = classifyGeneratedMediaPersistenceError(error)
      logWarn('Pending generated media could not be recovered', { journal: name, kind: failure.kind, code: failure.code })
      const tempMissing = failure.code === 'ENOENT' || /temporary|missing|incomplete/i.test(String(error))
      if (tempMissing) {
        await rm(journalPath, { force: true }).catch(() => undefined)
      }
    }
  }
  await reapGeneratedMediaArtifacts()
  if (recovered > 0 || failed > 0) logInfo('Generated media recovery completed', { recovered, failed })
  return { recovered, failed }
}

const CORRUPT_ARTIFACT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export async function reapGeneratedMediaArtifacts(now = Date.now()): Promise<{ corruptRemoved: number; journalsRemoved: number }> {
  const root = getGeneratedMediaRoot()
  await mkdir(root, { recursive: true, mode: 0o700 })
  const names = await readdir(root)
  let corruptRemoved = 0
  let journalsRemoved = 0
  for (const name of names) {
    const fullPath = path.join(root, name)
    try {
      const stat = await fsStat(fullPath)
      if (/\.corrupt-\d+$/.test(name) && now - stat.mtimeMs >= CORRUPT_ARTIFACT_MAX_AGE_MS) {
        await rm(fullPath, { force: true })
        corruptRemoved += 1
        continue
      }
      if (/^\.pending-[a-f0-9]{64}\.json$/.test(name)) {
        const pending = JSON.parse(await readFile(fullPath, 'utf8')) as Partial<PendingGeneratedMediaWrite>
        const temporaryName = typeof pending.temporaryName === 'string' ? pending.temporaryName : ''
        const temporaryPath = temporaryName ? path.join(root, temporaryName) : ''
        let tempExists = false
        if (temporaryPath) {
          try {
            await fsStat(temporaryPath)
            tempExists = true
          } catch {
            tempExists = false
          }
        }
        if (!tempExists) {
          await rm(fullPath, { force: true })
          journalsRemoved += 1
        }
      }
    } catch {
      /* ignore unreadable artifacts */
    }
  }
  return { corruptRemoved, journalsRemoved }
}

export async function auditGeneratedMediaIntegrity(): Promise<{ checked: number; healthy: number; failed: number }> {
  const root = getGeneratedMediaRoot()
  await mkdir(root, { recursive: true, mode: 0o700 })
  const names = await readdir(root)
  const ids = names
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .map((name) => name.slice(0, -5))
  let healthy = 0
  for (const id of ids) {
    const result = await verifyGeneratedMediaIntegrity(id)
    if (result.ok) healthy += 1
    else logWarn('Generated media integrity check failed', { mediaId: id, reason: result.reason })
  }
  return { checked: ids.length, healthy, failed: ids.length - healthy }
}

export function startGeneratedMediaIntegrityMonitor(intervalMs = 6 * 60 * 60 * 1000): () => void {
  const timer = setInterval(() => {
    void auditGeneratedMediaIntegrity()
      .then((result) => {
        if (result.failed > 0) logWarn('Periodic generated media integrity audit found failures', result)
      })
      .catch((error) => logError('Periodic generated media integrity audit failed', error))
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

export async function createGeneratedMediaResponse(
  id: string,
  request: Request,
  access: CustomProtocolAccessInput,
): Promise<Response> {
  const decision = evaluateCustomProtocolAccess(access)
  if (!decision.allowed) return new Response('Forbidden', { status: 403 })

  const resolved = await resolveGeneratedMedia(id)
  if (!resolved) return new Response('Not found', { status: 404 })

  const fileUrl = pathToFileURL(resolved.path).toString()
  const res = await net.fetch(fileUrl, { headers: request.headers })

  const headers = new Headers(res.headers)
  // Preserve byte-range metadata so `<video>`/`<audio>` can seek + report duration.
  // `net.fetch` over `file://` honours `Range` natively — a 206 response carries
  // `Content-Range` + `Content-Length`, a 200 carries `Content-Length`, and
  // `Accept-Ranges: bytes` is set whenever the response is partial-capable.
  // We deliberately do NOT overwrite Content-Range, Content-Length, or
  // Accept-Ranges here.
  headers.set('Cache-Control', 'private, max-age=31536000, immutable')
  headers.set('Content-Type', resolved.mimeType)
  for (const [name, value] of Object.entries(buildCorsHeaders(decision))) {
    headers.set(name, value)
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
