export const toast = {
  success: (message: string) => document.dispatchEvent(new CustomEvent('venice-toast', { detail: { id: Date.now().toString(), type: 'success', message } })),
  error: (message: string) => document.dispatchEvent(new CustomEvent('venice-toast', { detail: { id: Date.now().toString(), type: 'error', message } })),
  fromError: (err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : (err as any)?.message || fallback; // eslint-disable-line @typescript-eslint/no-explicit-any
    document.dispatchEvent(new CustomEvent('venice-toast', { detail: { id: Date.now().toString(), type: 'error', message: msg } }));
  }
};
export const useToastStore = () => ({});
