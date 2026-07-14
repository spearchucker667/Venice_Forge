import { useSettingsStore, type UiSoundPackId } from '../stores/settings-store'
import type { AudioPreferences } from '../stores/settings-store'

export type UiSoundEvent =
  | 'primaryClick'
  | 'secondaryClick'
  | 'toggleOn'
  | 'toggleOff'

export interface UiSoundPackManifest {
  id: UiSoundPackId
  name: string
  assets: Record<UiSoundEvent, string>
  gain?: Partial<Record<UiSoundEvent, number>>
}

const UI_SOUND_PACKS: Record<UiSoundPackId, UiSoundPackManifest> = {
  soft: {
    id: 'soft',
    name: 'Soft',
    assets: {
      primaryClick: '/audio/ui/soft/primary-click.ogg',
      secondaryClick: '/audio/ui/soft/secondary-click.ogg',
      toggleOn: '/audio/ui/soft/toggle-on.ogg',
      toggleOff: '/audio/ui/soft/toggle-off.ogg',
    },
  },
  tactile: {
    id: 'tactile',
    name: 'Tactile',
    assets: {
      primaryClick: '/audio/ui/tactile/primary-click.ogg',
      secondaryClick: '/audio/ui/tactile/secondary-click.ogg',
      toggleOn: '/audio/ui/tactile/toggle-on.ogg',
      toggleOff: '/audio/ui/tactile/toggle-off.ogg',
    },
  },
  glass: {
    id: 'glass',
    name: 'Glass',
    assets: {
      primaryClick: '/audio/ui/glass/primary-click.ogg',
      secondaryClick: '/audio/ui/glass/secondary-click.ogg',
      toggleOn: '/audio/ui/glass/toggle-on.ogg',
      toggleOff: '/audio/ui/glass/toggle-off.ogg',
    },
  },
  retro: {
    id: 'retro',
    name: 'Retro',
    assets: {
      primaryClick: '/audio/ui/retro/primary-click.ogg',
      secondaryClick: '/audio/ui/retro/secondary-click.ogg',
      toggleOn: '/audio/ui/retro/toggle-on.ogg',
      toggleOff: '/audio/ui/retro/toggle-off.ogg',
    },
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    assets: {
      primaryClick: '/audio/ui/minimal/primary-click.ogg',
      secondaryClick: '/audio/ui/minimal/secondary-click.ogg',
      toggleOn: '/audio/ui/minimal/toggle-on.ogg',
      toggleOff: '/audio/ui/minimal/toggle-off.ogg',
    },
  },
}

class UiSoundControllerImpl {
  private audioContext: AudioContext | null = null
  private buffers = new Map<string, AudioBuffer>()
  private loadPromises = new Map<string, Promise<AudioBuffer>>()
  private activePack: UiSoundPackId = 'soft'
  private enabled: boolean = false
  private volume: number = 0.35
  private lastPlayTimes = new Map<UiSoundEvent, number>()

  // Rate limiting to prevent distortion when clicking rapidly
  private readonly RATE_LIMIT_MS = 50

  public initialize() {
    // We defer AudioContext creation until a user interaction to respect browser autoplay policies,
    // or when explicitly requested via `play()` if they have already interacted.
    useSettingsStore.subscribe((state) => {
      this.applyPreferences(state.audioPreferences)
    })
    
    const prefs = useSettingsStore.getState().audioPreferences
    this.applyPreferences(prefs)
  }

  public applyPreferences(prefs: AudioPreferences | undefined) {
    if (!prefs || !prefs.uiSounds) return
    this.enabled = prefs.uiSounds.enabled
    this.volume = Math.max(0, Math.min(1, prefs.uiSounds.volume))
    
    if (this.activePack !== prefs.uiSounds.packId) {
      this.activePack = prefs.uiSounds.packId
      if (this.enabled) {
        this.preloadPack(this.activePack)
      }
    }
  }

