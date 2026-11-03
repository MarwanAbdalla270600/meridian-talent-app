import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { DeveloperStatus } from '@meridian/shared';

/** Phase 1 (Egypt) → Phase 2 (Austria review) → client-ready. */
@Component({
  selector: 'app-phase-indicator',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ol class="grid gap-2 sm:grid-cols-3" [attr.aria-label]="'phase.label' | transloco">
    @for (p of phases(); track p.key) {
      <li
        class="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        [class.bg-ok-light]="p.state === 'done'"
        [class.text-ok]="p.state === 'done'"
        [class.bg-brand]="p.state === 'current'"
        [class.text-white]="p.state === 'current'"
        [class.bg-slate-200]="p.state === 'todo'"
        [class.text-muted]="p.state === 'todo'"
        [attr.aria-current]="p.state === 'current' ? 'step' : null"
      >
        <span aria-hidden="true">{{ p.state === 'done' ? '✓' : p.n }}</span>
        {{ 'phase.' + p.key | transloco }}
      </li>
    }
  </ol>`,
})
export class PhaseIndicatorComponent {
  readonly status = input.required<DeveloperStatus>();
  protected readonly phases = computed(() => {
    const s = this.status();
    return [
      { key: 'p1', n: '1', state: s === 'P1_IN_ERFASSUNG' ? 'current' : 'done' },
      {
        key: 'p2',
        n: '2',
        state: s === 'P1_EINGEREICHT' ? 'current' : s === 'P2_FREIGEGEBEN' ? 'done' : 'todo',
      },
      { key: 'ready', n: '3', state: s === 'P2_FREIGEGEBEN' ? 'done' : 'todo' },
    ] as const;
  });
}
