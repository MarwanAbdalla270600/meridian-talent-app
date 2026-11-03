import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Action, Locale } from '@meridian/shared';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { IconComponent } from '../../shared/ui/icon.component';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  perm: Action;
}

const MAIN: NavItem[] = [
  { path: '/developers', label: 'nav.developers', icon: 'users', perm: 'developer:list' },
  { path: '/requests', label: 'nav.requests', icon: 'brief', perm: 'request:read' },
  { path: '/clients', label: 'nav.clients', icon: 'building', perm: 'client:read' },
  { path: '/import', label: 'nav.import', icon: 'upload', perm: 'import:cv' },
];
const ADMIN: NavItem[] = [
  { path: '/admin/skills', label: 'nav.skills', icon: 'tag', perm: 'skill:manage' },
  { path: '/admin/users', label: 'nav.users', icon: 'shield', perm: 'user:manage' },
  { path: '/admin/audit', label: 'nav.audit', icon: 'list', perm: 'audit:read' },
  { path: '/admin/settings', label: 'nav.settings', icon: 'settings', perm: 'settings:manage' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:p-2"
      >{{ 'common.skipToContent' | transloco }}</a
    >
    <div class="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside
        class="bg-nav text-slate-300 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:p-4"
      >
        <div class="flex items-center justify-between p-3 lg:mb-4 lg:p-2">
          <a
            routerLink="/developers"
            class="flex items-center gap-2.5 text-base font-bold text-white"
          >
            <img src="/brand/logo.svg" alt="" width="28" height="28" />{{ 'app.name' | transloco }}
          </a>
          <button
            type="button"
            class="rounded-lg p-2 text-white lg:hidden"
            (click)="menuOpen.set(!menuOpen())"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="side-nav"
          >
            {{ 'common.menu' | transloco }}
          </button>
        </div>
        <div
          id="side-nav"
          class="flex-1 flex-col gap-1 px-3 pb-4 lg:flex lg:px-0"
          [class.hidden]="!menuOpen()"
          [class.flex]="menuOpen()"
        >
          <nav class="grid gap-1" [attr.aria-label]="'nav.main' | transloco">
            @for (item of main(); track item.path) {
              <a
                [routerLink]="item.path"
                routerLinkActive="!bg-brand/25 !text-white"
                class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white/10 hover:text-white"
                (click)="menuOpen.set(false)"
              >
                <app-icon [name]="item.icon" />{{ item.label | transloco }}
              </a>
            }
          </nav>
          @if (admin().length) {
            <p class="mt-5 mb-1 px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              {{ 'nav.admin' | transloco }}
            </p>
            <nav class="grid gap-1" [attr.aria-label]="'nav.admin' | transloco">
              @for (item of admin(); track item.path) {
                <a
                  [routerLink]="item.path"
                  routerLinkActive="!bg-brand/25 !text-white"
                  class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white/10 hover:text-white"
                  (click)="menuOpen.set(false)"
                >
                  <app-icon [name]="item.icon" />{{ item.label | transloco }}
                </a>
              }
            </nav>
          }
          <div class="mt-auto pt-6">
            <div
              class="mb-3 flex rounded-lg bg-white/10 p-1"
              role="group"
              [attr.aria-label]="'nav.language' | transloco"
            >
              @for (l of langs; track l) {
                <button
                  type="button"
                  class="flex-1 rounded-md py-1.5 text-xs font-semibold"
                  [class.bg-white]="locale.lang() === l"
                  [class.text-nav]="locale.lang() === l"
                  [attr.aria-pressed]="locale.lang() === l"
                  (click)="setLang(l)"
                >
                  {{ l.toUpperCase() }}
                </button>
              }
            </div>
            <a
              routerLink="/account"
              routerLinkActive="!text-white"
              class="block rounded-xl px-3 py-2 text-sm hover:bg-white/10"
            >
              <span class="block font-semibold text-white">{{ auth.me()?.displayName }}</span>
              <span class="text-xs">{{ 'roles.' + auth.me()?.role | transloco }}</span>
            </a>
            <button
              type="button"
              class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-white/10 hover:text-white"
              (click)="auth.logout()"
            >
              <app-icon name="logout" />{{ 'nav.logout' | transloco }}
            </button>
          </div>
        </div>
      </aside>
      <main id="main" tabindex="-1" class="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 lg:py-8">
        <router-outlet />
      </main>
    </div>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(ApiService);
  protected readonly menuOpen = signal(false);
  protected readonly langs = ['de', 'en'] as const;
  protected readonly main = computed(() =>
    this.auth.me() ? MAIN.filter((i) => this.auth.can(i.perm)) : [],
  );
  protected readonly admin = computed(() =>
    this.auth.me() ? ADMIN.filter((i) => this.auth.can(i.perm)) : [],
  );

  async setLang(l: Locale) {
    this.locale.set(l);
    try {
      this.auth.setMe(await this.api.updateMe(l));
    } catch {
      /* the local switch already applied */
    }
  }
}
