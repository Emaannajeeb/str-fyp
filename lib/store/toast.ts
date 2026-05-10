'use client';

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

let toastIdCounter = 0;

interface ToastStore {
  toasts: Toast[];
  showToast: (type: ToastType, message: string, duration?: number) => string;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number) => string;
  error: (message: string, duration?: number) => string;
  info: (message: string, duration?: number) => string;
  warning: (message: string, duration?: number) => string;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  showToast: (type, message, duration = 5000) => {
    const id = `toast-${toastIdCounter++}`;
    const toast: Toast = { id, type, message, duration };

    set((state) => ({ toasts: [...state.toasts, toast] }));

    // Auto-remove after duration
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);

    return id;
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  success: (message, duration) => {
    return get().showToast('success', message, duration);
  },
  error: (message, duration) => {
    return get().showToast('error', message, duration);
  },
  info: (message, duration) => {
    return get().showToast('info', message, duration);
  },
  warning: (message, duration) => {
    return get().showToast('warning', message, duration);
  },
}));

