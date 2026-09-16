/** @fileoverview Shared byte/size limits used across renderer, proxy, and Electron IPC. */

/** Base mebibyte unit in bytes. */
export const MIB = 1024 * 1024;

/** Unified raw Venice request-body limit (matches proxy + IPC + import/export caps). */
export const VENICE_MAX_BODY_BYTES = 25 * MIB;

/** Maximum Jina response body buffered before parsing or safety screening. */
export const JINA_MAX_RESPONSE_BYTES = 2 * MIB;

/** Maximum raw upload file size accepted in the renderer. */
export const VENICE_MAX_RAW_UPLOAD_BYTES = VENICE_MAX_BODY_BYTES;

/** Maximum serialized (base64-expanded) upload payload allowed over IPC. */
export const VENICE_MAX_SERIALIZED_UPLOAD_BYTES = Math.floor((VENICE_MAX_RAW_UPLOAD_BYTES * 4) / 3);

/** Maximum Venice media/non-stream response body retained under Family Safe Mode. */
export const VENICE_PROXY_MAX_FSM_RESPONSE_BYTES = 256 * MIB;

/** Modality-specific caps for Family Safe Mode generated-media screening
 *  (VF-20260916-P1-003). These bound BOTH the heap/spool accumulation and the
 *  screening read so a large or malicious upstream cannot exhaust the proxy
 *  process. `VENICE_PROXY_MAX_FSM_RESPONSE_BYTES` remains the SSE chat cap. */
export const FSM_MEDIA_MAX_IMAGE_BYTES = 32 * MIB;
export const FSM_MEDIA_MAX_AUDIO_BYTES = 64 * MIB;
export const FSM_MEDIA_MAX_VIDEO_BYTES = 128 * MIB;
/** Cap for media responses whose Content-Type is missing or not media
 *  (e.g. JSON envelopes carrying base64 media). */
export const FSM_MEDIA_MAX_DEFAULT_BYTES = 64 * MIB;

/** Above this accumulated size, the FSM media collector spools to a bounded
 *  temp file instead of growing the chunk array in the process heap. */
export const FSM_MEDIA_HEAP_SPOOL_THRESHOLD_BYTES = 8 * MIB;

/** Prefix size sufficient for structural screening of spooled audio/video
 *  (magic bytes / container headers). The video classifier documents its
 *  input as the first ~64 KB. */
export const FSM_MEDIA_STRUCTURAL_PREFIX_BYTES = 64 * 1024;

/** Maximum one SSE event retained while Family Safe Mode classifies it. */
export const VENICE_PROXY_MAX_FSM_SSE_EVENT_BYTES = 256 * 1024;

