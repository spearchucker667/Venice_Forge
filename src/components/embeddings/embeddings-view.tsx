import { useId, useState } from "react";
import { useSettingsStore } from "../../stores/settings-store";
import { useModels } from "../../hooks/use-models";
import { selectHasVeniceKey, useAuthStore } from "../../stores/auth-store";
import { useEmbeddings } from "../../hooks/use-embeddings";
import {
  Label,
  TextArea,
  PrimaryButton,
  ErrorText,
  EmptyState,
  ExamplePrompts,
} from "../ui/shared";
import { GenerationView } from "../ui/generation-view";
import { getPromptStartersForCategory } from "../../services/promptStarterService";
import { redactErrorMessage } from "../../shared/redaction";
import { copyText } from "../../stores/media-send-to";
import { Trans, useTranslation } from "react-i18next";

const PREVIEW_COUNT = 100;

export function EmbeddingsView() {
  const { t: tRuntime } = useTranslation("common");
  const inputId = useId();
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  const selectedModel = useSettingsStore((s) => s.selectedModels.embeddings);
  const { data: models } = useModels("embedding");
  const model = selectedModel || models?.[0]?.id || "bge-m3";

  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [starters, setStarters] = useState(() =>
    getPromptStartersForCategory("embeddings", 3),
  );
  const mutation = useEmbeddings();
  const data = mutation.data;

  const embedding = data?.data[0]?.embedding;
  const dims = embedding?.length ?? 0;
  const displayValues = expanded
    ? embedding
    : embedding?.slice(0, PREVIEW_COUNT);

  const handleCopyVector = () => {
    if (embedding) void copyText(JSON.stringify(embedding));
  };

  const controls = (
    <>
      <div>
        <Label htmlFor={inputId}>
          <Trans i18nKey="common:surface.componentsEmbeddingsEmbeddingsView.text.inputText" />
        </Label>
        <TextArea
          id={inputId}
          value={input}
          onChange={setInput}
          placeholder={tRuntime(
            "runtimeGenerated.components.embeddings.embeddingsView.attribute.enterTextToEmbed",
          )}
          rows={6}
        />
      </div>
      <PrimaryButton
        onClick={() => {
          mutation.mutate({ model, input: input.trim() });
          setExpanded(false);
        }}
        disabled={!input.trim() || !hasVeniceKey}
        loading={mutation.isPending}
        size="lg"
      >
        <Trans i18nKey="common:surface.componentsEmbeddingsEmbeddingsView.text.generateEmbeddings" />
      </PrimaryButton>
      {mutation.error && (
        <ErrorText>{redactErrorMessage(mutation.error)}</ErrorText>
      )}
    </>
  );

  const output = (
    <div className="flex flex-col h-full">
      {!data && !input ? (
        <div className="flex items-center justify-center h-full">
          <ExamplePrompts
            items={starters}
            onPick={setInput}
            onShuffle={() =>
              setStarters(getPromptStartersForCategory("embeddings", 3))
            }
          />
        </div>
      ) : data ? (
        <div className="animate-fade-in flex flex-col gap-4">
          <div className="flex items-center gap-6 text-[14px]">
            <Stat
              label={tRuntime(
                "runtimeGenerated.components.embeddings.embeddingsView.attribute.model",
              )}
              value={data.model}
            />
            <Stat
              label={tRuntime(
                "runtimeGenerated.components.embeddings.embeddingsView.attribute.dimensions",
              )}
              value={String(dims)}
            />
            <Stat
              label={tRuntime(
                "runtimeGenerated.components.embeddings.embeddingsView.attribute.tokens",
              )}
              value={String(data.usage.prompt_tokens)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>
                <Trans i18nKey="common:surface.componentsEmbeddingsEmbeddingsView.text.vector" />
                {dims}{" "}
                <Trans i18nKey="common:surface.componentsEmbeddingsEmbeddingsView.text.dimensions" />
              </Label>
              <button
                onClick={handleCopyVector}
                className="text-[13px] text-text-muted hover:text-text-muted transition-colors"
              >
                <Trans i18nKey="common:surface.componentsEmbeddingsEmbeddingsView.action.copy" />
              </button>
            </div>
            <div className="bg-vf-panel-bg-raised border border-vf-panel-border rounded-md p-4 max-h-[calc(100vh-240px)] overflow-y-auto">
              <code className="text-[14px] text-text-muted font-mono break-all leading-loose">
                [
                {displayValues?.map((n, i) => (
                  <span key={i}>
                    <span className="text-text-secondary">{n.toFixed(6)}</span>
                    {i < displayValues.length - 1 && (
                      <span className="text-text-muted">, </span>
                    )}
                  </span>
                ))}
                {!expanded && dims > PREVIEW_COUNT && (
                  <span className="text-text-muted">, ...</span>
                )}
                ]
              </code>
            </div>
            {dims > PREVIEW_COUNT && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[13px] text-text-muted hover:text-text-muted mt-2 transition-colors"
              >
                {expanded
                  ? tRuntime(
                      "runtimeGenerated.components.embeddings.embeddingsView.text.showFirstPreviewCount",
                      { PREVIEW_COUNT: PREVIEW_COUNT },
                    )
                  : tRuntime(
                      "runtimeGenerated.components.embeddings.embeddingsView.text.showAllDimsValues",
                      { dims: dims },
                    )}
              </button>
            )}
          </div>
        </div>
      ) : (
        <EmptyState>
          <Trans i18nKey="common:surface.componentsEmbeddingsEmbeddingsView.text.embeddingVectorsAppearHere" />
        </EmptyState>
      )}
    </div>
  );

  return <GenerationView controls={controls} output={output} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-secondary bg-vf-panel-bg-raised border border-vf-panel-border rounded px-2 py-0.5 font-mono text-[13px]">
        {value}
      </span>
    </div>
  );
}
