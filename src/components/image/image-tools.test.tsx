import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/storageService', () => ({
  default: {
    putMedia: vi.fn(),
    patchMedia: vi.fn(),
    bulkPatchMedia: vi.fn(),
    deleteMedia: vi.fn(),
    deleteMediaMany: vi.fn(),
    getItems: vi.fn(),
  },
}))

let mutateMock = vi.fn()
vi.mock('../../hooks/use-image-tools', () => ({
  useImageEdit: () => ({
    mutate: (...args: unknown[]) => mutateMock(...args),
    isPending: false,
    error: null,
  }),
  useImageUpscale: () => ({ mutate: mutateMock, isPending: false, error: null }),
  useBackgroundRemove: () => ({ mutate: mutateMock, isPending: false, error: null }),
}))

vi.mock('../../stores/auth-store', () => ({
  selectHasVeniceKey: (state: { apiKey: string | null; isConfigured: boolean }) => state.isConfigured || Boolean(state.apiKey),
  useAuthStore: (selector: (s: { apiKey: string | null; isConfigured: boolean }) => unknown) => selector({ apiKey: 'test-key', isConfigured: true }),
}))

vi.mock('../../services/attachmentService', () => ({
  isSupportedImageFile: vi.fn((file: File) => file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp'),
  readImageAttachment: vi.fn(async (file: File) => ({
    id: 'mock-id',
    type: 'image' as const,
    name: file.name,
    content: `data:${file.type};base64,FAKE`,
    size: 1,
  })),
}))

vi.mock('../../stores/toast-store', () => ({
  toast: { warn: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn(), fromError: vi.fn() },
}))

import StorageService from '../../services/storageService'
import { useMediaStore } from '../../stores/media-store'
import { ImageTools } from './image-tools'
import { useImageWorkspaceStore } from '../../stores/image-workspace-store'
import { isSupportedImageFile, readImageAttachment } from '../../services/attachmentService'
import { toast } from '../../stores/toast-store'
import type { MediaItem } from '../../types/media'

const mockIsSupportedImageFile = vi.mocked(isSupportedImageFile)
const mockReadImageAttachment = vi.mocked(readImageAttachment)
const mockToastWarn = vi.mocked(toast.warn)
const mockToastFromError = vi.mocked(toast.fromError)

describe('ImageTools → Media Studio wiring (P3 regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mutateMock = vi.fn()
    useImageWorkspaceStore.getState().reset()
    useMediaStore.setState({ items: [], loading: false, loaded: false, lastError: null })
    vi.mocked(StorageService.putMedia).mockImplementation(async (item) => ({
      ...(item as object),
      id: (item as { id: string }).id,
      timestamp: 1,
    }))
    vi.mocked(StorageService.patchMedia).mockImplementation(async (id, patch) => {
      const existing = useMediaStore.getState().items.find((item) => item.id === id)
      if (!existing) throw new Error('not found')
      const patchRecord = typeof patch === 'function' ? (patch as (existing: MediaItem) => Partial<MediaItem>)(existing) : patch
      return { ...existing, ...patchRecord, id } as MediaItem
    })
    mockIsSupportedImageFile.mockImplementation(
      (file: File) => file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp',
    )
    mockReadImageAttachment.mockImplementation(async (file: File) => ({
      id: 'mock-id',
      type: 'image' as const,
      name: file.name,
      content: `data:${file.type};base64,FAKE`,
      size: 1,
    }))
  })

  // VERIFY-020 regression guard: edit/upscale/background-remove result MUST be
  // persisted into the media store as a MediaItem with the correct `operation`
  // and `mediaType: 'image'`. If a future refactor drops the
  // `useMediaStore.getState().upsert(mediaItem)` call, gallery will silently
  // stop surfacing tool results.
  it('persists an edit result to the media store with operation=edit and mediaType=image', async () => {
    render(<ImageTools />)

    // Upload a fake source image through the hidden file input.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    const fakeFile = new File(['a'], 'source.png', { type: 'image/png' })
    Object.defineProperty(fileInput, 'files', { value: [fakeFile], configurable: true })
    await act(async () => {
      fireEvent.change(fileInput)
    })

    // Wait for the async FileReader to resolve and the source image to render.
    await waitFor(() => {
      expect(screen.getByText('source.png')).toBeInTheDocument()
    })

    // Enter an edit prompt.
    const promptArea = screen.getByPlaceholderText(/Change the background/)
    fireEvent.change(promptArea, { target: { value: 'Add a sunset' } })

    // Capture the onSuccess callback that the component passes to mutate().
    let capturedOnSuccess: ((blob: Blob) => void) | null = null
    mutateMock.mockImplementationOnce((_req: unknown, opts?: { onSuccess?: (b: Blob) => void }) => {
      capturedOnSuccess = opts?.onSuccess ?? null
    })

    // Click "Edit Image" to invoke mutate with our request.
    const editBtn = screen.getByRole('button', { name: /Edit Image/ })
    expect((editBtn as HTMLButtonElement).disabled).toBe(false)
    await act(async () => {
      fireEvent.click(editBtn)
    })

    expect(mutateMock).toHaveBeenCalled()
    expect(capturedOnSuccess).toBeTruthy()

    // Fire onSuccess with a fake result blob.
    await act(async () => {
      capturedOnSuccess?.(new Blob(['a'], { type: 'image/png' }))
    })

    // Save button is now visible.
    const saveBtn = await screen.findByText('Save to Media Studio')
    await act(async () => {
      fireEvent.click(saveBtn)
    })

    await waitFor(() => {
      const items = useMediaStore.getState().items
      expect(items).toHaveLength(1)
      const saved = items[0]
      expect(saved.mediaType).toBe('image')
      expect(saved.operation).toBe('edit')
      expect(typeof saved.image).toBe('string')
      expect(saved.image.startsWith('data:image/')).toBe(true)
      expect(saved.tags).toEqual([])
      expect(saved.favorite).toBe(false)
      expect(saved.childrenIds).toEqual([])
      expect(saved.parentId).toBeNull()
    })

    // VERIFY-020 extension (BUG-003 regression guard): the renderer must
    // NOT call `StorageService.saveItem("images", ...)` directly, because
    // the canonical `useMediaStore.upsert()` path already routes through
    // `StorageService.putMedia`. The previous implementation wrote the
    // same record twice (one direct `saveItem` + one through the store
    // upsert) which doubled IDB write amplification and could race on
    // identical ids. After the fix, `putMedia` is called exactly once
    // and the legacy `saveItem` path is not exercised.
    const putCalls = vi.mocked(StorageService.putMedia).mock.calls.length
    expect(putCalls).toBe(1)
    const saveCalls = (vi.mocked(StorageService as unknown as { saveItem: (...args: unknown[]) => unknown }).saveItem as unknown as { mock: { calls: unknown[] } } | undefined)?.mock?.calls?.length ?? 0
    expect(saveCalls).toBe(0)
  })

  it('consumes an upscale handoff and saves a derivative linked to its parent', async () => {
    const parent: MediaItem = {
      id: 'parent-1', image: 'data:image/png;base64,PARENT', prompt: 'parent prompt', model: 'flux-dev',
      timestamp: 1, mediaType: 'image', operation: 'generate', parentId: null, childrenIds: [],
      tags: [], note: '', favorite: false,
    }
    useMediaStore.setState({ items: [parent], totalCount: 1 })
    useImageWorkspaceStore.getState().enqueueTools({
      tool: 'upscale', parentId: parent.id, image: parent.image, prompt: parent.prompt, filename: 'parent.png',
    })

    let capturedOnSuccess: ((blob: Blob) => void) | null = null
    mutateMock.mockImplementationOnce((_req: unknown, opts?: { onSuccess?: (b: Blob) => void }) => {
      capturedOnSuccess = opts?.onSuccess ?? null
    })
    render(<ImageTools />)

    expect(await screen.findByText('parent.png')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Upscale Image/ }))
    await act(async () => capturedOnSuccess?.(new Blob(['upscaled'], { type: 'image/png' })))
    fireEvent.click(await screen.findByText('Save to Media Studio'))

    await waitFor(() => {
      const child = useMediaStore.getState().items.find((item) => item.id !== parent.id)
      expect(child).toMatchObject({ operation: 'upscale', parentId: parent.id })
      expect(useMediaStore.getState().byId(parent.id)?.childrenIds).toEqual([child?.id])
    })
  })

  // P2-007: image-tools source-image upload MUST go through the
  // attachmentService pipeline (MIME validation, size cap, downscale)
  // instead of the raw FileReader.readAsDataURL fallback.
  it('routes image-tools source uploads through attachmentService.readImageAttachment (P2-007)', async () => {
    render(<ImageTools />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const fakeFile = new File(['a'], 'source.png', { type: 'image/png' })
    Object.defineProperty(fileInput, 'files', { value: [fakeFile], configurable: true })

    await act(async () => {
      fireEvent.change(fileInput)
    })

    expect(mockReadImageAttachment).toHaveBeenCalledWith(fakeFile)
    await waitFor(() => {
      expect(screen.getByText('source.png')).toBeInTheDocument()
    })
    // The synthetic data URL produced by the mock is what becomes the source.
    const img = screen.getByAltText('Source') as HTMLImageElement
    expect(img.src).toBe('data:image/png;base64,FAKE')
  })

  it('warns and skips an unsupported image MIME type instead of crashing (P2-007)', async () => {
    render(<ImageTools />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const bmpFile = new File(['a'], 'source.bmp', { type: 'image/bmp' })
    Object.defineProperty(fileInput, 'files', { value: [bmpFile], configurable: true })

    await act(async () => {
      fireEvent.change(fileInput)
    })

    expect(mockIsSupportedImageFile).toHaveBeenCalledWith(bmpFile)
    expect(mockReadImageAttachment).not.toHaveBeenCalled()
    expect(mockToastWarn).toHaveBeenCalledWith(expect.stringContaining('Unsupported image type'))
    // No image rendered because the file was rejected.
    expect(screen.queryByAltText('Source')).toBeNull()
  })

  it('surfaces a toast error when readImageAttachment throws (P2-007)', async () => {
    mockReadImageAttachment.mockRejectedValueOnce(new Error('Downscale failed'))
    render(<ImageTools />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const fakeFile = new File(['a'], 'huge.png', { type: 'image/png' })
    Object.defineProperty(fileInput, 'files', { value: [fakeFile], configurable: true })

    await act(async () => {
      fireEvent.change(fileInput)
    })

    await waitFor(() => {
      expect(mockToastFromError).toHaveBeenCalledWith(expect.any(Error), 'Failed to read image')
    })
    expect(screen.queryByAltText('Source')).toBeNull()
  })
})
