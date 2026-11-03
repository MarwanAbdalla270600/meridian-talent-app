import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-toasts',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-5 z-[1100] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
      role="status"
    >
      @for (t of toast.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex max-w-xl items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg"
          [class.bg-ink]="t.kind !== 'error'"
          [class.bg-danger]="t.kind === 'error'"
          [attr.role]="t.kind === 'error' ? 'alert' : null"
        >
          <span>{{ t.key | transloco: t.params }}</span>
          @if (t.requestId) {
            <span class="text-xs opacity-75"
              >({{ 'common.requestId' | transloco }}: {{ t.requestId.slice(0, 8) }})</span
            >
          }
          <button
            type="button"
            class="ml-2 opacity-80 hover:opacity-100"
            (click)="toast.dismiss(t.id)"
            [attr.aria-label]="'common.close' | transloco"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  protected readonly toast = inject(ToastService);
}
