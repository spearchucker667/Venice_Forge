import { translateRuntime } from "../i18n/runtimeTranslator";
import { useSettingsStore } from "../stores/settings-store";
import { desktopTts, isElectron } from "./desktopBridge";
import { resolvePlayableMediaUrl } from "./playableMediaUrl";
import { DEFAULT_TTS_MODEL } from "../constants/venice";
import { DEFAULT_TTS_VOICE } from "../constants/tts";
import { veniceBlob } from "../lib/venice-client";
import { toast } from "../stores/toast-store";
import { redactErrorMessage } from "../shared/redaction";
import {
  type SpeechFailureCode,
  type SpeechResult,
  mapHttpStatusToFailureCode,
  speechResultFail,
  speechResultOk,
} from "../shared/ttsContract";
import { serializeError, serializeErrorToString } from "../shared/serializeError";

export type TtsPlaybackState = "idle" | "loading" | "playing" | "paused";

class ChatTtsControllerImpl {
  private audio: HTMLAudioElement | null = null;
  private currentMessageId: string | null = null;
  private currentText: string | null = null;
  private state: TtsPlaybackState = "idle";
  private objectUrl: string | null = null;
  private requestToken = 0;
  private subscribers = new Set<
    (state: TtsPlaybackState, messageId: string | null) => void
  >();

  public subscribe(
    callback: (state: TtsPlaybackState, messageId: string | null) => void,
  ) {
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

  public async play(messageId: string, text: string, options?: { isAutoRead?: boolean }) {
    // Resume if already cached and paused for this message
    if (
      this.currentMessageId === messageId &&
      this.audio &&
      this.state === "paused"
    ) {
      try {
        await this.audio.play();
        this.state = "playing";
        this.notify();
      } catch (err) {
        if (!options?.isAutoRead) {
          toast.fromError(
            err,
            translateRuntime(
              "runtimeGenerated.services.chatttscontroller.notification.ttsPlaybackFailed",
              "TTS playback failed",
            ),
          );
        } else {
          console.error("Auto-read TTS playback failed", err);
        }
        this.stop();
      }
      return;
    }

    this.stop();
    const requestToken = ++this.requestToken;

    if (!text || !text.trim()) {
      if (!options?.isAutoRead) {
        toast.warn(
          translateRuntime(
            "runtimeGenerated.services.chatttscontroller.notification.noTextToSpeakInThisMessage",
            "No text to speak in this message.",
          ),
        );
      }
      return;
    }

    this.currentMessageId = messageId;
    this.currentText = text;
    this.state = "loading";
    this.notify();

    const prefs = useSettingsStore.getState().audioPreferences?.chatTts;
    const cacheEnabled = prefs?.cacheEnabled ?? true;

    let textToRead = text;
    if (prefs?.skipCodeBlocks) {
      textToRead = textToRead.replace(/```[\s\S]*?```/g, "");
    }
    if (prefs?.skipUrls) {
      textToRead = textToRead.replace(/https?:\/\/\S+/gi, "");
    }
    textToRead = textToRead.trim();

    if (!textToRead) {
      if (!options?.isAutoRead) {
        toast.warn(
          translateRuntime(
            "runtimeGenerated.services.chatttscontroller.notification.noSpeakableTextRemainingInMessage",
            "No speakable text remaining in message.",
          ),
        );
      }
      this.stop();
      return;
    }

    try {
      let speech: SpeechResult;

      if (isElectron()) {
        const result = await desktopTts.synthesize(
          {
            text: textToRead,
            model: prefs?.model || DEFAULT_TTS_MODEL,
            voice: prefs?.voice || DEFAULT_TTS_VOICE,
            speed: prefs?.speed || 1.0,
          },
          cacheEnabled,
        );

        if (
          requestToken !== this.requestToken ||
          this.currentMessageId !== messageId
        )
          return;

        if (!result.ok) {
          speech = speechResultFail(
            mapHttpStatusToFailureCode(result.status),
            result.error || "TTS synthesis failed",
            { status: result.status, providerCode: result.providerCode },
          );
        } else if (result.audioBase64) {
          try {
            const binary = atob(result.audioBase64);
            const bytes = Uint8Array.from(binary, (character) =>
              character.charCodeAt(0),
            );
            if (bytes.byteLength === 0) {
              const fail = speechResultFail("EMPTY_AUDIO", "Speech provider returned empty audio.");
              this.handleSpeechFailure(fail, options);
              return;
            }
            this.objectUrl = URL.createObjectURL(
              new Blob([bytes], { type: result.mimeType ?? "audio/mpeg" }),
            );
            speech = speechResultOk({
              sourceUrl: this.objectUrl,
              mimeType: result.mimeType ?? "audio/mpeg",
              bytes: bytes.byteLength,
              cached: result.cacheMode === "disk" || result.cacheMode === "memory",
              profileId: result.profileId,
              cacheId: result.id,
            });
          } catch (decodeErr) {
            const fail = speechResultFail(
              "INVALID_AUDIO",
              "Speech provider returned bytes that could not be decoded as audio.",
            );
            console.error("TTS audio decode error", serializeError(decodeErr));
            this.handleSpeechFailure(fail, options);
            return;
          }
        } else if (result.id && result.profileId) {
          try {
            const sourceUrl = await resolvePlayableMediaUrl(
              `venice-tts://${result.profileId}/${result.id}.mp3`,
            );
            speech = speechResultOk({
              sourceUrl,
              mimeType: "audio/mpeg",
              bytes: 0, // bytes are unknown when reading from cache via protocol handler
              cached: true,
              profileId: result.profileId,
              cacheId: result.id,
            });
          } catch (resolveErr) {
            const fail = speechResultFail("CACHE_ERROR", "Could not resolve cached TTS audio.");
            console.error("TTS cache resolve error", serializeError(resolveErr));
            this.handleSpeechFailure(fail, options);
            return;
          }
        } else {
          const fail = speechResultFail(
            "INVALID_RESPONSE",
            "TTS playback target missing cache id or profile id.",
          );
          this.handleSpeechFailure(fail, options);
          return;
        }
      } else {
        // Web mode fallback using veniceBlob
        try {
          const blob = await veniceBlob("/audio/speech", {
            model: prefs?.model || DEFAULT_TTS_MODEL,
            input: textToRead,
            voice: prefs?.voice || DEFAULT_TTS_VOICE,
            speed: prefs?.speed || 1.0,
          });

          if (
            requestToken !== this.requestToken ||
            this.currentMessageId !== messageId
          )
            return;
          if (blob.size === 0) {
            const fail = speechResultFail("EMPTY_AUDIO", "Speech provider returned empty audio.");
            this.handleSpeechFailure(fail, options);
            return;
          }

          this.objectUrl = URL.createObjectURL(blob);
          speech = speechResultOk({
            sourceUrl: this.objectUrl,
            mimeType: blob.type || "audio/mpeg",
            bytes: blob.size,
            cached: false,
          });
        } catch (webErr) {
          const fail = speechResultFail(
            "NETWORK_ERROR",
            webErr instanceof Error ? webErr.message : "Web TTS request failed.",
          );
          console.error("Web TTS error", serializeError(webErr));
          this.handleSpeechFailure(fail, options);
          return;
        }
      }

      if (!speech.ok) {
        this.handleSpeechFailure(speech, options);
        return;
      }

      const sourceUrl = speech.sourceUrl;
      if (
        requestToken !== this.requestToken ||
        this.currentMessageId !== messageId
      ) {
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
          this.state = "idle";
          this.currentMessageId = null;
          this.notify();
        }
      };

      audio.onerror = (e) => {
        console.error("TTS playback error", serializeError(e), serializeErrorToString(e));
        if (this.audio === audio) {
          if (!options?.isAutoRead) {
            toast.error(
              translateRuntime(
                "runtimeGenerated.services.chatttscontroller.notification.ttsPlaybackErrorUnableToLoadAudioElement",
                "TTS playback error: unable to load audio element.",
              ),
            );
          }
          this.stop();
        }
      };

      audio.onplay = () => {
        if (this.audio === audio) {
          this.state = "playing";
          this.notify();
        }
      };

      audio.onpause = () => {
        if (this.audio === audio && this.state === "playing") {
          this.state = "paused";
          this.notify();
        }
      };

      if (this.state === "loading" && this.currentMessageId === messageId) {
        await audio.play();
      }
    } catch (err) {
      console.error("TTS error", serializeError(err), serializeErrorToString(err));
      if (!options?.isAutoRead) {
        toast.error(
          translateRuntime(
            "runtimeGenerated.services.chatttscontroller.notification.ttsFailed",
            "TTS Failed",
          ),
          redactErrorMessage(err),
        );
      }
      this.stop();
    }
  }

