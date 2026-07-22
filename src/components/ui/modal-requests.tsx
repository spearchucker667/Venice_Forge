import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { uiSoundController } from "../../services/uiSoundController";

type TextRequestOptions = {
  title: string;
  detail?: string;
  initialValue?: string;
  placeholder?: string;
  actionLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null;
};

type DecisionRequestOptions = {
  title: string;
  detail?: string;
  actionLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type SecretRequestOptions = {
  title: string;
  detail?: string;
  placeholder?: string;
  actionLabel?: string;
  cancelLabel?: string;
  confirm?: boolean;
  minLength?: number;
  autocomplete?: "current-password" | "new-password";
};

type ModalRequest =
  | {
      id: number;
      kind: "secret";
      options: SecretRequestOptions;
      resolve: (value: string | null) => void;
    }
  | {
      id: number;
      kind: "text";
      options: TextRequestOptions;
      resolve: (value: string | null) => void;
    }
  | {
      id: number;
      kind: "decision";
      options: DecisionRequestOptions;
      resolve: (value: boolean) => void;
    };

let nextRequestId = 1;
let activeListener: ((request: ModalRequest) => void) | null = null;

export function askText(options: TextRequestOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const listener = activeListener;
    if (!listener) {
      resolve(null);
      return;
    }
    listener({ id: nextRequestId++, kind: "text", options, resolve });
  });
}

export function askDecision(options: DecisionRequestOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const listener = activeListener;
    if (!listener) {
      resolve(false);
      return;
    }
    listener({ id: nextRequestId++, kind: "decision", options, resolve });
  });
}

export function askSecret(options: SecretRequestOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const listener = activeListener;
    if (!listener) {
      resolve(null);
      return;
    }
    listener({ id: nextRequestId++, kind: "secret", options, resolve });
  });
}

export function ModalRequestHost() {
  const [request, setRequest] = useState<ModalRequest | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [revealSecret, setRevealSecret] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusTrap(dialogRef, request !== null, () => cancelRequest(), inputRef);

  useEffect(() => {
    activeListener = (nextRequest) => setRequest(nextRequest);
    return () => {
      activeListener = null;
    };
  }, []);

  useEffect(() => {
    if (request?.kind === "text" || request?.kind === "secret") {
      setValue(request.kind === "text" ? request.options.initialValue ?? "" : "");
      setConfirmation("");
      setRevealSecret(false);
      setError(null);
    }
  }, [request]);

  if (!request) return null;

  function closeRequest() {
    setRequest(null);
    setValue("");
    setConfirmation("");
    setRevealSecret(false);
    setError(null);
  }

  function cancelRequest() {
    if (!request) return;
    uiSoundController.play('secondaryClick')
    if (request.kind === "text" || request.kind === "secret") request.resolve(null);
    else request.resolve(false);
    closeRequest();
  }

  function acceptRequest() {
    if (!request) return;
    uiSoundController.play('primaryClick')
    if (request.kind === "text") {
      const validationError = request.options.validate?.(value) ?? null;
      if (validationError) {
        setError(validationError);
        return;
      }
      request.resolve(value);
    } else if (request.kind === "secret") {
      const minLength = request.options.minLength ?? 8;
      if (value.length < minLength) {
        setError(`Passphrase must be at least ${minLength} characters long.`);
        return;
      }
      if (request.options.confirm && value !== confirmation) {
        setError("Passphrases do not match.");
        return;
      }
      request.resolve(value);
    } else {
      request.resolve(true);
    }
    closeRequest();
  }

  const title = request.options.title;
  const detail = request.options.detail;
  const actionLabel =
    request.kind === "text"
      ? request.options.actionLabel ?? "Save"
      : request.kind === "secret"
      ? request.options.actionLabel ?? "Continue"
      : request.options.actionLabel ?? "Continue";
  const cancelLabel = request.options.cancelLabel ?? "Cancel";
  const actionTone = request.kind === "decision" && request.options.danger ? "danger" : "primary";

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-overlay/80 p-6"
      onClick={cancelRequest}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl focus:outline-none"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-request-title"
        aria-describedby={detail ? "modal-request-detail" : undefined}
      >
        <h2 id="modal-request-title" className="mb-2 text-lg font-display font-semibold text-text-primary">
          {title}
        </h2>
        {detail && (
          <p id="modal-request-detail" className="mb-5 text-sm leading-relaxed text-text-secondary">
            {detail}
          </p>
        )}
        {(request.kind === "text" || request.kind === "secret") && (
          <div className="mb-5">
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => {
                setValue(event.currentTarget.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  acceptRequest();
                }
              }}
              placeholder={request.options.placeholder}
              type={request.kind === "secret" && !revealSecret ? "password" : "text"}
              autoComplete={request.kind === "secret" ? request.options.autocomplete ?? "current-password" : undefined}
              className="input w-full"
              aria-label={title}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "modal-request-error" : undefined}
            />
            {request.kind === "secret" && request.options.confirm && (
              <input
                value={confirmation}
                onChange={(event) => {
                  setConfirmation(event.currentTarget.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    acceptRequest();
                  }
                }}
                type={revealSecret ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Confirm passphrase"
                className="input mt-3 w-full"
                aria-label={`${title} confirmation`}
                aria-invalid={error ? "true" : "false"}
              />
            )}
            {request.kind === "secret" && (
              <button
                type="button"
                className="mt-2 text-xs text-text-secondary hover:text-text-primary"
                onClick={() => setRevealSecret((current) => !current)}
              >
                {revealSecret ? "Hide passphrase" : "Show passphrase"}
              </button>
            )}
            {error && (
              <p id="modal-request-error" className="mt-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="btn" onClick={cancelRequest}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${actionTone}`} onClick={acceptRequest}>
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
