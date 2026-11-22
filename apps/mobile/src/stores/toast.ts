import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastState {
  message: string | null;
  tone: 'error' | 'info';
  action: ToastAction | null;
  durationMs: number;
  /** bumps on every show so a repeated message restarts its timer */
  id: number;
  show: (message: string, opts?: { tone?: 'error' | 'info'; action?: ToastAction; durationMs?: number }) => void;
  clear: () => void;
}

export const useToast = create<ToastState>((set, get) => ({
  message: null,
  tone: 'error',
  action: null,
  durationMs: 8000,
  id: 0,
  show: (message, opts = {}) =>
    set({ message, tone: opts.tone ?? 'error', action: opts.action ?? null, durationMs: opts.durationMs ?? 8000, id: get().id + 1 }),
  clear: () => set({ message: null, action: null }),
}));

export const showError = (e: unknown) =>
  useToast.getState().show(e instanceof Error ? e.message : 'Something went wrong');
