import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleService } from '../../core/i18n/locale.service';

/** Centered card layout for unauthenticated pages, with language switch. */
@Component({
  selector: 'app-auth-frame',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="grid min-h-screen place-items-center bg-nav px-4 py-10">
      <div class="w-full max-w-md">
        <div class="mb-6 flex items-center justify-between text-white">
          <div class="flex items-center gap-3 text-lg font-bold">
            <img src="/brand/logo.svg" alt="" width="32" height="32" />
            {{ 'app.name' | transloco }}
          </div>
          <div
            class="flex rounded-lg bg-white/10 p-1"
            role="group"
            [attr.aria-label]="'nav.language' | transloco"
          >
            @for (l of langs; track l) {
              <button
                type="button"
                class="rounded-md px-3 py-1 text-xs font-semibold"
                [class.bg-white]="locale.lang() === l"
                [class.text-nav]="locale.lang() === l"
                [attr.aria-pressed]="locale.lang() === l"
                (click)="locale.set(l)"
              >
                {{ l.toUpperCase() }}
              </button>
            }
          </div>
        </div>
        <div class="card p-8 shadow-xl"><ng-content /></div>
        <p class="mt-4 text-center text-xs text-slate-300">{{ 'app.internal' | transloco }}</p>
      </div>
    </main>
  `,
})
export class AuthFrameComponent {
  protected readonly locale = inject(LocaleService);
  protected readonly langs = ['de', 'en'] as const;
}
