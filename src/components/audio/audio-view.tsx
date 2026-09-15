import { useState, useRef, useId, useEffect } from "react";
import { useSettingsStore } from "../../stores/settings-store";
import { GenerationLoadingIndicator } from "../generation/GenerationLoadingIndicator";
import { useModels } from "../../hooks/use-models";
import { selectHasVeniceKey, useAuthStore } from "../../stores/auth-store";
import { useTTS, useTranscription } from "../../hooks/use-audio";
import { useBlobUrl } from "../../hooks/use-blob-url";
import { Select } from "../ui/select";
import {
  Label,
  TextArea,
  PrimaryButton,
  ErrorText,
  EmptyState,
  ExamplePrompts,
} from "../ui/shared";
import { GenerationView } from "../ui/generation-view";
import { cn } from "../../lib/utils";
import { toast } from "../../stores/toast-store";
import { getPromptStartersForCategory } from "../../services/promptStarterService";
import { redactErrorMessage } from "../../shared/redaction";
import { DEFAULT_TTS_MODEL } from "../../constants/venice";
import { DEFAULT_TTS_VOICE, TTS_FALLBACK_VOICES } from "../../constants/tts";
import { Trans, useTranslation } from "react-i18next";
import { desktopMedia } from "../../services/desktopBridge";

const FORMATS = ["mp3", "opus", "aac", "flac", "wav"] as const;
const MIME_BY_FORMAT: Record<string, string> = {
  mp3: "audio/mpeg",
  opus: "audio/opus",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
};

