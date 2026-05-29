import React, { useEffect } from "react";
import { AppState, AppDispatch, ToastMessage } from "../types/app";

export function ToastHost({ state, dispatch }: { state: AppState; dispatch: AppDispatch }) {
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2">
      {state.toasts?.map((toast) => (
        <ToastItem key={toast.id} toast={toast} dispatch={dispatch} />
      ))}
    </div>
  );
}

const toastStyles: Record<string, string> = {
  error: "border-red-500/30 bg-red-500/20 text-red-100 shadow-[0_8px_24px_rgba(239,68,68,0.2)]",
  success: "border-emerald-500/30 bg-emerald-500/20 text-emerald-100 shadow-[0_8px_24px_rgba(16,185,129,0.2)]",
  info: "border-white/10 bg-zinc-800/80 text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.3)]",
};

function ToastItem({ toast, dispatch }: { toast: ToastMessage; dispatch: AppDispatch }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: "REMOVE_TOAST", id: toast.id });
    }, toast.duration || 3000);
    return () => clearTimeout(timer);
  }, [toast, dispatch]);

  const live = toast.type === "error" ? "assertive" : "polite";
  const role = toast.type === "error" ? "alert" : "status";
  const toneClass = toastStyles[toast.type] || toastStyles.info;

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm font-medium backdrop-blur-xl animate-[slideUp_0.3s_ease] ${toneClass}`}
      role={role}
      aria-live={live}
    >
      {toast.message}
    </div>
  );
}
