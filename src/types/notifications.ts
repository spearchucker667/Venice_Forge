export type ToastSeverity =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading";

export interface AppToastAction {
  id: string;
  label: string;
  action: () => void | Promise<void>;
  dismissAfterAction?: boolean;
}

export interface AppToast {
  id: string;
  title: string;
  message?: string;
  severity: ToastSeverity;
  createdAt: number;
  durationMs?: number | null;
  dismissible?: boolean;
  dedupeKey?: string;
  progress?: number;
  jobId?: string;
  requestId?: string;
  actions?: AppToastAction[];
}
