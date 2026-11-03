import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ROLES, type Role, type User } from '@meridian/shared';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-users-page',
  imports: [FormsModule, TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6">
      <h1>{{ 'admin.users.title' | transloco }}</h1>
      <p class="text-muted">{{ 'admin.users.subtitle' | transloco }}</p>
    </header>
    <form
      class="card mb-5 grid items-end gap-3 md:grid-cols-[1.3fr_1fr_1fr_110px_auto]"
      (ngSubmit)="create()"
    >
      <div>
        <label class="label" for="u-e">{{ 'admin.users.email' | transloco }}</label>
        <input
          id="u-e"
          name="email"
          type="email"
          class="input"
          required
          [(ngModel)]="draft.email"
        />
      </div>
      <div>
        <label class="label" for="u-n">{{ 'admin.users.displayName' | transloco }}</label>
        <input id="u-n" name="name" class="input" required [(ngModel)]="draft.displayName" />
      </div>
      <div>
        <label class="label" for="u-r">{{ 'admin.users.role' | transloco }}</label>
        <select id="u-r" name="role" class="input" [(ngModel)]="draft.role">
          @for (r of roles; track r) {
            <option [value]="r">{{ 'roles.' + r | transloco }}</option>
          }
        </select>
      </div>
      <div>
        <label class="label" for="u-l">{{ 'admin.users.locale' | transloco }}</label>
        <select id="u-l" name="locale" class="input" [(ngModel)]="draft.locale">
          <option value="de">DE</option>
          <option value="en">EN</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary" [disabled]="!draft.email || !draft.displayName">
        <app-icon name="plus" [size]="16" />{{ 'admin.users.new' | transloco }}
      </button>
    </form>
    <div class="card overflow-x-auto p-0">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
            <th scope="col" class="px-4 py-3">{{ 'admin.users.displayName' | transloco }}</th>
            <th scope="col" class="px-4 py-3">{{ 'admin.users.role' | transloco }}</th>
            <th scope="col" class="px-4 py-3">{{ 'admin.users.lastLogin' | transloco }}</th>
            <th scope="col" class="px-4 py-3">{{ 'admin.users.twoFactor' | transloco }}</th>
            <th scope="col" class="px-4 py-3">
              <span class="sr-only">{{ 'common.actions' | transloco }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          @for (u of users(); track u.id) {
            <tr class="border-b border-line last:border-0" [class.opacity-60]="!u.isActive">
              <td class="px-4 py-3">
                <b>{{ u.displayName }}</b>
                @if (u.id === auth.me()?.id) {
                  <span class="tag ml-1">{{ 'admin.users.you' | transloco }}</span>
                }
                <span class="block text-xs text-muted">{{ u.email }}</span>
                @if (!u.isActive) {
                  <span class="tag tag-muted mt-1">{{ 'admin.users.inactive' | transloco }}</span>
                }
                @if (u.lockedUntil) {
                  <span class="tag tag-danger mt-1">{{
                    'admin.users.locked' | transloco: { date: locale.dateTime(u.lockedUntil) }
                  }}</span>
                }
              </td>
              <td class="px-4 py-3">
                <label class="sr-only" [for]="'role-' + u.id">{{
                  'admin.users.role' | transloco
                }}</label>
                <select
                  [id]="'role-' + u.id"
                  class="input w-auto py-1"
                  [value]="u.role"
                  [disabled]="u.id === auth.me()?.id"
                  (change)="update(u, { role: $any($event.target).value })"
                >
                  @for (r of roles; track r) {
                    <option [value]="r">{{ 'roles.' + r | transloco }}</option>
                  }
                </select>
              </td>
              <td class="px-4 py-3">{{ locale.dateTime(u.lastLoginAt) }}</td>
              <td class="px-4 py-3">
                <span
                  class="tag"
                  [class.tag-ok]="u.totpEnabled"
                  [class.tag-muted]="!u.totpEnabled"
                  >{{ (u.totpEnabled ? 'account.totpOn' : 'account.totpOff') | transloco }}</span
                >
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <button type="button" class="btn btn-sm" (click)="resetLink(u)">
                  {{ 'admin.users.resetLink' | transloco }}
                </button>
                @if (u.lockedUntil) {
                  <button type="button" class="btn btn-sm ml-1" (click)="unlock(u)">
                    {{ 'admin.users.unlock' | transloco }}
                  </button>
                }
                @if (u.totpEnabled) {
                  <button type="button" class="btn btn-sm ml-1" (click)="resetTotp(u)">
                    {{ 'admin.users.resetTotp' | transloco }}
                  </button>
                }
                @if (u.id !== auth.me()?.id) {
                  <button
                    type="button"
                    class="btn btn-sm btn-danger ml-1"
                    (click)="update(u, { isActive: !u.isActive })"
                  >
                    {{
                      (u.isActive ? 'admin.users.deactivate' : 'admin.users.activate') | transloco
                    }}
                  </button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class UsersPage {
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  protected readonly locale = inject(LocaleService);
  protected readonly roles = ROLES;
  protected readonly users = signal<User[]>([]);
  protected draft: { email: string; displayName: string; role: Role; locale: 'de' | 'en' } = {
    email: '',
    displayName: '',
    role: 'egypt_editor',
    locale: 'de',
  };

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.users.set(await this.api.listUsers());
    } catch (err) {
      this.errors.show(err);
    }
  }

  private async act(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      this.toast.success(msg);
      await this.load();
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected create() {
    return this.act(async () => {
      await this.api.createUser(this.draft);
      this.draft = { email: '', displayName: '', role: 'egypt_editor', locale: 'de' };
    }, 'admin.users.created');
  }
  protected update(u: User, patch: Partial<Pick<User, 'role' | 'isActive'>>) {
    return this.act(() => this.api.updateUser(u.id, patch), 'admin.users.saved');
  }
  protected resetLink(u: User) {
    return this.act(() => this.api.sendResetLink(u.id), 'admin.users.resetLinkSent');
  }
  protected unlock(u: User) {
    return this.act(() => this.api.unlockUser(u.id), 'admin.users.saved');
  }
  protected resetTotp(u: User) {
    return this.act(() => this.api.resetTotp(u.id), 'admin.users.saved');
  }
}
