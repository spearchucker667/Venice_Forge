import React, { useMemo } from "react";
import { ModelInfo } from "../types/venice";
import { Select } from "./ui/select";
import { Meteocon } from "./ui/Meteocon";
import { Trans, useTranslation } from "react-i18next";
import { resolveModelDeprecation } from "../shared/modelCapabilities";
import { formatDate } from "../i18n/formatters";

export function ModelSelect({
  value,
  models,
  onChange,
  id,
  className,
  ariaLabel,
  placeholder,
  getLabel,
}: {
  value: string;
  models: ModelInfo[];
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
  getLabel?: (model: ModelInfo) => string;
}) {
  const { t: tRuntime } = useTranslation("common");

  // Phase 4C.2 — deprecation surfacing. `resolveModelDeprecation` reads the
  // documented Swagger `model_spec.deprecation` object (plus legacy
  // fallback-provider lifecycle fields). Models removed from the catalog
  // entirely simply have no entry here — the selection is never swapped and
  // keeps its current working-or-failing behavior; only a warning layer is
  // added when metadata exists.
  const deprecationById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveModelDeprecation>>();
    for (const m of models || []) {
      const info = resolveModelDeprecation(m);
      if (info) map.set(m.id, info);
    }
    return map;
  }, [models]);

  const selectedDeprecation =
    value != null && value !== ""
      ? (deprecationById.get(value) ?? null)
      : null;

  const options = useMemo(
    () =>
      (models || []).map((m) => {
        const label = getLabel ? getLabel(m) : m.name || m.id;
        const deprecation = deprecationById.get(m.id);
        const sunsetDate = deprecation?.removesAt
          ? formatDate(deprecation.removesAt)
          : "";
        return {
          value: m.id,
          label,
          element: (
            <div className="flex flex-col">
              <div className="flex items-center justify-between">
                <span className="font-medium truncate mr-2">{label}</span>
                <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted shrink-0">
                  {m.contextLength
                    ? tRuntime(
                        "runtimeGenerated.components.modelselect.text.value1K",
                        { value1: Math.round(m.contextLength / 1000) },
                      )
                    : ""}
                  {deprecation && (
                    <span
                      className="bg-warning/20 text-warning px-1 py-0.5 rounded flex items-center gap-1"
                      title={
                        sunsetDate
                          ? tRuntime(
                              "runtimeGenerated.components.modelselect.attribute.deprecatedTitleWithDate",
                              {
                                date: sunsetDate,
                                defaultValue:
                                  "Scheduled for retirement on {{date}}",
                              },
                            )
                          : tRuntime(
                              "runtimeGenerated.components.modelselect.attribute.deprecatedTitle",
                              { defaultValue: "Scheduled for retirement" },
                            )
                      }
                    >
                      <Meteocon name="weather-alarm" size={10} />{" "}
                      {tRuntime(
                        "surface.componentsModelselect.text.deprecated",
                        { defaultValue: "Deprecated" },
                      )}
                    </span>
                  )}
                  {m.fidelity === "high" && (
                    <span
                      className="bg-primary/20 text-primary px-1 py-0.5 rounded flex items-center gap-1"
                      title={tRuntime(
                        "runtimeGenerated.components.modelselect.attribute.highFidelity",
                      )}
                    >
                      <Trans i18nKey="common:surface.componentsModelselect.text.highFidelity" />
                    </span>
                  )}
                  {m.fidelity === "standard" && (
                    <span
                      className="bg-vf-panel-bg-inset text-text-muted px-1 py-0.5 rounded flex items-center gap-1"
                      title={tRuntime(
                        "runtimeGenerated.components.modelselect.attribute.standardFidelity",
                      )}
                    >
                      <Trans i18nKey="common:surface.componentsModelselect.text.standard" />
                    </span>
                  )}
                  {m.privacy?.mode === "anonymous" && (
                    <span
                      className="bg-success/20 text-success px-1 py-0.5 rounded flex items-center gap-1"
                      title={tRuntime(
                        "runtimeGenerated.components.modelselect.attribute.anonymousInference",
                      )}
                    >
                      <Meteocon name="umbrella" size={10} />{" "}
                      <Trans i18nKey="common:surface.componentsModelselect.text.anon" />
                    </span>
                  )}
                  {(m.privacy?.mode === "private" ||
                    m.privacy?.privateInference) && (
                    <span
                      className="bg-accent/20 text-accent px-1 py-0.5 rounded flex items-center gap-1"
                      title={tRuntime(
                        "runtimeGenerated.components.modelselect.attribute.privateInference",
                      )}
                    >
                      <Meteocon name="umbrella" size={10} />{" "}
                      <Trans i18nKey="common:surface.componentsModelselect.text.private" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          ),
        };
      }),
    [models, getLabel, tRuntime, deprecationById],
  );

  const selectedSunsetDate = selectedDeprecation?.removesAt
    ? formatDate(selectedDeprecation.removesAt)
    : "";

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <Select
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        searchable
        className={className || "w-full"}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
      />
      {selectedDeprecation && (
        <div
          className="vf-meta text-warning leading-snug"
          role="status"
          data-testid="model-select-deprecation-warning"
        >
          <span>
            {selectedSunsetDate
              ? tRuntime(
                  "surface.componentsModelselect.text.deprecatedWarningWithDate",
                  {
                    date: selectedSunsetDate,
                    defaultValue:
                      "This model is scheduled for retirement on {{date}}. It may stop working after that date.",
                  },
                )
              : tRuntime("surface.componentsModelselect.text.deprecatedWarning", {
                  defaultValue:
                    "This model is scheduled for retirement. It may stop working without further notice.",
                })}
          </span>
          {selectedDeprecation.replacementModelId && (
            <span className="block">
              {tRuntime(
                "surface.componentsModelselect.text.deprecatedReplacement",
                {
                  model: selectedDeprecation.replacementModelId,
                  defaultValue: "Suggested replacement: {{model}}.",
                },
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
