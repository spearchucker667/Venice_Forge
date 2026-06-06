import { useCallback, useEffect, useState } from 'react'
import StorageService from '../../services/storageService'
import type { GalleryImage } from '../../types/storage'
import { downloadImage } from '../../utils/download'
import { galleryFilename } from '../../utils/image'
import { toast } from '../../stores/toast-store'

function imageSource(item: GalleryImage): string {
  if (item.image.startsWith('data:') || item.image.startsWith('blob:') || item.image.startsWith('http')) {
    return item.image
  }
  return `data:image/png;base64,${item.image}`
}

export function GalleryView() {
  const [items, setItems] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GalleryImage | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await StorageService.getItems<GalleryImage>('images'))
    } catch (error) {
      toast.error('Library failed to load', error instanceof Error ? error.message : 'Unknown storage error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const remove = async (item: GalleryImage) => {
    await StorageService.deleteItem('images', item.id)
    setItems((current) => current.filter((candidate) => candidate.id !== item.id))
    if (selected?.id === item.id) setSelected(null)
    toast.success('Image removed from Library')
  }

  const download = async (item: GalleryImage) => {
    const result = await downloadImage(imageSource(item), galleryFilename(item))
    if (!result.confirmed) toast.error('Image download was not completed')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary">Library</h2>
          <p className="mt-0.5 text-[12.5px] text-text-muted">Generated images saved on this device.</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="grid h-full place-items-center text-[13px] text-text-muted">Loading Library...</div>
        ) : items.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-[15px] font-medium text-text-primary">No generated images yet</p>
              <p className="mt-1 text-[12.5px] text-text-muted">Images generated in Image Studio will appear here automatically.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <article key={item.id} className="group overflow-hidden rounded-xl border border-border bg-surface-elevated">
                <button type="button" onClick={() => setSelected(item)} className="block aspect-square w-full overflow-hidden bg-surface">
                  <img src={imageSource(item)} alt={item.prompt || 'Generated image'} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
                </button>
                <div className="space-y-2 p-3">
                  <p className="line-clamp-2 text-[12px] text-text-primary">{item.prompt || 'Untitled image'}</p>
                  <p className="truncate text-[10.5px] text-text-muted">{item.model}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void download(item)} className="flex-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent">Download</button>
                    <button type="button" onClick={() => void remove(item)} className="rounded-md border border-danger/30 px-2 py-1 text-[11px] text-danger hover:bg-danger/10">Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <button type="button" aria-label="Close image preview" onClick={() => setSelected(null)} className="fixed inset-0 z-50 grid place-items-center bg-overlay p-6 backdrop-blur-sm">
          <img src={imageSource(selected)} alt={selected.prompt || 'Generated image preview'} className="max-h-[88vh] max-w-[92vw] rounded-xl border border-border object-contain shadow-2xl" />
        </button>
      )}
    </div>
  )
}
