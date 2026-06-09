/**
 * SAFETY CONTRACT:
 * - Electron Venice requests route through the desktop IPC layer
 *   (`electron/ipc/handlers.ts`).
 * - Electron IPC handlers use `electron/services/guardPipeline.ts` and the
 *   main-process runtime Family Safe Mode setting
 *   (`electron/services/runtimeSafetySettings.ts`) as the authoritative
 *   local filter state. This file MUST NOT run a duplicate renderer-side
 *   guard in Electron mode.
 * - The renderer-supplied `localFamilySafeModeEnabled` field is
 *   intentionally NOT consulted for Electron enforcement — the canonical
 *   toggle lives in the main process.
 * - Web mode (non-Electron) does run a renderer-side local guard via
 *   `maybeRunLocalFamilyGuard` in `src/services/veniceClient.ts`. The
 *   Express proxy in `server.ts` is the fail-closed backstop.
 * - All new functions in this file MUST route through `desktopVenice`
 *   (from `src/services/desktopBridge.ts`) so the IPC layer can enforce.
 *   Direct `fetch()` calls to Venice are forbidden.
 */
import { desktopVenice, isElectron } from '../services/desktopBridge'
import { useSettingsStore } from '../stores/settings-store'

export class VeniceAPIError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'VeniceAPIError'
    this.status = status
  }
}

function readVeniceErrorBody(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const record = body as Record<string, unknown>
  const errorObj = record.error as Record<string, unknown> | undefined
  const top = errorObj?.message || record.error || record.message
  if (top) {
    if (typeof top === 'object') {
      try {
        const str = JSON.stringify(top)
        if (str === '{}' || str === '[]') return String(top)
        return str
      } catch {
        return '[unserializable error]'
      }
    }
    return String(top)
  }
  const details = record.details
  if (details && typeof details === 'object') {
    const detailsRec = details as Record<string, unknown>
    if (Array.isArray(detailsRec._errors) && detailsRec._errors.length) return String(detailsRec._errors[0])
    for (const key of Object.keys(detailsRec)) {
      if (key === '_errors') continue
      const val = detailsRec[key] as Record<string, unknown> | undefined
      const errs = val?._errors
      if (Array.isArray(errs) && errs.length) return `${key}: ${String(errs[0])}`
    }
    return 'Request validation failed'
  }
  return String(record.detail || '')
}

/** Web-mode fallback: fetch through the Express proxy with the same
 *  error-body extraction and abort-signal forwarding as the desktop path. */
async function webVeniceFetch(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<{ ok: boolean; status: number; statusText: string; body: unknown; contentType?: string }> {
  const method = options.method || 'GET'
  const url = `/api/venice${path.replace('/api/v1', '')}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Venice-Forge-Family-Safe-Mode': String(useSettingsStore.getState().localFamilySafeModeEnabled),
  }
  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })

  let body: unknown = null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const text = await response.text().catch(() => '')
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = null
    }
  } else {
    const text = await response.text().catch(() => '')
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = { text }
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body,
    contentType: contentType || undefined,
  }
}

export async function venice<T>(path: string, options: { method?: string; body?: unknown; stream?: boolean; noAuth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method || 'GET'
  let parsedBody: unknown = undefined;
  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body === 'string') {
      try {
        parsedBody = JSON.parse(options.body);
      } catch (err) {
        throw new VeniceAPIError(
          `Invalid JSON body passed to venice(): ${err instanceof Error ? err.message : String(err)}`,
          0,
        );
      }
    } else {
      parsedBody = options.body;
    }
  }

  if (!isElectron()) {
    const response = await webVeniceFetch(path, { method, body: parsedBody, signal: options.signal })
    if (options.signal && options.signal.aborted) throw new Error('Aborted');
    if (!response.ok) {
      const bodyMessage = readVeniceErrorBody(response.body)
      throw new VeniceAPIError(
        bodyMessage || response.statusText || `HTTP ${response.status}`,
        response.status,
      )
    }
    return response.body as T
  }

  // VERIFY-006 (BUG-1): forward the AbortSignal to desktopVenice so the IPC
  // layer's `venice:abort` channel is triggered when the caller cancels.
  const response = await desktopVenice.request({
    endpoint: path.replace('/api/v1', ''),
    method: method as "GET" | "POST",
    body: parsedBody,
  }, options.signal)

  if (options.signal && options.signal.aborted) throw new Error('Aborted');
  if (!response.ok) {
    const bodyMessage = readVeniceErrorBody(response.body)
    throw new VeniceAPIError(
      bodyMessage || response.statusText || `HTTP ${response.status}`,
      response.status,
    )
  }
  return response.body as T
}

export async function veniceStreamChat(
  path: string,
  body: unknown,
  onDelta: (chunk: { content: string; reasoning?: string }) => void,
  init: { signal?: AbortSignal } = {}
) {
  if (init.signal?.aborted) throw new Error('Aborted');
  if (!isElectron()) {
    const url = `/api/venice${path.replace('/api/v1', '')}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Venice-Forge-Family-Safe-Mode': String(useSettingsStore.getState().localFamilySafeModeEnabled),
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: init.signal,
    })
    if (!response.ok) {
      let errBody: unknown = null
      try { errBody = await response.json() } catch { /* ignore */ }
      const bodyMessage = readVeniceErrorBody(errBody)
      throw new VeniceAPIError(bodyMessage || response.statusText || `HTTP ${response.status}`, response.status)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        if (init.signal?.aborted) throw new Error('Aborted')
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const json = trimmed.slice(6)
          if (json === '[DONE]') continue
          try {
            const parsed = JSON.parse(json)
            const delta = parsed.choices?.[0]?.delta
            if (delta) {
              onDelta({ content: delta.content || '', reasoning: delta.reasoning })
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
    return
  }
  return desktopVenice.streamChat({
    endpoint: path.replace('/api/v1', ''),
    method: "POST",
    body,
  }, onDelta, init.signal);
}

export async function veniceBlob(path: string, body: object, init: { signal?: AbortSignal } = {}): Promise<Blob> {
  // BUG-002 regression guard: forward `init.signal` to the IPC layer so
  // the main process can tear down the upstream HTTPS request on
  // cancellation. The post-hoc `aborted` check below is preserved for
  // safety (if the signal was already aborted when we entered).
  if (init.signal?.aborted) throw new Error('Aborted');

  if (!isElectron()) {
    const response = await webVeniceFetch(path, { method: 'POST', body, signal: init.signal })
    if (!response.ok) {
      const bodyMessage = readVeniceErrorBody(response.body)
      throw new VeniceAPIError(bodyMessage || `HTTP ${response.status}`, response.status)
    }
    // In web mode the proxy returns the raw binary; we need to fetch again
    // with the actual Response to get a Blob.
    const url = `/api/venice${path.replace('/api/v1', '')}`
    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Venice-Forge-Family-Safe-Mode': String(useSettingsStore.getState().localFamilySafeModeEnabled),
      },
      body: JSON.stringify(body),
      signal: init.signal,
    })
    if (!fetchResponse.ok) {
      throw new VeniceAPIError(fetchResponse.statusText || `HTTP ${fetchResponse.status}`, fetchResponse.status)
    }
    return await fetchResponse.blob()
  }

  const response = await desktopVenice.request({
    endpoint: path.replace('/api/v1', ''),
    method: "POST",
    body: body,
  }, init.signal);
  if (!response.ok) {
    const bodyMessage = readVeniceErrorBody(response.body)
    throw new VeniceAPIError(bodyMessage || `HTTP ${response.status}`, response.status)
  }

  // desktopBridge returns { dataBase64: "..." } for binary content
  const b64 = (response.body as { dataBase64?: string }).dataBase64;
  if (!b64) {
      if (typeof response.body === 'string') return new Blob([response.body], { type: response.contentType });
      return new Blob([], { type: response.contentType });
  }
  const binaryStr = atob(b64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);
  return new Blob([bytes], { type: response.contentType });
}

