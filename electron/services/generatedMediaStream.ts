/** Streaming persistence for large generated media responses. */
import crypto from 'crypto'
import * as fs from 'fs/promises'
import type { Readable } from 'stream'
import {
  commitGeneratedMediaTempFile,
  createGeneratedMediaTempFile,
  type DurableGeneratedMedia,
} from './generatedMediaStore'

export const DEFAULT_MAX_GENERATED_VIDEO_BYTES = 256 * 1024 * 1024

export async function persistGeneratedMp4Stream(
  readable: Readable,
  options: { maxBytes?: number; onSaving?: () => void | Promise<void> } = {},
): Promise<DurableGeneratedMedia> {
  const configured = Number(process.env.VENICE_FORGE_MAX_GENERATED_VIDEO_BYTES)
  const maxBytes = options.maxBytes ?? (
    Number.isSafeInteger(configured) && configured > 0
      ? configured
      : DEFAULT_MAX_GENERATED_VIDEO_BYTES
  )
  const temporary = await createGeneratedMediaTempFile()
  const digest = crypto.createHash('sha256')
  let byteCount = 0
  let header = Buffer.alloc(0)

  try {
    for await (const value of readable) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array)
      byteCount += chunk.length
      if (byteCount > maxBytes) throw new Error('Video download exceeded the size limit.')
      if (header.length < 12) header = Buffer.concat([header, chunk.subarray(0, 12 - header.length)])
      digest.update(chunk)
      await temporary.handle.write(chunk)
    }
    if (byteCount === 0) throw new Error('Video download was empty.')
    if (header.length < 12 || header.subarray(4, 8).toString('ascii') !== 'ftyp') {
      throw new Error('Video bytes did not contain an MP4 signature.')
    }
    await temporary.handle.sync()
    await temporary.handle.close()
    await options.onSaving?.()
    return await commitGeneratedMediaTempFile({
      temporaryPath: temporary.path,
      mimeType: 'video/mp4',
      byteCount,
      sha256: digest.digest('hex'),
    })
  } catch (error) {
    readable.destroy()
    await temporary.handle.close().catch(() => undefined)
    await fs.rm(temporary.path, { force: true }).catch(() => undefined)
    throw error
  }
}
