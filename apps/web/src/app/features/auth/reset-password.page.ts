import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api/api.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';
import { AuthFrameComponent } from './auth-frame.component';

@Component({
  selector: 'app-reset-password-page',
  imports: [FormsModule, TranslocoPipe, AuthFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-frame>
      <h1>{{ 'auth.resetTitle' | transloco }}</h1>
      <p class="mt-1 text-sm text-muted">{{ 'auth.passwordRules' | transloco }}</p>
      @if (!token()) {
        <p class="field-error mt-4" role="alert">{{ 'auth.missingToken' | transloco }}</p>
      } @else {
        <form class="mt-6 grid gap-4" (ngSubmit)="submit()">
          <div>
            <label class="label" for="pw1">{{ 'auth.newPassword' | transloco }}</label>
            <input
              id="pw1"
              name="pw1"
              type="password"
              class="input"
              autocomplete="new-password"
              minlength="12"
              required
              [(ngModel)]="pw1"
            />
          </div>
          <div>
            <label class="label" for="pw2">{{ 'auth.repeatPassword' | transloco }}</label>
            <input
              id="pw2"
              name="pw2"
              type="password"
              class="input"
              autocomplete="new-password"
              required
              [(ngModel)]="pw2"
            />
          </div>
          @if (error()) {
            <p class="field-error" role="alert">{{ error() | transloco }}</p>
          }
          <button type="submit" class="btn btn-primary w-full" [disabled]="busy()">
            {{ 'auth.setPassword' | transloco }}
          </button>
        </form>
      }
    </app-auth-frame>
  `,
})
export class ResetPasswordPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  readonly token = input<string>();
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected pw1 = '';
  protected pw2 = '';

  async submit() {
    if (this.pw1 !== this.pw2) {
      this.error.set('auth.mismatch');
      return;
    }
    this.error.set('');
    this.busy.set(true);
    try {
      await this.api.csrf();
      await this.api.resetPassword(this.token()!, this.pw1);
      this.toast.success('auth.resetDone');
      await this.router.navigateByUrl('/login');
    } catch (err) {
      this.error.set(this.errors.message(err));
    } finally {
      this.busy.set(false);
    }
  }
}
