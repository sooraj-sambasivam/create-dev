import { create } from "zustand";

export interface ToastItem {
  id: number;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, ms?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
const TOAST_MS = 2600;
/** At most this many toasts show at once; the oldest is dropped first. */
const MAX_TOASTS = 3;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, ms = TOAST_MS) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message }].slice(-MAX_TOASTS) }));
    if (typeof window !== "undefined") window.setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Show a short confirmation ("Link copied"). Safe to call from anywhere. */
export const toast = (message: string, ms?: number): void => useToasts.getState().push(message, ms);
