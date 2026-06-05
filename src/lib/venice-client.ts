/**
 * SAFETY GUARD CONTRACT: This client delegates to the Electron IPC layer
 * (electron/ipc/handlers.ts). assessChildExploitationSafety() is called
 * in the main process before every outbound Venice request. Do NOT add a
 * duplicate renderer-side guard here — deduplication is by signalId in
 * the IPC handler. Any new function added to this file MUST route through
 * desktopVenice (from src/services/desktopBridge.ts) to preserve this
 * contract. Direct fetch() calls are forbidden.
 */
import { desktopVenice } from '../services/desktopBridge'

export class VeniceAPIError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'VeniceAPIError'
    this.status = status
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
  const response = await desktopVenice.request({
    endpoint: path.replace('/api/v1', ''),
    method: method as "GET" | "POST",
    body: parsedBody,
  })
  
  if (options.signal && options.signal.aborted) throw new Error('Aborted');
  if (!response.ok) {
    throw new VeniceAPIError(response.statusText || `HTTP ${response.status}`, response.status)
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
  return desktopVenice.streamChat({
    endpoint: path.replace('/api/v1', ''),
    method: "POST",
    body,
  }, onDelta, init.signal);
}

export async function veniceBlob(path: string, body: object, init: { signal?: AbortSignal } = {}): Promise<Blob> {
  const response = await desktopVenice.request({
    endpoint: path.replace('/api/v1', ''),
    method: "POST",
    body: body,
  });
  if (init.signal && init.signal.aborted) throw new Error('Aborted');
  if (!response.ok) throw new VeniceAPIError(`HTTP ${response.status}`, response.status);
  
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
  });

  if (init.signal && init.signal.aborted) throw new Error('Aborted');
  if (!response.ok) throw new VeniceAPIError(`HTTP ${response.status}`, response.status);
  return response.body as T;
}