  private getAudioContext(): AudioContext | null {
    if (!this.enabled) return null
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      } catch (e) {
        console.warn('Failed to initialize AudioContext for UI sounds', e)
        return null
      }
    }
    
    if (this.audioContext.state === 'suspended') {
      // Browsers suspend audio context if not created during user gesture.
      // We will try to resume it, but it might only succeed if triggered by an event.
      this.audioContext.resume().catch(() => {
        // Ignore resume errors, it will be retried on next play
      })
    }
    return this.audioContext
  }

  public async preloadPack(packId: UiSoundPackId): Promise<void> {
    const pack = UI_SOUND_PACKS[packId]
    if (!pack) return
    
    const ctx = this.getAudioContext()
    if (!ctx) return

    const loadTasks = Object.values(pack.assets).map((url) => this.loadAsset(ctx, url))
    await Promise.allSettled(loadTasks)
  }

  private async loadAsset(ctx: AudioContext, url: string): Promise<AudioBuffer> {
    if (this.buffers.has(url)) {
      return this.buffers.get(url)!
    }
    
    if (this.loadPromises.has(url)) {
      return this.loadPromises.get(url)!
    }

    const promise = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch audio: ${res.statusText}`)
        return res.arrayBuffer()
      })
      .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        this.buffers.set(url, audioBuffer)
        this.loadPromises.delete(url)
        return audioBuffer
      })
      .catch((err) => {
        this.loadPromises.delete(url)
        console.warn(`Failed to load UI sound asset ${url}:`, err)
        throw err
      })

    this.loadPromises.set(url, promise)
    return promise
  }

  public play(event: UiSoundEvent, forcePack?: UiSoundPackId): void {
    if (!this.enabled && !forcePack) return
    
    const now = Date.now()
    const lastTime = this.lastPlayTimes.get(event) || 0
    if (now - lastTime < this.RATE_LIMIT_MS) {
      return
    }
    this.lastPlayTimes.set(event, now)

    const packId = forcePack || this.activePack
    const pack = UI_SOUND_PACKS[packId]
    if (!pack) return

    const url = pack.assets[event]
    if (!url) return

    const ctx = this.getAudioContext()
    if (!ctx) return

    // If buffer is already loaded, play it immediately.
    // If not, we don't await because UI sounds should be fire-and-forget
    // and we don't want to play a sound 500ms after the click if it was loading.
    const buffer = this.buffers.get(url)
    if (buffer) {
      this.playBuffer(ctx, buffer, pack.gain?.[event])
    } else {
      this.loadAsset(ctx, url).then((buf) => {
        // Only play if it loaded fast enough (e.g. < 200ms since click)
        if (Date.now() - now < 200) {
          this.playBuffer(ctx, buf, pack.gain?.[event])
        }
      }).catch(() => {
        // Missing assets are non-fatal
      })
    }
  }

  private playBuffer(ctx: AudioContext, buffer: AudioBuffer, gainMult: number = 1.0) {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    try {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      
      const gainNode = ctx.createGain()
      gainNode.gain.value = this.volume * gainMult
      
      source.connect(gainNode)
      gainNode.connect(ctx.destination)
      source.start(0)
    } catch (e) {
      // Non-fatal
      console.warn('Failed to play UI sound', e)
    }
  }

  private previewTimeout: ReturnType<typeof setTimeout> | null = null

  public async preview(packId: UiSoundPackId): Promise<void> {
    this.stopPreview()
    await this.preloadPack(packId)
    
    // Play a short sequence to demonstrate the pack
    // Force play even if enabled=false, because user explicitly clicked Preview
    this.play('primaryClick', packId)
    
    this.previewTimeout = setTimeout(() => {
      this.play('toggleOn', packId)
    }, 400)
  }

  public stopPreview(): void {
    if (this.previewTimeout) {
      clearTimeout(this.previewTimeout)
      this.previewTimeout = null
    }
  }

  public dispose(): void {
    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
    this.buffers.clear()
  }
}

export const uiSoundController = new UiSoundControllerImpl()

/** Hook for generic components to trigger sounds */
export function useUiSound() {
  return (event: UiSoundEvent) => {
    uiSoundController.play(event)
  }
}
