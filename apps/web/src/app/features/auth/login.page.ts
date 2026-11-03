import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api/api.service';
import { toApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { ErrorService } from '../../core/ui/errors.service';
import { AuthFrameComponent } from './auth-frame.component';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, TranslocoPipe, AuthFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-frame>
      @if (mode() === 'login') {
        <h1>{{ 'auth.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted">{{ 'auth.subtitle' | transloco }}</p>
        @if (expired()) {
          <p class="mt-4 rounded-lg bg-warn-light px-3 py-2 text-sm text-warn" role="status">
            {{ 'auth.expired' | transloco }}
          </p>
        }
        <form class="mt-6 grid gap-4" (ngSubmit)="submit()" novalidate>
          <div>
            <label class="label" for="email">{{ 'auth.email' | transloco }}</label>
            <input
              id="email"
              name="email"
              type="email"
              class="input"
              autocomplete="username"
              required
              [(ngModel)]="email"
              [disabled]="needTotp()"
            />
          </div>
          <div>
            <label class="label" for="password">{{ 'auth.password' | transloco }}</label>
            <input
              id="password"
              name="password"
              type="password"
              class="input"
              autocomplete="current-password"
              required
              [(ngModel)]="password"
              [disabled]="needTotp()"
            />
          </div>
          @if (needTotp()) {
            <div>
              <p class="mb-2 text-sm text-muted">{{ 'auth.totpHint' | transloco }}</p>
              <label class="label" for="totp">{{ 'auth.totp' | transloco }}</label>
              <input
                id="totp"
                name="totp"
                class="input tracking-widest"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                pattern="[0-9]{6}"
                required
                [(ngModel)]="totp"
              />
            </div>
          }
          @if (error()) {
            <p class="field-error text-sm" role="alert">{{ error() }}</p>
          }
          <button type="submit" class="btn btn-primary w-full" [disabled]="busy()">
            {{ 'auth.login' | transloco }}
          </button>
          <button
            type="button"
            class="text-sm font-semibold text-brand hover:underline"
            (click)="mode.set('forgot')"
          >
            {{ 'auth.forgot' | transloco }}
          </button>
        </form>
      } @else {
        <h1>{{ 'auth.forgotTitle' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted">{{ 'auth.forgotHint' | transloco }}</p>
        <form class="mt-6 grid gap-4" (ngSubmit)="forgot()">
          <div>
            <label class="label" for="femail">{{ 'auth.email' | transloco }}</label>
            <input
              id="femail"
              name="femail"
              type="email"
              class="input"
              autocomplete="email"
              required
              [(ngModel)]="email"
            />
          </div>
          @if (sent()) {
            <p class="rounded-lg bg-ok-light px-3 py-2 text-sm text-ok" role="status">
              {{ 'auth.forgotSent' | transloco }}
            </p>
          }
          <button type="submit" class="btn btn-primary w-full" [disabled]="busy() || !email">
            {{ 'auth.sendLink' | transloco }}
          </button>
          <button
            type="button"
            class="text-sm font-semibold text-brand hover:underline"
            (click)="mode.set('login')"
          >
            {{ 'auth.backToLogin' | transloco }}
          </button>
        </form>
      }
    </app-auth-frame>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly errors = inject(ErrorService);

  readonly returnUrl = input<string>();
  readonly expired = input<string>();

  protected readonly mode = signal<'login' | 'forgot'>('login');
  protected readonly busy = signal(false);
  protected readonly needTotp = signal(false);
  protected readonly error = signal('');
  protected readonly sent = signal(false);
  protected email = '';
  protected password = '';
  protected totp = '';

  async submit() {
    if (!this.email || !this.password) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.csrf();
      await this.auth.login(
        this.email.trim(),
        this.password,
        this.needTotp() ? this.totp : undefined,
      );
      const target = this.returnUrl();
      await this.router.navigateByUrl(
        target && target.startsWith('/') && !target.startsWith('//') ? target : '/developers',
      );
    } catch (err) {
      const e = toApiError(err);
      if (e.code === 'TOTP_REQUIRED') this.needTotp.set(true);
      this.error.set(e.code === 'TOTP_REQUIRED' ? '' : this.errors.message(err));
    } finally {
      this.busy.set(false);
    }
  }

  async forgot() {
    this.busy.set(true);
    try {
      await this.api.csrf();
      await this.api.forgotPassword(this.email.trim());
      this.sent.set(true);
    } catch (err) {
      this.errors.show(err);
    } finally {
      this.busy.set(false);
    }
  }
}
