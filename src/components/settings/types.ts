/** Shared types for the settings panel split. */

/** Shape of a pending confirmation shown in the shared ConfirmModal. */
export type PendingConfirm = {
  message: string;
  detail?: string;
  onConfirm: () => Promise<void> | void;
};
