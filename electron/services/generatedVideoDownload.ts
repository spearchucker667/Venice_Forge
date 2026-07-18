/** Secure, bounded retrieval for provider-supplied generated-video URLs. */
import dns from 'node:dns/promises'
import https from 'node:https'
import net from 'node:net'
import type { DurableGeneratedMedia } from './generatedMediaStore'
import { DEFAULT_MAX_GENERATED_VIDEO_BYTES, persistGeneratedMp4Stream } from './generatedMediaStream'

export const MAX_GENERATED_VIDEO_BYTES = DEFAULT_MAX_GENERATED_VIDEO_BYTES
const DOWNLOAD_TIMEOUT_MS = 30_000

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b, c] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

export function isPublicDownloadAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) return !isPrivateIpv4(address)
  if (family !== 6) return false

  const normalized = address.toLowerCase().split('%')[0]
  if (normalized === '::' || normalized === '::1') return false
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false
  if (/^fe[89ab]/.test(normalized)) return false
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return !isPrivateIpv4(mapped[1])
  return true
}

export async function resolveSafeDownloadTarget(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some((entry) => !isPublicDownloadAddress(entry.address))) {
    throw new Error('Video download host resolved to a blocked network address.')
  }
  const selected = addresses[0]
  if (selected.family !== 4 && selected.family !== 6) throw new Error('Video download host resolution was invalid.')
  return { address: selected.address, family: selected.family }
}

export async function downloadGeneratedVideo(
  rawUrl: string,
  options: { onSaving?: () => void | Promise<void> } = {},
): Promise<DurableGeneratedMedia> {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Video download URL was rejected.')
  }
  const target = await resolveSafeDownloadTarget(url.hostname)

  return await new Promise<DurableGeneratedMedia>((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: { Accept: 'video/mp4' },
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      timeout: DOWNLOAD_TIMEOUT_MS,
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error('Video download failed.'))
        return
      }
      const mimeType = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (mimeType !== 'video/mp4') {
        response.resume()
        reject(new Error('Video download returned an unsupported content type.'))
        return
      }
      const declaredLength = Number(response.headers['content-length'])
      if (Number.isFinite(declaredLength) && declaredLength > MAX_GENERATED_VIDEO_BYTES) {
        response.destroy()
        reject(new Error('Video download exceeded the size limit.'))
        return
      }

      void persistGeneratedMp4Stream(response, {
        maxBytes: MAX_GENERATED_VIDEO_BYTES,
        onSaving: options.onSaving,
      }).then(resolve, reject)
    })

    request.once('timeout', () => request.destroy(new Error('Video download timed out.')))
    request.once('error', reject)
    request.end()
  })
}