export function AudioView() {
  const { t: tRuntime } = useTranslation("common");
  const textId = useId();
  const voiceId = useId();
  const formatId = useId();
  const speedId = useId();
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  const selectedModel = useSettingsStore((s) => s.selectedModels.audio);
  const { data: models } = useModels("tts");
  const model = selectedModel || models?.[0]?.id || DEFAULT_TTS_MODEL;

  const [tab, setTab] = useState<"tts" | "transcribe">("tts");
  const [text, setText] = useState("");
  const [starters, setStarters] = useState(() =>
    getPromptStartersForCategory("audio", 3),
  );
  const [voice, setVoice] = useState(DEFAULT_TTS_VOICE);
  const [speed, setSpeed] = useState(1);
  const [format, setFormat] = useState<string>("mp3");
  const [audioUrl, setAudioBlob] = useBlobUrl();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const tts = useTTS();
  const transcription = useTranscription();

  const handleSaveAudio = async () => {
    if (!audioUrl) return;
    const result = await desktopMedia.saveMediaAs({
      source: audioUrl,
      mimeType: MIME_BY_FORMAT[format],
      suggestedName: `venice-speech.${format}`,
    });
    if (result.status === "saved") toast.success(tRuntime("mediaSave.success"));
    if (result.status === "failed") toast.error(tRuntime("mediaSave.failed"), result.error);
  };

  useEffect(() => {
    if (!audioUrl) setPlaybackError(null);
  }, [audioUrl]);

  const selectedModelVoices = models?.find(
    (candidate) => candidate.id === model,
  )?.model_spec?.voices;
  const voices = selectedModelVoices?.length
    ? selectedModelVoices
    : TTS_FALLBACK_VOICES;
  const voiceOptions = voices.map((v: string) => {
    const prefix = v.slice(0, 2);
    const langMap: Record<
      string,
      { flag: string; gender: string; lang: string }
    > = {
      af: { flag: "🇺🇸", gender: "F", lang: "American English (Female)" },
      am: { flag: "🇺🇸", gender: "M", lang: "American English (Male)" },
      bf: { flag: "🇬🇧", gender: "F", lang: "British English (Female)" },
      bm: { flag: "🇬🇧", gender: "M", lang: "British English (Male)" },
      zf: { flag: "🇨🇳", gender: "F", lang: "Mandarin (Female)" },
      zm: { flag: "🇨🇳", gender: "M", lang: "Mandarin (Male)" },
      jf: { flag: "🇯🇵", gender: "F", lang: "Japanese (Female)" },
      jm: { flag: "🇯🇵", gender: "M", lang: "Japanese (Male)" },
      ff: { flag: "🇫🇷", gender: "F", lang: "French (Female)" },
      hf: { flag: "🇮🇳", gender: "F", lang: "Hindi (Female)" },
      hm: { flag: "🇮🇳", gender: "M", lang: "Hindi (Male)" },
      if: { flag: "🇮🇹", gender: "F", lang: "Italian (Female)" },
      im: { flag: "🇮🇹", gender: "M", lang: "Italian (Male)" },
      pf: { flag: "🇧🇷", gender: "F", lang: "Portuguese (Female)" },
      pm: { flag: "🇧🇷", gender: "M", lang: "Portuguese (Male)" },
      ef: { flag: "🇪🇸", gender: "F", lang: "Spanish (Female)" },
      em: { flag: "🇪🇸", gender: "M", lang: "Spanish (Male)" },
    };
    const meta = langMap[prefix];
    const name = v.slice(3);
    const display = meta
      ? `${meta.flag} ${meta.gender} · ${name} (${meta.lang})`
      : v;
    return { value: v, label: display };
  });
  const formatOptions = FORMATS.map((f) => ({
    value: f,
    label: f.toUpperCase(),
  }));

  const handleTTS = () => {
    if (!text.trim()) return;
    setPlaybackError(null);
    setAudioBlob(null);
    tts.mutate(
      {
        model,
        input: text.trim(),
        voice,
        speed,
        response_format: format as (typeof FORMATS)[number],
      },
      {
        onSuccess: (blob) => setAudioBlob(blob),
        onError: (err) =>
          toast.fromError(
            err,
            tRuntime(
              "runtimeGenerated.components.audio.audioView.notification.ttsFailed",
            ),
          ),
      },
    );
  };

  const controls = (
    <>
      <div className="flex gap-px bg-vf-panel-bg-raised rounded-md p-0.5 border border-vf-panel-border">
        {(["tts", "transcribe"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cn(
              "flex-1 px-3 py-2 text-[13px] font-medium rounded-[7px] transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              tab === t
                ? "bg-accent text-accent-fg shadow-sm shadow-[0_0_8px_var(--color-vf-accent-glow)]"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {t === "tts"
              ? tRuntime(
                  "runtimeGenerated.components.audio.audioView.text.textToSpeech",
                )
              : tRuntime(
                  "runtimeGenerated.components.audio.audioView.text.transcribe",
                )}
          </button>
        ))}
      </div>

      {tab === "tts" ? (
        <>
          <div>
            <Label htmlFor={textId}>
              <Trans i18nKey="common:surface.componentsAudioAudioView.text.text" />
            </Label>
            <TextArea
              id={textId}
              value={text}
              onChange={setText}
              placeholder={tRuntime(
                "runtimeGenerated.components.audio.audioView.attribute.enterTextToConvertToSpeech",
              )}
              rows={5}
            />
          </div>
          <div>
            <Label htmlFor={voiceId}>
              <Trans i18nKey="common:surface.componentsAudioAudioView.text.voice" />
            </Label>
            <Select
              id={voiceId}
              value={voice}
              onChange={setVoice}
              options={voiceOptions}
              searchable
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={formatId}>
                <Trans i18nKey="common:surface.componentsAudioAudioView.text.format" />
              </Label>
              <Select
                id={formatId}
                value={format}
                onChange={setFormat}
                options={formatOptions}
              />
            </div>
            <div>
              <Label htmlFor={speedId}>
                <Trans i18nKey="common:surface.componentsAudioAudioView.text.speed" />
              </Label>
              <input
                id={speedId}
                type="range"
                min={0.25}
                max={4}
                step={0.25}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
          <PrimaryButton
            onClick={handleTTS}
            disabled={!text.trim() || !hasVeniceKey}
            loading={tts.isPending}
            size="lg"
          >
            <Trans i18nKey="common:surface.componentsAudioAudioView.text.generateSpeech" />
          </PrimaryButton>
          {tts.error && <ErrorText>{redactErrorMessage(tts.error)}</ErrorText>}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border border-dashed border-vf-panel-border hover:border-accent hover:bg-vf-panel-bg-muted rounded-md p-8 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="mx-auto mb-2 text-text-muted"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            <p className="text-[14px] text-text-secondary">
              {file
                ? file.name
                : tRuntime(
                    "runtimeGenerated.components.audio.audioView.text.clickToSelectAudioFile",
                  )}
            </p>
          </button>
          <PrimaryButton
            onClick={() => {
              if (file)
                transcription.mutate(file, {
                  onSuccess: (d) => setTranscript(d.text),
                  onError: (err) =>
                    toast.fromError(
                      err,
                      tRuntime(
                        "runtimeGenerated.components.audio.audioView.notification.transcriptionFailed",
                      ),
                    ),
                });
            }}
            disabled={!file || !hasVeniceKey}
            loading={transcription.isPending}
            size="lg"
          >
            <Trans i18nKey="common:surface.componentsAudioAudioView.text.transcribe" />
          </PrimaryButton>
          {transcription.error && (
            <ErrorText>{redactErrorMessage(transcription.error)}</ErrorText>
          )}
        </>
      )}
    </>
  );

  const output = (
    <div className="flex flex-col min-h-full">
      {tab === "tts" ? (
        audioUrl ? (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <Label>
                <Trans i18nKey="common:surface.componentsAudioAudioView.text.output" />
              </Label>
              <button
                type="button"
                onClick={() => void handleSaveAudio()}
                className="text-[14px] text-text-muted hover:text-text-muted transition-colors flex items-center gap-1.5"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                <Trans i18nKey="common:surface.componentsAudioAudioView.text.download" />
              </button>
            </div>
            <audio
              controls
              src={audioUrl}
              className="w-full"
              onError={(e) => {
                const target = e.currentTarget;
                const code = target.error?.code;
                // MediaError constants: MEDIA_ERR_SRC_NOT_SUPPORTED = 4, MEDIA_ERR_DECODE = 3
                if (code === 4) {
                  setPlaybackError(
                    "This audio format is not supported by your browser.",
                  );
                } else if (code === 3) {
                  setPlaybackError(
                    "Failed to decode audio. The file may be corrupted.",
                  );
                } else {
                  setPlaybackError(
                    "Failed to play audio. Please try downloading it.",
                  );
                }
              }}
            />
            {playbackError && <ErrorText>{playbackError}</ErrorText>}
            <div className="bg-vf-panel-bg-raised border border-vf-panel-border rounded-md p-4">
              <p className="text-[15px] text-text-muted leading-relaxed">
                {text}
              </p>
            </div>
          </div>
        ) : tts.isPending ? (
          <div className="flex items-center justify-center h-full min-h-[300px]">
            <GenerationLoadingIndicator
              state="generating"
              label={tRuntime(
                "runtimeGenerated.components.audio.audioView.attribute.synthesizingSpeech",
              )}
            />
          </div>
        ) : !text ? (
          <div className="flex items-center justify-center h-full">
            <ExamplePrompts
              items={starters}
              onPick={setText}
              onShuffle={() =>
                setStarters(getPromptStartersForCategory("audio", 3))
              }
            />
          </div>
        ) : (
          <EmptyState>
            <Trans i18nKey="common:surface.componentsAudioAudioView.text.pressGenerateToSynthesizeSpeech" />
          </EmptyState>
        )
      ) : transcript ? (
        <div className="flex flex-col gap-3 animate-fade-in">
          <Label>
            <Trans i18nKey="common:surface.componentsAudioAudioView.text.transcript" />
          </Label>
          <div className="bg-vf-panel-bg border border-vf-panel-border rounded-md p-6 text-[15px] text-text-secondary whitespace-pre-wrap leading-relaxed">
            {transcript}
          </div>
        </div>
      ) : transcription.isPending ? (
        <div className="flex items-center justify-center h-full min-h-[300px]">
          <GenerationLoadingIndicator
            state="processing"
            label={tRuntime(
              "runtimeGenerated.components.audio.audioView.attribute.transcribingAudio",
            )}
          />
        </div>
      ) : (
        <EmptyState>
          <Trans i18nKey="common:surface.componentsAudioAudioView.text.transcriptAppearsHere" />
        </EmptyState>
      )}
    </div>
  );

  return <GenerationView controls={controls} output={output} />;
}
