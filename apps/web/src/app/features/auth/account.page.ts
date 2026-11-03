import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Locale } from '@meridian/shared';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-account-page',
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'account.title' | transloco }}</h1>
    @if (enroll() || auth.me()?.mustEnrollTotp) {
      <p class="mt-4 rounded-xl bg-warn-light px-4 py-3 text-sm font-medium text-warn" role="alert">
        {{ 'account.enrollRequired' | transloco }}
      </p>
    }
    <div class="mt-6 grid max-w-3xl gap-5">
      <section class="card" aria-labelledby="profile-h">
        <h2 id="profile-h" class="section-title">{{ 'account.profile' | transloco }}</h2>
        <p class="font-semibold">{{ auth.me()?.displayName }}</p>
        <p class="text-sm text-muted">
          {{ auth.me()?.email }} · {{ 'roles.' + auth.me()?.role | transloco }}
        </p>
        <label class="label mt-4" for="lang">{{ 'account.language' | transloco }}</label>
        <select
          id="lang"
          class="input max-w-xs"
          [ngModel]="locale.lang()"
          (ngModelChange)="setLang($event)"
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </section>

      <section class="card" aria-labelledby="totp-h">
        <h2 id="totp-h" class="section-title">{{ 'account.totpTitle' | transloco }}</h2>
        <p class="text-sm">
          <span
            class="tag"
            [class.tag-ok]="auth.me()?.totpEnabled"
            [class.tag-muted]="!auth.me()?.totpEnabled"
          >
            {{ (auth.me()?.totpEnabled ? 'account.totpOn' : 'account.totpOff') | transloco }}
          </span>
        </p>
        @if (setup(); as s) {
          <p class="mt-4 text-sm">{{ 'account.totpScan' | transloco }}</p>
          <code class="mt-2 block rounded-lg bg-slate-100 p-3 text-sm break-all">{{
            s.secret
          }}</code>
          <a
            class="mt-2 inline-block text-sm font-semibold text-brand hover:underline"
            [href]="s.otpauthUrl"
            >{{ 'account.totpOpenApp' | transloco }}</a
          >
        }
        <form class="mt-4 flex flex-wrap items-end gap-3" (ngSubmit)="totpAction()">
          @if (setup() || auth.me()?.totpEnabled) {
            <div>
              <label class="label" for="code">{{ 'account.totpCode' | transloco }}</label>
              <input
                id="code"
                name="code"
                class="input w-40 tracking-widest"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                [(ngModel)]="code"
              />
            </div>
          }
          @if (auth.me()?.totpEnabled) {
            <button type="submit" class="btn btn-danger" [disabled]="code.length !== 6">
              {{ 'account.totpDisable' | transloco }}
            </button>
          } @else if (setup()) {
            <button type="submit" class="btn btn-primary" [disabled]="code.length !== 6">
              {{ 'account.totpEnable' | transloco }}
            </button>
          } @else {
            <button type="button" class="btn btn-primary" (click)="startSetup()">
              {{ 'account.totpSetup' | transloco }}
            </button>
          }
        </form>
      </section>

      @if (!auth.me()?.mustEnrollTotp) {
        <section class="card" aria-labelledby="pw-h">
          <h2 id="pw-h" class="section-title">{{ 'account.changePassword' | transloco }}</h2>
          <p class="mb-3 text-sm text-muted">{{ 'auth.passwordRules' | transloco }}</p>
          <form class="grid max-w-md gap-3" (ngSubmit)="changePassword()">
            <div>
              <label class="label" for="cur">{{ 'account.currentPassword' | transloco }}</label>
              <input
                id="cur"
                name="cur"
                type="password"
                class="input"
                autocomplete="current-password"
                [(ngModel)]="current"
              />
            </div>
            <div>
              <label class="label" for="new">{{ 'auth.newPassword' | transloco }}</label>
              <input
                id="new"
                name="new"
                type="password"
                class="input"
                autocomplete="new-password"
                minlength="12"
                [(ngModel)]="next"
              />
            </div>
            <button
              type="submit"
              class="btn btn-primary w-fit"
              [disabled]="!current || next.length < 12"
            >
              {{ 'common.save' | transloco }}
            </button>
          </form>
        </section>

        <section class="card" aria-labelledby="sess-h">
          <h2 id="sess-h" class="section-title">{{ 'account.sessions' | transloco }}</h2>
          <button type="button" class="btn" (click)="auth.logout(true)">
            {{ 'account.logoutAll' | transloco }}
          </button>
        </section>
      }
    </div>
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  readonly enroll = input<string>();
  protected readonly setup = signal<{ secret: string; otpauthUrl: string } | null>(null);
  protected code = '';
  protected current = '';
  protected next = '';

  async setLang(l: Locale) {
    this.locale.set(l);
    try {
      this.auth.setMe(await this.api.updateMe(l));
    } catch (err) {
      this.errors.show(err);
    }
  }

  async startSetup() {
    try {
      this.setup.set(await this.api.totpSetup());
    } catch (err) {
      this.errors.show(err);
    }
  }

  async totpAction() {
    try {
      if (this.auth.me()?.totpEnabled) {
        await this.api.totpDisable(this.code);
        this.auth.setMe({ ...this.auth.me()!, totpEnabled: false });
        this.toast.success('account.totpDisabled');
      } else {
        this.auth.setMe(await this.api.totpEnable(this.code));
        this.setup.set(null);
        this.toast.success('account.totpEnabled');
      }
      this.code = '';
    } catch (err) {
      this.errors.show(err);
    }
  }

  async changePassword() {
    try {
      await this.api.changePassword(this.current, this.next);
      this.current = '';
      this.next = '';
      this.toast.success('account.passwordChanged');
    } catch (err) {
      this.errors.show(err);
    }
  }
}
