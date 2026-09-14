import { cn } from "../../lib/utils";
import { Spinner } from "./spinner";
import { RefreshCw } from "lucide-react";
import { uiSoundController } from "../../services/uiSoundController";
import { Trans, useTranslation } from "react-i18next";
import type { PromptStarter } from "../../data/promptStarters";

export function Label({
  children,
  htmlFor,
  hint,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[12px] font-semibold text-foreground-muted uppercase tracking-[0.08em]"
      >
        {children}
      </label>
      {hint && (
        <span className="text-[12px] text-foreground-subtle">{hint}</span>
      )}
    </div>
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  ariaLabel,
  maxLength,
  autoFocus,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
  maxLength?: number;
  autoFocus?: boolean;
  id?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      aria-label={ariaLabel}
      maxLength={maxLength}
      autoFocus={autoFocus}
      className="w-full min-w-0 max-w-full overflow-x-hidden break-words whitespace-pre-wrap bg-input-bg border border-border rounded-lg px-3 py-2.5 text-[15px] text-input-fg outline-none focus:border-border-strong transition-colors resize-none placeholder:text-placeholder leading-relaxed"
    />
  );
}

export function PrimaryButton({
  onClick,
  disabled,
  loading,
  children,
  ariaLabel,
  size = "md",
  className,
  fullWidth = true,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  ariaLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /**
   * Defaults to `true` to preserve the historical full-width behaviour for
   * standalone call-to-action buttons (e.g. form submits, modal footers).
   * Set to `false` when the button is placed inside a flex row alongside
   * other content so it sizes to its label instead of stretching the row.
   */
  fullWidth?: boolean;
}) {
  const sizing =
    size === "sm"
      ? "px-3 py-1.5 text-[13px] min-w-[72px]"
      : size === "lg"
        ? "px-5 py-2.5 text-[15px] min-w-[96px]"
        : "px-4 py-2 text-[14px] min-w-[80px]";
  return (
    <button
      type="button"
      onClick={() => {
        uiSoundController.play("primaryClick");
        onClick();
      }}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={cn(
        "rounded-lg font-medium vf-control-motion focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2",
        fullWidth && "w-full",
        sizing,
        !disabled && !loading
          ? "bg-button-primary-bg text-button-primary-fg hover:bg-accent-hover shadow-sm"
          : "bg-surface-muted text-disabled-fg cursor-not-allowed",
        className,
      )}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <Spinner className="text-disabled-fg" />{" "}
          <Trans i18nKey="common:surface.componentsUiShared.text.working" />
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function GhostButton({
  onClick,
  children,
  disabled,
  ariaLabel,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        uiSoundController.play("secondaryClick");
        onClick();
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "px-3 py-1.5 text-[13px] font-medium rounded-lg border border-border bg-button-secondary-bg text-button-secondary-fg hover:border-border-strong hover:bg-surface-muted transition-colors disabled:text-disabled-fg disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2",
      )}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  onClick,
  disabled,
  children,
  ariaLabel,
  size = "md",
  className,
  fullWidth = false,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  ariaLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  fullWidth?: boolean;
}) {
  const sizing =
    size === "sm"
      ? "px-3 py-1.5 text-[13px] min-w-[72px]"
      : size === "lg"
        ? "px-5 py-2.5 text-[15px] min-w-[96px]"
        : "px-4 py-2 text-[14px] min-w-[80px]";
  return (
    <button
      type="button"
      onClick={() => {
        uiSoundController.play("secondaryClick");
        onClick();
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "rounded-lg font-medium border border-border bg-button-secondary-bg text-button-secondary-fg hover:border-border-strong hover:bg-surface-muted vf-control-motion disabled:text-disabled-fg disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2",
        fullWidth && "w-full",
        sizing,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  onClick,
  disabled,
  children,
  ariaLabel,
  size = "md",
  className,
  fullWidth = false,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  ariaLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  fullWidth?: boolean;
}) {
  const sizing =
    size === "sm"
      ? "px-3 py-1.5 text-[13px] min-w-[72px]"
      : size === "lg"
        ? "px-5 py-2.5 text-[15px] min-w-[96px]"
        : "px-4 py-2 text-[14px] min-w-[80px]";
  return (
    <button
      type="button"
      onClick={() => {
        uiSoundController.play("secondaryClick");
        onClick();
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "rounded-lg font-medium border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 hover:border-danger vf-control-motion disabled:text-disabled-fg disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2",
        fullWidth && "w-full",
        sizing,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PillGroup({
  options,
  value,
  onChange,
  ariaLabel,
  labelledBy,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  labelledBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      className="flex flex-wrap gap-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => {
            uiSoundController.play("secondaryClick");
            onChange(o.value);
          }}
          className={cn(
            "text-[13px] font-medium px-2.5 py-1 rounded-md border vf-control-motion focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus-ring",
            o.value === value
              ? "border-border-strong bg-surface-muted text-foreground shadow-sm"
              : "border-border text-foreground-muted hover:text-foreground hover:border-border-strong hover:bg-surface-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 text-[13px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="shrink-0 mt-px"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center flex-1 text-text-muted text-[14px]">
      {children}
    </div>
  );
}

export function ExamplePrompts({
  items,
  onPick,
  title,
  onShuffle,
}: {
  items: PromptStarter[];
  onPick: (text: string) => void;
  title?: string;
  onShuffle?: () => void;
}) {
  const { t } = useTranslation("common");
  const resolvedTitle =
    title ?? t("surface.componentsChatChatView.text.tryOneOfThese");
  return (
    <div className="w-full max-w-md flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[12px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          {resolvedTitle}
        </div>
        {onShuffle && (
          <button
            type="button"
            onClick={() => {
              uiSoundController.play("secondaryClick");
              onShuffle();
            }}
            className="text-[12px] text-[var(--color-accent)] hover:opacity-85 flex items-center gap-1 cursor-pointer transition-opacity"
            title={t("surface.componentsUiShared.action.shuffle")}
          >
            <RefreshCw className="w-3 h-3 animate-hover-spin" />
            <Trans i18nKey="common:surface.componentsUiShared.action.shuffle" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((starter) => {
          const text = t(starter.translationKey, {
            defaultValue: starter.fallbackPrompt,
          });
          return (
            <button
              key={starter.id}
              type="button"
              onClick={() => {
                uiSoundController.play("secondaryClick");
                onPick(text);
              }}
              className="group text-left px-3.5 py-3 rounded-xl border border-border/60 bg-surface-muted hover:border-border-strong hover:bg-surface-elevated vf-control-motion text-[13.5px] text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
            >
              <span className="flex items-start gap-2">
                <span className="text-text-muted/50 group-hover:text-[var(--color-accent)] transition-colors mt-px">
                  →
                </span>
                <span className="leading-relaxed">{text}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mesh-card rounded-xl", className)}>{children}</div>
  );
}

export function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="text-[12px] uppercase tracking-[0.08em] text-text-muted font-semibold">
        {children}
      </h3>
      {action}
    </div>
  );
}

const TONE: Record<string, string> = {
  emerald: "bg-success/15 text-success border-success/30",
  success: "bg-success/15 text-success border-success/30",
  sky: "bg-accent/15 text-accent border-accent/30",
  accent: "bg-accent/15 text-accent border-accent/30",
  violet: "bg-accent/15 text-accent border-accent/30",
  amber: "bg-warning/15 text-warning border-warning/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  pink: "bg-danger/15 text-danger border-danger/30",
  rose: "bg-danger/15 text-danger border-danger/30",
  danger: "bg-danger/15 text-danger border-danger/30",
  slate: "bg-surface-muted text-text-secondary border-border",
  neutral: "bg-surface-muted text-text-secondary border-border",
  teal: "bg-accent/15 text-accent border-accent/30",
};

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[12px] px-1.5 py-px rounded font-medium uppercase tracking-wider border",
        TONE[tone] ?? TONE.slate,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({
  tone = "slate",
  pulsing,
}: {
  tone?:
    | "emerald"
    | "amber"
    | "rose"
    | "slate"
    | "teal"
    | "success"
    | "warning"
    | "danger"
    | "accent";
  pulsing?: boolean;
}) {
  const color =
    tone === "emerald" || tone === "success"
      ? "bg-success"
      : tone === "amber" || tone === "warning"
        ? "bg-warning"
        : tone === "rose" || tone === "danger"
          ? "bg-danger"
          : tone === "teal" || tone === "accent"
            ? "bg-accent"
            : "bg-text-muted/40";
  return (
    <span
      className={cn(
        "inline-block w-1.5 h-1.5 rounded-full",
        color,
        pulsing && "animate-pulse-dot",
      )}
    />
  );
}
