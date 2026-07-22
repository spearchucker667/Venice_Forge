import { useSettingsStore } from '../stores/settings-store';
import { desktopTts, isElectron } from './desktopBridge';
import { DEFAULT_TTS_MODEL } from '../constants/venice';
import { DEFAULT_TTS_VOICE } from '../constants/tts';
import { veniceBlob } from '../lib/venice-client';
import { toast } from '../stores/toast-store';
import { redactErrorMessage } from '../shared/redaction';

export type TtsPlaybackState = 'idle' | 'loading' | 'playing' | 'paused';

class ChatTtsControllerImpl {
  private audio: HTMLAudioElement | null = null;
  private currentMessageId: string | null = null;
  private currentText: string | null = null;
  private state: TtsPlaybackState = 'idle';
  private objectUrl: string | null = null;
  private requestToken = 0;
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
    // Resume if already cached and paused for this message
    if (this.currentMessageId === messageId && this.audio && this.state === 'paused') {
      try {
        await this.audio.play();
        this.state = 'playing';
        this.notify();
      } catch (err) {
        toast.fromError(err, 'TTS playback failed');
        this.stop();
      }
      return;
    }

    this.stop();
    const requestToken = ++this.requestToken;

    if (!text || !text.trim()) {
      toast.warn('No text to speak in this message.');
      return;
    }

    this.currentMessageId = messageId;
    this.currentText = text;
    this.state = 'loading';
    this.notify();

    const prefs = useSettingsStore.getState().audioPreferences?.chatTts;
    const cacheEnabled = prefs?.cacheEnabled ?? true;
    
    let textToRead = text;
    if (prefs?.skipCodeBlocks) {
      textToRead = textToRead.replace(/```[\s\S]*?```/g, '');
    }
    if (prefs?.skipUrls) {
      textToRead = textToRead.replace(/https?:\/\/\S+/gi, '');
    }
    textToRead = textToRead.trim();

    if (!textToRead) {
      toast.warn('No speakable text remaining in message.');
      this.stop();
      return;
    }

    try {
      let sourceUrl: string;

      if (isElectron()) {
        const result = await desktopTts.synthesize(
          {
            text: textToRead,
            model: prefs?.model || DEFAULT_TTS_MODEL,
            voice: prefs?.voice || DEFAULT_TTS_VOICE,
            speed: prefs?.speed || 1.0,
          },
          cacheEnabled
        );

        if (requestToken !== this.requestToken || this.currentMessageId !== messageId) return;
        if (!result.ok || (!result.id && !result.audioBase64)) {
          throw new Error(result.error || 'TTS synthesis failed');
        }

        if (result.audioBase64) {
          const binary = atob(result.audioBase64);
          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
          this.objectUrl = URL.createObjectURL(new Blob([bytes], { type: result.mimeType ?? 'audio/mpeg' }));
          sourceUrl = this.objectUrl;
        } else if (result.id && result.profileId) {
          sourceUrl = `venice-tts://${result.profileId}/${result.id}.mp3`;
        } else {
          throw new Error('TTS playback target missing cache id or profile id.');
        }
      } else {
        // Web mode fallback using veniceBlob
        const blob = await veniceBlob('/audio/speech', {
          model: prefs?.model || DEFAULT_TTS_MODEL,
          input: textToRead,
          voice: prefs?.voice || DEFAULT_TTS_VOICE,
          speed: prefs?.speed || 1.0,
        });

        if (requestToken !== this.requestToken || this.currentMessageId !== messageId) return;
        if (blob.size === 0) {
          throw new Error('Speech provider returned empty audio.');
        }

        this.objectUrl = URL.createObjectURL(blob);
        sourceUrl = this.objectUrl;
      }

      if (requestToken !== this.requestToken || this.currentMessageId !== messageId) {
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
        return;
      }

      const audio = new Audio(sourceUrl);
      this.audio = audio;
      audio.volume = Math.max(0, Math.min(1, prefs?.volume ?? 1.0));
      audio.playbackRate = Math.max(0.25, Math.min(4, prefs?.speed ?? 1.0));

      audio.onended = () => {
        if (this.audio === audio) {
          this.state = 'idle';
          this.currentMessageId = null;
          this.notify();
        }
      };

      audio.onerror = (e) => {
        console.error('TTS playback error', e);
        if (this.audio === audio) {
          toast.error('TTS playback error: unable to load audio element.');
          this.stop();
        }
      };

      audio.onplay = () => {
        if (this.audio === audio) {
          this.state = 'playing';
          this.notify();
        }
      };

      audio.onpause = () => {
        if (this.audio === audio && this.state === 'playing') {
          this.state = 'paused';
          this.notify();
        }
      };

      if (this.state === 'loading' && this.currentMessageId === messageId) {
        await audio.play();
      }
    } catch (err) {
      console.error('TTS error', err);
      toast.error('TTS Failed', redactErrorMessage(err));
      this.stop();
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
    this.requestToken += 1;
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
        this.audio.play().catch((err) => {
          toast.fromError(err, 'TTS restart failed');
        });
      }
    } else {
      this.play(messageId, text);
    }
  }
}

export const chatTtsController = new ChatTtsControllerImpl();