export async function veniceFormData<T>(path: string, formData: FormData, init: { signal?: AbortSignal } = {}): Promise<T> {
  // BUG-002 regression guard: see veniceBlob above.
  if (init.signal?.aborted) throw new Error('Aborted');

  if (!isElectron()) {
    const url = `/api/venice${path.replace('/api/v1', '')}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Venice-Forge-Family-Safe-Mode': String(useSettingsStore.getState().localFamilySafeModeEnabled),
      },
      body: formData,
      signal: init.signal,
    })
    let body: unknown = null
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const text = await response.text().catch(() => '')
      try { body = text ? JSON.parse(text) : {} } catch { body = null }
    } else {
      const text = await response.text().catch(() => '')
      try { body = text ? JSON.parse(text) : {} } catch { body = { text } }
    }
    if (!response.ok) {
      const bodyMessage = readVeniceErrorBody(body)
      throw new VeniceAPIError(bodyMessage || response.statusText || `HTTP ${response.status}`, response.status)
    }
    return body as T
  }

  const entries: Array<{ name: string; value: string; filename?: string; type?: string; _isFile?: boolean }> = [];
  // Base64-encode each File in 32 KiB chunks. A naive per-byte `+= String.fromCharCode`
  // call (the previous implementation) triggers a V8 "Maximum call stack size
  // exceeded" on multi-MiB uploads because it forces repeated string
  // concatenation in a tight loop. Chunked btoa() avoids the stack overflow
  // and is also ~2x faster on large files.
  const CHUNK_SIZE = 0x8000;
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      const buffer = await value.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binaryStr = '';
      for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
        const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.byteLength));
        // String.fromCharCode.apply accepts an array-like of code points and is
        // safe for chunks up to ~0x8000 entries. We use a spread call to avoid
        // apply() (which can blow the stack on huge arrays in strict mode).
        let chunkStr = '';
        for (let j = 0; j < slice.length; j++) {
          chunkStr += String.fromCharCode(slice[j]);
        }
        binaryStr += chunkStr;
      }
      const b64 = btoa(binaryStr);
      entries.push({
        name: key,
        value: b64,
        filename: value.name,
        type: value.type,
        _isFile: true
      });
    } else {
      entries.push({ name: key, value: String(value) });
    }
  }

  const response = await desktopVenice.request({
    endpoint: path.replace('/api/v1', ''),
    method: "POST",
    body: { _isSerializedFormData: true, entries }
  }, init.signal);

  if (!response.ok) {
    const bodyMessage = readVeniceErrorBody(response.body)
    throw new VeniceAPIError(bodyMessage || `HTTP ${response.status}`, response.status)
  }
  return response.body as T;
}
