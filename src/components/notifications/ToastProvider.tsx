import { useToastStore } from '../../stores/toast-store'
import { ToastViewport } from './ToastViewport';
import { ToastItem } from './ToastItem';
import { ProgressToast } from './ProgressToast';

export function ToastProvider() {
  const toasts = useToastStore((state) => state.toasts)

  if (toasts.length === 0) return null;

  return (
    <ToastViewport>
      {toasts.map(toast =>
        toast.variant === 'progress' || toast.progressRatio !== undefined
          ? <ProgressToast key={toast.id} toast={toast} />
          : <ToastItem key={toast.id} toast={toast} />
      )}
    </ToastViewport>
  );
}
