import { useSettingsStore } from '../stores/settings-store';
import { isElectron } from './desktopBridge';
import { uiSoundController } from './uiSoundController';

export type TtsPlaybackState = 'idle' | 'loading' | 'playing' | 'paused';

class ChatTtsControllerImpl {
  private audio: HTMLAudioElement | null = null;
  private currentMessageId: string | null = null;
  private currentText: string | null = null;
  private state: TtsPlaybackState = 'idle';
  private objectUrl: string | null = null;
  private subscribers = new Set<(state: TtsPlaybackState, messageId: string | null) => void>();

  public subscribe(callback: (state: TtsPlaybackState, messageId: string | null) => void) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    this.subscribers.forEach((cb) => cb(this.state, this.currentMessageId));
  }

  public getState() {
    return this.state;
  }

  public getCurrentMessageId() {
    return this.currentMessageId;
  }

  public async play(messageId: string, text: string) {
    // Determine if we need to synthesize or just resume
    if (this.currentMessageId === messageId && this.audio && this.state === 'paused') {
      this.audio.play();
      this.state = 'playing';
      this.notify();
      return;
    }

    this.stop();
    
    // We only support TTS on desktop right now due to API key security constraints
    if (!isElectron()) return;

    this.currentMessageId = messageId;
    this.currentText = text;
    this.state = 'loading';
    this.notify();

    const prefs = useSettingsStore.getState().audioPreferences?.chatTts;
    const cacheEnabled = prefs?.cacheEnabled ?? true;
    
    let textToRead = text;
    if (prefs?.skipCodeBlocks) {
      // Very basic regex to strip markdown code blocks
      textToRead = text.replace(/```[\s\S]*?```/g, ' [Code block skipped] ');
    }

    try {
      const result = await window.veniceForge!.tts.synthesize(
        {
          text: textToRead,
          model: prefs?.model,
          voice: prefs?.voice,
          speed: prefs?.speed,
        },
        cacheEnabled
      );

      if (!result.ok || !result.id) {
        throw new Error(result.error || 'TTS Synthesis failed');
      }

      this.audio = new Audio(`venice-tts://${result.id}`);
      this.audio.volume = prefs?.volume ?? 1.0;
      this.audio.playbackRate = prefs?.speed ?? 1.0;

      this.audio.onended = () => {
        this.state = 'idle';
        this.currentMessageId = null;
        this.notify();
      };

      this.audio.onerror = (e) => {
        console.error('TTS playback error', e);
        this.state = 'idle';
        this.currentMessageId = null;
        this.notify();
      };

      this.audio.onplay = () => {
        this.state = 'playing';
        this.notify();
      };

      this.audio.onpause = () => {
        if (this.state === 'playing') {
          this.state = 'paused';
          this.notify();
        }
      };

      if (this.state === 'loading' && this.currentMessageId === messageId) {
        await this.audio.play();
      }
    } catch (err) {
      console.error('TTS error', err);
      this.state = 'idle';
      this.currentMessageId = null;
      this.notify();
    }
  }

  public pause() {
    if (this.audio && this.state === 'playing') {
      this.audio.pause();
      this.state = 'paused';
      this.notify();
    }
  }

  public stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.currentMessageId = null;
    this.currentText = null;
    this.state = 'idle';
    this.notify();
  }

  public restart(messageId: string, text: string) {
    if (this.currentMessageId === messageId && this.audio) {
      this.audio.currentTime = 0;
      if (this.state !== 'playing') {
        this.audio.play();
      }
    } else {
      this.play(messageId, text);
    }
  }
}

export const chatTtsController = new ChatTtsControllerImpl();