  /**
   * Centralized failure dispatch for the typed SpeechResult contract. Maps a
   * discriminated-union failure to a user-visible toast (or quiet console
   * log for auto-read) without conflating provider HTTP errors, billing
   * blocks, invalid audio bytes, and browser playback errors.
   */
  private handleSpeechFailure(
    failure: Extract<SpeechResult, { ok: false }>,
    options: { isAutoRead?: boolean } | undefined,
  ): void {
    const headline = translateRuntime(
      "runtimeGenerated.services.chatttscontroller.notification.ttsFailed",
      "TTS Failed",
    );
    if (options?.isAutoRead) {
      console.error("Auto-read TTS failure", failure.failure);
      this.stop();
      return;
    }
    toast.error(headline, failure.failure.message);
    this.stop();
  }

  public pause() {
    if (this.audio && this.state === "playing") {
      this.audio.pause();
      this.state = "paused";
      this.notify();
    }
  }

  public stop() {
    this.requestToken += 1;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.currentMessageId = null;
    this.currentText = null;
    this.state = "idle";
    this.notify();
  }

  public restart(messageId: string, text: string) {
    if (this.currentMessageId === messageId && this.audio) {
      this.audio.currentTime = 0;
      if (this.state !== "playing") {
        this.audio.play().catch((err) => {
          toast.fromError(
            err,
            translateRuntime(
              "runtimeGenerated.services.chatttscontroller.notification.ttsRestartFailed",
              "TTS restart failed",
            ),
          );
        });
      }
    } else {
      this.play(messageId, text);
    }
  }
}

export const chatTtsController = new ChatTtsControllerImpl();
