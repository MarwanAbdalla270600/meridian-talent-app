import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  /** Transloco key or already translated text. */
  key: string;
  params?: Record<string, unknown>;
  requestId?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(kind: Toast['kind'], key: string, params?: Record<string, unknown>, requestId?: string) {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, kind, key, params, requestId }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 8000 : 3500);
  }
  success = (key: string, params?: Record<string, unknown>) => this.show('success', key, params);
  info = (key: string, params?: Record<string, unknown>) => this.show('info', key, params);
  dismiss(id: number) {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
