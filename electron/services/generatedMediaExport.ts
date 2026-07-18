/** Native Save As boundary for main-owned generated media. */
import { dialog } from 'electron'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { resolveGeneratedMedia } from './generatedMediaStore'

const EXTENSION_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/flac': 'flac',
}

function sanitizeSuggestedName(value: unknown, extension: string): string {
  const stem = typeof value === 'string' ? path.parse(path.basename(value)).name : 'venice-forge-media'
  const sanitized = stem.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'venice-forge-media'
  return `${sanitized}.${extension}`
}

export async function saveGeneratedMediaAs(input: { mediaId: string; suggestedName?: string }): Promise<{
  ok: boolean
  canceled: boolean
  filename?: string
  bytes?: number
}> {
  if (!/^[a-f0-9]{64}$/.test(input.mediaId)) throw new Error('Generated media ID was invalid.')
  const resolved = await resolveGeneratedMedia(input.mediaId)
  if (!resolved) throw new Error('Generated media is missing. Retry retrieval from Video Studio.')
  const extension = EXTENSION_BY_MIME[resolved.mimeType]
  if (!extension) throw new Error('Generated media type cannot be exported.')
  const suggestedName = sanitizeSuggestedName(input.suggestedName, extension)
  // verify-no-native-dialogs: allow — user-initiated generated-media Save As
  const choice = await dialog.showSaveDialog({
    title: 'Save generated media',
    defaultPath: suggestedName,
    filters: [{ name: resolved.mimeType === 'video/mp4' ? 'MP4 video' : 'Audio', extensions: [extension] }],
  })
  if (choice.canceled || !choice.filePath) return { ok: true, canceled: true }
  const parsedDestination = path.parse(choice.filePath)
  const destination = path.join(parsedDestination.dir, `${parsedDestination.name}.${extension}`)
  const temporary = `${destination}.tmp-${crypto.randomBytes(6).toString('hex')}`
  try {
    await fs.copyFile(resolved.path, temporary)
    const handle = await fs.open(temporary, 'r')
    try { await handle.sync() } finally { await handle.close() }
    await fs.rm(destination, { force: true })
    await fs.rename(temporary, destination)
    const stat = await fs.stat(destination)
    return { ok: true, canceled: false, filename: path.basename(destination), bytes: stat.size }
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}
