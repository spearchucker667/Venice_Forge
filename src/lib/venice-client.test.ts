import { describe, it, expect, vi, beforeEach } from 'vitest'
import { venice, veniceStreamChat, veniceBlob, veniceFormData, VeniceAPIError } from './venice-client'
import { desktopVenice } from '../services/desktopBridge'

vi.mock('../services/desktopBridge', () => ({
  desktopVenice: {
    request: vi.fn(),
    streamChat: vi.fn(),
  },
  isElectron: () => true,
}))

describe('venice-client (lib)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should make a request successfully', async () => {
    vi.mocked(desktopVenice.request).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {},
      contentType: 'application/json',
      body: { data: 'hello' },
    })

    const result = await venice('/chat/completions', { method: 'POST', body: { test: true } })
    expect(result).toEqual({ data: 'hello' })
    expect(desktopVenice.request).toHaveBeenCalledWith({
      endpoint: '/chat/completions',
      method: 'POST',
      body: { test: true },
    })
  })

  it('should throw VeniceAPIError on failure', async () => {
    vi.mocked(desktopVenice.request).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      contentType: 'application/json',
      body: null,
    })

    await expect(venice('/chat/completions')).rejects.toThrow(VeniceAPIError)
  })

  it('should handle streaming completions', async () => {
    vi.mocked(desktopVenice.streamChat).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {},
      contentType: 'text/event-stream',
      body: null,
    })

    const onDelta = vi.fn()
    await veniceStreamChat('/chat/completions', { prompt: 'hi' }, onDelta)
    expect(desktopVenice.streamChat).toHaveBeenCalledWith({
      endpoint: '/chat/completions',
      method: 'POST',
      body: { prompt: 'hi' },
    }, onDelta, undefined)
  })

  it('should return a blob', async () => {
    vi.mocked(desktopVenice.request).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {},
      contentType: 'image/png',
      body: { dataBase64: 'dGVzdA==' }, // 'test' in base64
    })

    const blob = await veniceBlob('/image/generate', { prompt: 'image' })
    expect(blob.type).toBe('image/png')
    const text = await blob.text()
    expect(text).toBe('test')
  })

  it('should send serialized form data correctly', async () => {
    vi.mocked(desktopVenice.request).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {},
      contentType: 'application/json',
      body: { ok: true },
    })

    const fd = new FormData()
    fd.append('foo', 'bar')
    
    const res = await veniceFormData<{ ok: boolean }>('/augment/scrape', fd)
    expect(res.ok).toBe(true)
    expect(desktopVenice.request).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/augment/scrape',
        method: 'POST',
        body: {
          _isSerializedFormData: true,
          entries: [
            { name: 'foo', value: 'bar' }
          ]
        }
      })
    )
  })
})
